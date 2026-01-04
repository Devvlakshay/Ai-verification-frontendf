#!/usr/bin/env python3
"""
Convert YOLOv8 PyTorch model to ONNX format for browser-based inference.
This script exports the model with optimizations for web deployment.
"""

import os
import sys
from pathlib import Path

def convert_to_onnx():
    """Convert YOLOv8 model to ONNX format optimized for browser."""
    
    try:
        from ultralytics import YOLO
    except ImportError:
        print("Installing ultralytics...")
        os.system(f"{sys.executable} -m pip install ultralytics")
        from ultralytics import YOLO
    
    # Paths
    model_path = Path(__file__).parent / "models" / "best4.pt"
    output_dir = Path(__file__).parent.parent / "public" / "models"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Loading model from: {model_path}")
    
    if not model_path.exists():
        print(f"❌ Model not found at {model_path}")
        sys.exit(1)
    
    # Load the YOLOv8 model
    model = YOLO(str(model_path))
    
    # Export to ONNX with web-optimized settings
    print("\n📦 Exporting to ONNX format...")
    
    # Export with smaller input size for faster browser inference
    export_path = model.export(
        format="onnx",
        imgsz=640,           # Image size (can reduce to 320 for faster inference)
        simplify=True,        # Simplify ONNX graph
        opset=12,             # ONNX opset version (12 is well supported)
        dynamic=False,        # Static input size for better web performance
        half=False,           # Use float32 for better browser compatibility
    )
    
    # Move to public/models directory
    import shutil
    final_path = output_dir / "aadhaar_detector.onnx"
    shutil.move(export_path, final_path)
    
    print(f"\n✅ Model exported successfully!")
    print(f"📁 Output: {final_path}")
    print(f"📊 Size: {final_path.stat().st_size / 1024 / 1024:.2f} MB")
    
    # Also create a smaller model for slower devices
    print("\n📦 Creating smaller model variant (320px)...")
    export_path_small = model.export(
        format="onnx",
        imgsz=320,            # Smaller size for faster inference
        simplify=True,
        opset=12,
        dynamic=False,
        half=False,
    )
    
    final_path_small = output_dir / "aadhaar_detector_small.onnx"
    shutil.move(export_path_small, final_path_small)
    
    print(f"✅ Small model exported!")
    print(f"📁 Output: {final_path_small}")
    print(f"📊 Size: {final_path_small.stat().st_size / 1024 / 1024:.2f} MB")
    
    # Create model info JSON
    model_info = {
        "name": "aadhaar_detector",
        "version": "1.0.0",
        "inputSize": 640,
        "inputSizeSmall": 320,
        "classes": ["aadhaar_front", "aadhaar_back", "print_aadhaar"],
        "format": "onnx",
        "opset": 12,
    }
    
    import json
    info_path = output_dir / "model_info.json"
    with open(info_path, "w") as f:
        json.dump(model_info, f, indent=2)
    
    print(f"\n📋 Model info saved to: {info_path}")
    print("\n🎉 Conversion complete! Models ready for browser deployment.")

if __name__ == "__main__":
    convert_to_onnx()
