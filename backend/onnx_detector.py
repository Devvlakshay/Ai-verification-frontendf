#!/usr/bin/env python3
"""
Aadhaar Card ONNX Detector
Loads the ONNX model and detects Aadhaar cards in images.
"""

import os
import sys
import cv2
import numpy as np
import onnxruntime as ort
from pathlib import Path

# Model configuration
MODEL_PATH = Path(__file__).parent.parent / "public" / "models" / "aadhaar_detector.onnx"
MODEL_INPUT_SIZE = 640
# Model class order: index 0 = back, index 1 = front, index 2 = print
CLASS_NAMES = ["aadhaar_back", "aadhaar_front", "print_aadhaar"]
CONFIDENCE_THRESHOLD = 0.25


class AadhaarDetector:
    def __init__(self, model_path: str = None):
        self.model_path = model_path or str(MODEL_PATH)
        self.session = None
        self.input_name = None
        self.output_name = None
        self._load_model()

    def _load_model(self):
        """Load the ONNX model"""
        print(f"Loading model from: {self.model_path}")
        
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"Model not found at {self.model_path}")
        
        # Create ONNX Runtime session
        self.session = ort.InferenceSession(
            self.model_path,
            providers=['CPUExecutionProvider']
        )
        
        # Get input/output names
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name
        
        input_shape = self.session.get_inputs()[0].shape
        output_shape = self.session.get_outputs()[0].shape
        
        print(f"✅ Model loaded successfully")
        print(f"   Input name: {self.input_name}, shape: {input_shape}")
        print(f"   Output name: {self.output_name}, shape: {output_shape}")

    def preprocess(self, image: np.ndarray) -> np.ndarray:
        """Preprocess image for model input"""
        # Resize to model input size
        resized = cv2.resize(image, (MODEL_INPUT_SIZE, MODEL_INPUT_SIZE))
        
        # Convert BGR to RGB
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        
        # Normalize to 0-1
        normalized = rgb.astype(np.float32) / 255.0
        
        # Convert to CHW format (channels first)
        chw = np.transpose(normalized, (2, 0, 1))
        
        # Add batch dimension
        batch = np.expand_dims(chw, axis=0)
        
        return batch

    def detect(self, image: np.ndarray) -> dict:
        """
        Detect Aadhaar card in image
        
        Args:
            image: BGR image from cv2.imread()
            
        Returns:
            dict with detection results
        """
        original_height, original_width = image.shape[:2]
        
        # Preprocess
        input_tensor = self.preprocess(image)
        
        # Run inference
        outputs = self.session.run([self.output_name], {self.input_name: input_tensor})
        output = outputs[0]
        
        print(f"📊 Output shape: {output.shape}")
        
        # Parse YOLO output: [1, 7, 8400] for YOLOv8
        # Format: [batch, channels, detections]
        # Channels: [x, y, w, h, class0_conf, class1_conf, class2_conf]
        
        num_detections = output.shape[2]
        
        best_detection = {
            "detected": False,
            "card_type": None,
            "confidence": 0.0,
            "bbox": None
        }
        
        all_detections = []
        
        for i in range(num_detections):
            # Get class scores
            class_scores = []
            for c in range(3):
                score = output[0, 4 + c, i]
                class_scores.append(score)
            
            max_score = max(class_scores)
            max_class_idx = class_scores.index(max_score)
            
            if max_score > 0.1:  # Log detections above 0.1
                all_detections.append({
                    "idx": i,
                    "class": CLASS_NAMES[max_class_idx],
                    "score": float(max_score)
                })
            
            if max_score > CONFIDENCE_THRESHOLD and max_score > best_detection["confidence"]:
                # Get bounding box
                x_center = output[0, 0, i]
                y_center = output[0, 1, i]
                width = output[0, 2, i]
                height = output[0, 3, i]
                
                # Scale to original image dimensions
                scale_x = original_width / MODEL_INPUT_SIZE
                scale_y = original_height / MODEL_INPUT_SIZE
                
                best_detection = {
                    "detected": True,
                    "card_type": CLASS_NAMES[max_class_idx],
                    "confidence": float(max_score),
                    "bbox": {
                        "x": float((x_center - width / 2) * scale_x),
                        "y": float((y_center - height / 2) * scale_y),
                        "width": float(width * scale_x),
                        "height": float(height * scale_y)
                    }
                }
        
        # Sort and show top detections
        all_detections.sort(key=lambda x: x["score"], reverse=True)
        if all_detections:
            print(f"🔍 Top 5 detections:")
            for det in all_detections[:5]:
                print(f"   {det['class']}: {det['score']:.4f}")
        
        return best_detection

    def detect_from_file(self, image_path: str) -> dict:
        """Load image from file and detect"""
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found: {image_path}")
        
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError(f"Failed to load image: {image_path}")
        
        print(f"📷 Image loaded: {image_path} ({image.shape[1]}x{image.shape[0]})")
        return self.detect(image)

    def detect_from_base64(self, base64_str: str) -> dict:
        """Detect from base64 encoded image"""
        import base64
        
        # Remove data URL prefix if present
        if "," in base64_str:
            base64_str = base64_str.split(",")[1]
        
        # Decode base64
        img_bytes = base64.b64decode(base64_str)
        img_array = np.frombuffer(img_bytes, dtype=np.uint8)
        image = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        
        if image is None:
            raise ValueError("Failed to decode base64 image")
        
        print(f"📷 Base64 image decoded: {image.shape[1]}x{image.shape[0]}")
        return self.detect(image)


def main():
    """Test the detector with sample images"""
    print("=" * 60)
    print("Aadhaar ONNX Detector Test")
    print("=" * 60)
    
    # Initialize detector
    try:
        detector = AadhaarDetector()
    except Exception as e:
        print(f"❌ Failed to load model: {e}")
        sys.exit(1)
    
    # Test with command line argument or default test
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
        print(f"\n🔍 Testing with: {image_path}")
        try:
            result = detector.detect_from_file(image_path)
            print(f"\n📋 Result:")
            print(f"   Detected: {result['detected']}")
            print(f"   Card Type: {result['card_type']}")
            print(f"   Confidence: {result['confidence']:.4f}")
            if result['bbox']:
                print(f"   BBox: x={result['bbox']['x']:.0f}, y={result['bbox']['y']:.0f}, "
                      f"w={result['bbox']['width']:.0f}, h={result['bbox']['height']:.0f}")
        except Exception as e:
            print(f"❌ Error: {e}")
    else:
        print("\n📝 Usage: python onnx_detector.py <image_path>")
        print("   Example: python onnx_detector.py test_aadhaar.jpg")
        
        # Try to find any test images
        test_dirs = [
            Path(__file__).parent / "temp" / "downloads",
            Path(__file__).parent.parent / "public" / "uploads",
        ]
        
        for test_dir in test_dirs:
            if test_dir.exists():
                for img_file in test_dir.rglob("*.jpg"):
                    print(f"\n🔍 Found test image: {img_file}")
                    try:
                        result = detector.detect_from_file(str(img_file))
                        print(f"   Result: {result['card_type']} ({result['confidence']:.2%})" if result['detected'] else "   No detection")
                    except Exception as e:
                        print(f"   Error: {e}")
                    break
                for img_file in test_dir.rglob("*.png"):
                    print(f"\n🔍 Found test image: {img_file}")
                    try:
                        result = detector.detect_from_file(str(img_file))
                        print(f"   Result: {result['card_type']} ({result['confidence']:.2%})" if result['detected'] else "   No detection")
                    except Exception as e:
                        print(f"   Error: {e}")
                    break


if __name__ == "__main__":
    main()
