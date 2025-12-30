import asyncio
import hashlib
import logging
import os
import shutil
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional

import aiofiles
import aiohttp
import cv2
import torch
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import JSONResponse
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


# --- Card Detection Pipeline ---

class AadhaarCardDetector:
    """Simple pipeline to detect Aadhaar front and back cards"""
    
    def __init__(self, model_path: str):
        """Initialize the detector with YOLO model"""
        # Check CUDA availability
        if torch.cuda.is_available():
            self.device = "cuda"
            logger.info(f"CUDA available. Using GPU: {torch.cuda.get_device_name(0)}")
        else:
            self.device = "cpu"
            logger.info("CUDA not available. Using CPU")
        
        # Load YOLO model
        logger.info(f"Loading YOLO model from {model_path}")
        if not Path(model_path).exists():
            logger.critical(f"Model not found at {model_path}")
            raise FileNotFoundError(f"Model not found at {model_path}")
        
        self.model = YOLO(model_path)
        self.card_classes = {i: name for i, name in self.model.names.items()}
        logger.info(f"Model loaded successfully. Classes: {self.card_classes}")
    
    def detect_cards(
        self, 
        front_image_path: Optional[str] = None, 
        back_image_path: Optional[str] = None, 
        confidence_threshold: float = 0.15
    ) -> dict:
        """
        Detect Aadhaar cards in front and/or back images
        
        Args:
            front_image_path: Path to front image (optional)
            back_image_path: Path to back image (optional)
            confidence_threshold: Minimum confidence for detection
            
        Returns:
            Dictionary with detection results
        """
        logger.info(f"Starting card detection (threshold: {confidence_threshold})")
        
        result = {
            "front_detected": False,
            "back_detected": False,
            "front_confidence": 0.0,
            "back_confidence": 0.0,
            "print_aadhar_detected": False,
            "details": {
                "front": [],
                "back": []
            }
        }
        
        # Detect in front image if path is provided
        if front_image_path and os.path.exists(front_image_path):
            try:
                logger.info(f"Processing front image: {Path(front_image_path).name}")
                front_results = self.model(str(front_image_path), device=self.device)
                
                for box in front_results[0].boxes:
                    confidence = float(box.conf[0])
                    if confidence < confidence_threshold:
                        continue
                    
                    class_id = int(box.cls[0])
                    class_name = self.card_classes.get(class_id, "unknown")
                    
                    if class_name == 'print_aadhar':
                        result["print_aadhar_detected"] = True
                        logger.warning("Print Aadhaar detected in front image!")
                        # Potentially return early if this is a hard failure
                        # return result
                    
                    elif class_name == 'aadhar_front':
                        result["front_detected"] = True
                        result["front_confidence"] = confidence
                        result["details"]["front"].append({
                            "class": class_name,
                            "confidence": confidence
                        })
                        logger.info(f"✓ Front card detected (confidence: {confidence:.2%})")
            
            except Exception as e:
                logger.error(f"Error processing front image: {e}")
                result["details"]["front"].append({"error": str(e)})
        elif front_image_path:
            # Path was provided but file not found
            result["details"]["front"].append({"error": "Front image not found at path"})
            logger.error(f"Front image not found at {front_image_path}")

        # Detect in back image if path is provided
        if back_image_path and os.path.exists(back_image_path):
            try:
                logger.info(f"Processing back image: {Path(back_image_path).name}")
                back_results = self.model(str(back_image_path), device=self.device)
                
                for box in back_results[0].boxes:
                    confidence = float(box.conf[0])
                    if confidence < confidence_threshold:
                        continue
                    
                    class_id = int(box.cls[0])
                    class_name = self.card_classes.get(class_id, "unknown")
                    
                    if class_name == 'print_aadhar':
                        result["print_aadhar_detected"] = True
                        logger.warning("Print Aadhaar detected in back image!")
                        # return result
                    
                    elif class_name == 'aadhar_back':
                        result["back_detected"] = True
                        result["back_confidence"] = confidence
                        result["details"]["back"].append({
                            "class": class_name,
                            "confidence": confidence
                        })
                        logger.info(f"✓ Back card detected (confidence: {confidence:.2%})")
            
            except Exception as e:
                logger.error(f"Error processing back image: {e}")
                result["details"]["back"].append({"error": str(e)})
        elif back_image_path:
            # Path was provided but file not found
            result["details"]["back"].append({"error": "Back image not found at path"})
            logger.error(f"Back image not found at {back_image_path}")
        
        return result


# --- FastAPI Application ---

app = FastAPI(
    title="Aadhaar Card Detection API",
    description="Simple API to detect Aadhaar front and back cards",
    version="1.0.0"
)


class Config:
    """Application configuration"""
    BASE_DIR = Path(__file__).parent
    MODEL_PATH = BASE_DIR / os.environ.get("MODEL1_PATH", "models/best4.pt")
    DOWNLOAD_DIR = BASE_DIR / Path(os.environ.get("DOWNLOAD_DIR", "temp/downloads"))
    DEFAULT_CONFIDENCE_THRESHOLD = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.15"))


config = Config()
detector: Optional[AadhaarCardDetector] = None


class DetectionRequest(BaseModel):
    """Request model for card detection"""
    user_id: str
    passport_first: Optional[str] = None
    passport_old: Optional[str] = None
    confidence_threshold: float = config.DEFAULT_CONFIDENCE_THRESHOLD


@app.on_event("startup")
async def startup_event():
    """Initialize the detector on startup"""
    global detector
    try:
        # Create necessary directories
        config.DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
        
        # Initialize detector
        detector = AadhaarCardDetector(model_path=str(config.MODEL_PATH))
        logger.info("✓ Detector initialized successfully")
        
    except Exception as e:
        logger.critical(f"Failed to initialize detector: {e}", exc_info=True)
        sys.exit(1)


async def download_image(
    session: aiohttp.ClientSession, 
    url: str, 
    filepath: Path
) -> bool:
    """Download image from URL or copy from local path"""
    try:
        # Check if the URL is a local file path
        if os.path.exists(url):
            shutil.copy(url, filepath)
            logger.info(f"✓ Copied local file: {filepath.name}")
            return True
        else:
            async with session.get(str(url), timeout=30) as response:
                response.raise_for_status()
                async with aiofiles.open(filepath, 'wb') as f:
                    await f.write(await response.read())
                logger.info(f"✓ Downloaded: {filepath.name}")
                return True
    except Exception as e:
        logger.error(f"✗ Failed to process image from {url}: {e}")
        return False


@app.post("/detect", response_class=JSONResponse, tags=["Detection"])
async def detect_aadhaar_cards(request: DetectionRequest):
    """
    Detect Aadhaar front and/or back cards from provided URLs.
    Handles requests with one or both image URLs.
    """
    if detector is None:
        return JSONResponse(
            status_code=503,
            content={"success": False, "message": "Detector not initialized"}
        )

    # Check if at least one image URL is provided
    if not request.passport_first and not request.passport_old:
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": "At least one image URL (passport_first or passport_old) is required."}
        )
    
    # Generate unique task ID
    task_id = hashlib.md5(
        f"{request.user_id}_{datetime.now().timestamp()}".encode()
    ).hexdigest()
    
    # Create temporary directory for downloads
    user_dir = config.DOWNLOAD_DIR / request.user_id / task_id
    user_dir.mkdir(parents=True, exist_ok=True)
    
    front_path = user_dir / "front.jpg"
    back_path = user_dir / "back.jpg"
    
    logger.info(f"Processing request for user_id={request.user_id}, task_id={task_id}")
    
    try:
        front_downloaded, back_downloaded = False, False
        
        async with aiohttp.ClientSession() as session:
            if request.passport_first:
                front_downloaded = await download_image(session, str(request.passport_first), front_path)
                if not front_downloaded:
                    # If a URL was provided but failed, it's an error
                    raise ValueError(f"Failed to download front image from {request.passport_first}")

            if request.passport_old:
                back_downloaded = await download_image(session, str(request.passport_old), back_path)
                if not back_downloaded:
                    raise ValueError(f"Failed to download back image from {request.passport_old}")
        
        # Perform card detection with potentially None paths
        detection_result = detector.detect_cards(
            front_image_path=str(front_path) if front_downloaded else None,
            back_image_path=str(back_path) if back_downloaded else None,
            confidence_threshold=request.confidence_threshold
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
        
        # Determine overall success and message
        front_ok = detection_result["front_detected"]
        back_ok = detection_result["back_detected"]
        
        # This covers all cases: front only, back only, or both
        both_provided_and_detected = front_ok and back_ok and front_downloaded and back_downloaded
        
        message = "Detection complete."
        if both_provided_and_detected:
            message = "Both Aadhaar cards detected successfully."
        elif front_ok:
            message = "Aadhaar front card detected successfully."
        elif back_ok:
            message = "Aadhaar back card detected successfully."
        else:
            missing = []
            if request.passport_first and not front_ok:
                missing.append("front")
            if request.passport_old and not back_ok:
                missing.append("back")
            if missing:
                message = f"Could not detect Aadhaar card(s): {', '.join(missing)}."
            else:
                message = "No Aadhaar card detected in the provided image(s)."

        # Prepare response data
        response_data = {
            "user_id": request.user_id,
            "front_detected": front_ok,
            "back_detected": back_ok,
            "front_confidence": detection_result["front_confidence"],
            "back_confidence": detection_result["back_confidence"],
            "both_detected": both_provided_and_detected,
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
        logger.error(f"Error during detection for task {task_id}: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "Internal server error", "error": str(e)}
        )
    
    finally:
        # Clean up downloaded files
        if user_dir.exists():
            shutil.rmtree(user_dir, ignore_errors=True)
            logger.info(f"✓ Cleaned up temporary files for task_id={task_id}")


@app.get("/health", tags=["Monitoring"])
async def health_check():
    """Check service health and detector status"""
    if detector and hasattr(detector, 'device'):
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "Service is healthy",
                "data": {
                    "detector_status": "initialized",
                    "device": detector.device,
                    "torch_version": torch.__version__,
                    "cuda_available": torch.cuda.is_available(),
                    "cuda_device_count": torch.cuda.device_count() if torch.cuda.is_available() else 0,
                    "cuda_device_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "N/A"
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
        "api": "Aadhaar Card Detection API",
        "version": "1.0.0",
        "description": "Simple API to detect Aadhaar front and back cards",
        "endpoints": {
            "POST /detect": "Detect Aadhaar cards from front and back URLs",
            "GET /health": "Check service health",
            "GET /": "API information"
        }
    }


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8109,
        reload=True
    )