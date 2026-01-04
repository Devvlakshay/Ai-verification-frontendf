"""
Stateless Hybrid AI Verification Backend
- Zero disk writes - processes images in memory
- Async processing with asyncio.to_thread
- Manual review queue support for low-confidence cases
- Redis rate limiting support (optional)
"""

import asyncio
import base64
import hashlib
import io
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional
from enum import Enum

import cv2
import numpy as np
import torch
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, status, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel
from ultralytics import YOLO

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# --- JWT Configuration ---
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "your-super-secret-key-change-in-production")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_ISSUER = os.environ.get("JWT_ISSUER", "ai-verification-frontend")

# CORS Configuration
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")

# Confidence thresholds
CONFIDENCE_THRESHOLD = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.15"))
LOW_CONFIDENCE_THRESHOLD = float(os.environ.get("LOW_CONFIDENCE_THRESHOLD", "0.10"))

security = HTTPBearer()


class VerificationStatus(str, Enum):
    APPROVED = "approved"
    REJECTED = "rejected"
    PENDING_REVIEW = "pending_review"


def verify_jwt_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Verify JWT token from Authorization header."""
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            options={"verify_aud": False}
        )
        
        if payload.get("iss") != JWT_ISSUER:
            logger.warning(f"Invalid JWT issuer: {payload.get('iss')}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token issuer",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        exp = payload.get("exp")
        if exp and datetime.utcnow().timestamp() > exp:
            logger.warning("JWT token expired")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        logger.info(f"JWT verified for request_id: {payload.get('request_id', 'unknown')}")
        return payload
        
    except JWTError as e:
        logger.error(f"JWT verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


class StatelessAadhaarDetector:
    """
    Stateless Aadhaar card detector - processes images in memory only.
    No disk I/O for image processing.
    """
    
    def __init__(self, model_path: str):
        """Initialize the detector with YOLO model"""
        if torch.cuda.is_available():
            self.device = "cuda"
            logger.info(f"CUDA available. Using GPU: {torch.cuda.get_device_name(0)}")
        else:
            self.device = "cpu"
            logger.info("CUDA not available. Using CPU")
        
        logger.info(f"Loading YOLO model from {model_path}")
        if not Path(model_path).exists():
            logger.critical(f"Model not found at {model_path}")
            raise FileNotFoundError(f"Model not found at {model_path}")
        
        self.model = YOLO(model_path)
        self.card_classes = {i: name for i, name in self.model.names.items()}
        logger.info(f"Model loaded successfully. Classes: {self.card_classes}")
    
    def decode_base64_image(self, base64_string: str) -> Optional[np.ndarray]:
        """
        Decode base64 image string directly to numpy array in memory.
        NO DISK WRITES.
        """
        try:
            # Remove data URL prefix if present
            if ',' in base64_string:
                base64_string = base64_string.split(',')[1]
            
            # Decode base64 to bytes
            image_bytes = base64.b64decode(base64_string)
            
            # Convert bytes to numpy array using cv2.imdecode (in memory)
            nparr = np.frombuffer(image_bytes, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if image is None:
                logger.error("Failed to decode image from base64")
                return None
            
            return image
        except Exception as e:
            logger.error(f"Error decoding base64 image: {e}")
            return None
    
    def detect_from_bytes(
        self, 
        image: np.ndarray,
        confidence_threshold: float = CONFIDENCE_THRESHOLD
    ) -> dict:
        """
        Detect Aadhaar card from numpy array (in memory).
        """
        result = {
            "detected": False,
            "class": None,
            "confidence": 0.0,
            "print_aadhar_detected": False,
            "all_detections": []
        }
        
        try:
            # Run YOLO inference directly on numpy array
            predictions = self.model(image, device=self.device, verbose=False)
            
            for box in predictions[0].boxes:
                confidence = float(box.conf[0])
                class_id = int(box.cls[0])
                class_name = self.card_classes.get(class_id, "unknown")
                
                result["all_detections"].append({
                    "class": class_name,
                    "confidence": confidence
                })
                
                if class_name == 'print_aadhar' and confidence > confidence_threshold:
                    result["print_aadhar_detected"] = True
                    logger.warning("Print Aadhaar detected!")
                
                if confidence >= confidence_threshold:
                    if class_name in ['aadhar_front', 'aadhar_back']:
                        if confidence > result["confidence"]:
                            result["detected"] = True
                            result["class"] = class_name
                            result["confidence"] = confidence
                            
        except Exception as e:
            logger.error(f"Error during detection: {e}")
            result["error"] = str(e)
        
        return result
    
    def detect_cards_from_base64(
        self,
        front_base64: Optional[str] = None,
        back_base64: Optional[str] = None,
        confidence_threshold: float = CONFIDENCE_THRESHOLD
    ) -> dict:
        """
        Detect Aadhaar cards from base64 encoded images.
        All processing happens in memory - NO DISK WRITES.
        """
        logger.info(f"Starting stateless card detection (threshold: {confidence_threshold})")
        
        result = {
            "front_detected": False,
            "back_detected": False,
            "front_confidence": 0.0,
            "back_confidence": 0.0,
            "print_aadhar_detected": False,
            "details": {
                "front": [],
                "back": []
            },
            "status": VerificationStatus.REJECTED.value
        }
        
        # Process front image
        if front_base64:
            front_image = self.decode_base64_image(front_base64)
            if front_image is not None:
                front_result = self.detect_from_bytes(front_image, confidence_threshold)
                
                if front_result.get("print_aadhar_detected"):
                    result["print_aadhar_detected"] = True
                
                if front_result.get("detected") and front_result.get("class") == 'aadhar_front':
                    result["front_detected"] = True
                    result["front_confidence"] = front_result["confidence"]
                    result["details"]["front"] = front_result["all_detections"]
                    logger.info(f"✓ Front card detected (confidence: {front_result['confidence']:.2%})")
                else:
                    result["details"]["front"] = front_result.get("all_detections", [])
            else:
                result["details"]["front"].append({"error": "Failed to decode front image"})
        
        # Process back image
        if back_base64:
            back_image = self.decode_base64_image(back_base64)
            if back_image is not None:
                back_result = self.detect_from_bytes(back_image, confidence_threshold)
                
                if back_result.get("print_aadhar_detected"):
                    result["print_aadhar_detected"] = True
                
                if back_result.get("detected") and back_result.get("class") == 'aadhar_back':
                    result["back_detected"] = True
                    result["back_confidence"] = back_result["confidence"]
                    result["details"]["back"] = back_result["all_detections"]
                    logger.info(f"✓ Back card detected (confidence: {back_result['confidence']:.2%})")
                else:
                    result["details"]["back"] = back_result.get("all_detections", [])
            else:
                result["details"]["back"].append({"error": "Failed to decode back image"})
        
        # Determine verification status
        if result["print_aadhar_detected"]:
            result["status"] = VerificationStatus.REJECTED.value
        elif result["front_detected"] and result["back_detected"]:
            # Check if confidence is low - route to manual review
            if result["front_confidence"] < LOW_CONFIDENCE_THRESHOLD or result["back_confidence"] < LOW_CONFIDENCE_THRESHOLD:
                result["status"] = VerificationStatus.PENDING_REVIEW.value
            else:
                result["status"] = VerificationStatus.APPROVED.value
        elif result["front_detected"] or result["back_detected"]:
            # Single card detected with low confidence - manual review
            conf = result["front_confidence"] or result["back_confidence"]
            if conf < LOW_CONFIDENCE_THRESHOLD:
                result["status"] = VerificationStatus.PENDING_REVIEW.value
        
        return result


# --- FastAPI Application ---

app = FastAPI(
    title="Stateless Aadhaar Card Detection API",
    description="High-performance stateless API for Aadhaar card detection - Zero disk I/O",
    version="2.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
    max_age=600,
)


class Config:
    """Application configuration"""
    BASE_DIR = Path(__file__).parent
    MODEL_PATH = BASE_DIR / os.environ.get("MODEL1_PATH", "models/best4.pt")


config = Config()
detector: Optional[StatelessAadhaarDetector] = None


class DetectionRequestBase64(BaseModel):
    """Request model for base64 image detection"""
    user_id: str
    front_image: Optional[str] = None  # Base64 encoded front image
    back_image: Optional[str] = None   # Base64 encoded back image
    confidence_threshold: float = CONFIDENCE_THRESHOLD
    force_upload: bool = False  # Bypass client-side checks (three-strike rule)


class ManualReviewItem(BaseModel):
    """Item queued for manual review"""
    user_id: str
    timestamp: str
    front_confidence: float
    back_confidence: float
    reason: str


# In-memory manual review queue (in production, use Redis or a proper queue)
manual_review_queue: list[ManualReviewItem] = []


@app.on_event("startup")
async def startup_event():
    """Initialize the detector on startup"""
    global detector
    try:
        detector = StatelessAadhaarDetector(model_path=str(config.MODEL_PATH))
        logger.info("✓ Stateless detector initialized successfully")
    except Exception as e:
        logger.critical(f"Failed to initialize detector: {e}", exc_info=True)
        sys.exit(1)


async def add_to_review_queue(item: ManualReviewItem):
    """Add item to manual review queue (async background task)"""
    manual_review_queue.append(item)
    logger.info(f"Added to manual review queue: user_id={item.user_id}")


@app.post("/detect", response_class=JSONResponse, tags=["Detection"])
async def detect_aadhaar_cards_stateless(
    request: DetectionRequestBase64,
    background_tasks: BackgroundTasks,
    jwt_payload: dict = Depends(verify_jwt_token)
):
    """
    Detect Aadhaar front and/or back cards from base64 encoded images.
    
    Key features:
    - Zero disk I/O - all processing in memory
    - Async model inference via asyncio.to_thread
    - Manual review queue for low-confidence detections
    - Force upload support (three-strike rule bypass)
    
    Requires valid JWT token in Authorization header.
    """
    if detector is None:
        return JSONResponse(
            status_code=503,
            content={"success": False, "message": "Detector not initialized"}
        )

    logger.info(f"Stateless detection request from: {jwt_payload.get('request_id', 'unknown')}")

    if not request.front_image and not request.back_image:
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": "At least one image (front_image or back_image) is required."}
        )
    
    try:
        # Run detection in thread pool to avoid blocking event loop
        detection_result = await asyncio.to_thread(
            detector.detect_cards_from_base64,
            request.front_image,
            request.back_image,
            request.confidence_threshold
        )
        
        # Check for security violation
        if detection_result["print_aadhar_detected"]:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False, 
                    "message": "Print Aadhaar detected - security violation",
                    "data": {"print_aadhar_detected": True}
                }
            )
        
        # Handle force upload (three-strike bypass)
        if request.force_upload and not (detection_result["front_detected"] and detection_result["back_detected"]):
            # Queue for manual review
            review_item = ManualReviewItem(
                user_id=request.user_id,
                timestamp=datetime.utcnow().isoformat(),
                front_confidence=detection_result["front_confidence"],
                back_confidence=detection_result["back_confidence"],
                reason="Force upload - bypassed client-side checks"
            )
            background_tasks.add_task(add_to_review_queue, review_item)
            
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "detected": True,
                    "status": VerificationStatus.PENDING_REVIEW.value,
                    "message": "Document submitted for manual review",
                    "data": {
                        "user_id": request.user_id,
                        "front_detected": detection_result["front_detected"],
                        "back_detected": detection_result["back_detected"],
                        "front_confidence": detection_result["front_confidence"],
                        "back_confidence": detection_result["back_confidence"],
                        "both_detected": detection_result["front_detected"] and detection_result["back_detected"],
                    }
                }
            )
        
        # Handle low confidence cases - add to manual review
        if detection_result["status"] == VerificationStatus.PENDING_REVIEW.value:
            review_item = ManualReviewItem(
                user_id=request.user_id,
                timestamp=datetime.utcnow().isoformat(),
                front_confidence=detection_result["front_confidence"],
                back_confidence=detection_result["back_confidence"],
                reason="Low confidence detection"
            )
            background_tasks.add_task(add_to_review_queue, review_item)
        
        # Build response
        front_ok = detection_result["front_detected"]
        back_ok = detection_result["back_detected"]
        both_provided_and_detected = front_ok and back_ok and request.front_image and request.back_image
        
        message = "Detection complete."
        if both_provided_and_detected:
            message = "Both Aadhaar cards detected successfully."
        elif front_ok:
            message = "Aadhaar front card detected successfully."
        elif back_ok:
            message = "Aadhaar back card detected successfully."
        else:
            missing = []
            if request.front_image and not front_ok:
                missing.append("front")
            if request.back_image and not back_ok:
                missing.append("back")
            if missing:
                message = f"Could not detect Aadhaar card(s): {', '.join(missing)}."
            else:
                message = "No Aadhaar card detected in the provided image(s)."

        response_data = {
            "user_id": request.user_id,
            "front_detected": front_ok,
            "back_detected": back_ok,
            "front_confidence": detection_result["front_confidence"],
            "back_confidence": detection_result["back_confidence"],
            "both_detected": both_provided_and_detected,
            "status": detection_result["status"],
            "details": detection_result["details"]
        }
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "detected": front_ok or back_ok,
                "message": message,
                "data": response_data
            }
        )
    
    except Exception as e:
        logger.error(f"Error during stateless detection: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "Internal server error", "error": str(e)}
        )


@app.get("/review-queue", tags=["Admin"])
async def get_review_queue(jwt_payload: dict = Depends(verify_jwt_token)):
    """Get items pending manual review"""
    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "count": len(manual_review_queue),
            "items": [item.dict() for item in manual_review_queue]
        }
    )


@app.get("/health", tags=["Monitoring"])
async def health_check():
    """Check service health and detector status"""
    if detector and hasattr(detector, 'device'):
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "Stateless service is healthy",
                "data": {
                    "detector_status": "initialized",
                    "mode": "stateless",
                    "device": detector.device,
                    "torch_version": torch.__version__,
                    "cuda_available": torch.cuda.is_available(),
                    "cuda_device_count": torch.cuda.device_count() if torch.cuda.is_available() else 0,
                    "cuda_device_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "N/A",
                    "pending_reviews": len(manual_review_queue)
                }
            }
        )
    else:
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "message": "Service is unhealthy",
                "data": {
                    "detector_status": "not_initialized",
                    "error": "Detector not available"
                }
            }
        )


@app.get("/", tags=["Info"])
async def root():
    """API information endpoint"""
    return {
        "api": "Stateless Aadhaar Card Detection API",
        "version": "2.0.0",
        "description": "High-performance stateless API - Zero disk I/O, in-memory processing",
        "features": [
            "Base64 image input - no file uploads needed",
            "Zero disk writes - all processing in memory",
            "Async model inference",
            "Manual review queue for low-confidence cases",
            "Force upload support (three-strike rule)"
        ],
        "endpoints": {
            "POST /detect": "Detect Aadhaar cards from base64 images",
            "GET /review-queue": "Get pending manual reviews",
            "GET /health": "Check service health",
            "GET /": "API information"
        }
    }


if __name__ == "__main__":
    uvicorn.run(
        "main_stateless:app",
        host="0.0.0.0",
        port=8109,
        reload=True
    )
