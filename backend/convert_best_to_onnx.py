#!/usr/bin/env python3
"""
Convert YOLOv8 PyTorch model (best.pt) to ONNX format for browser-based edge inference.
Optimized for lightweight and fast loading.
"""

import os
import sys
from pathlib import Path

def convert_to_onnx():
    """Convert YOLOv8 best.pt model to ONNX format optimized for browser."""
    
    try:
        from ultralytics import YOLO
    except ImportError:
        print("Installing ultralytics...")
        os.system(f"{sys.executable} -m pip install ultralytics")
        from ultralytics import YOLO
    
    # Paths
    model_path = Path(__file__).parent / "models" / "best.pt"
    output_dir = Path(__file__).parent.parent / "public" / "models"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Loading model from: {model_path}")
    
    if not model_path.exists():
        print(f"❌ Model not found at {model_path}")
        sys.exit(1)
    
    # Load the YOLOv8 model
    model = YOLO(str(model_path))
    
    # Print model info
    print("\n📋 Model Information:")
    print(f"   Classes: {model.names}")
    
    # Export to ONNX with web-optimized settings
    print("\n📦 Exporting to ONNX format (640px - optimized)...")
    
    # Export with standard input size for browser inference
    export_path = model.export(
        format="onnx",
        imgsz=640,            # Image size
        simplify=True,        # Simplify ONNX graph for better performance
        opset=12,             # ONNX opset version (12 is well supported in browsers)
        dynamic=False,        # Static input size for better web performance
        half=False,           # Use float32 for browser compatibility
    )
    
    # Move to public/models directory
    import shutil
    final_path = output_dir / "aadhaar_detector.onnx"
    shutil.move(export_path, final_path)
    
    print(f"\n✅ Model exported successfully!")
    print(f"📁 Output: {final_path}")
    print(f"📊 Size: {final_path.stat().st_size / 1024 / 1024:.2f} MB")
    
    # Create a smaller 320px variant for even faster loading
    print("\n📦 Creating smaller model variant (320px - ultra fast)...")
    export_path_small = model.export(
        format="onnx",
        imgsz=320,            # Smaller size for ultra-fast inference
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
    
    # Create model info JSON for the frontend
    model_info = {
        "name": "aadhaar_detector",
        "version": "3.0.0",
        "inputSize": 640,
        "inputSizeSmall": 320,
        "classes": list(model.names.values()),
        "format": "onnx",
        "opset": 12,
        "precision": "float32",
        "description": "Lightweight Aadhaar card detector optimized for fast browser loading"
    }
    
    import json
    info_path = output_dir / "model_info.json"
    with open(info_path, "w") as f:
        json.dump(model_info, f, indent=2)
    
    print(f"\n📋 Model info saved to: {info_path}")
    
    print("\n" + "="*60)
    print("🎉 Conversion complete! Models ready for browser deployment.")
    print("="*60)
    print("\nGenerated files:")
    print(f"  1. {final_path.name} - Standard model (640px input)")
    print(f"  2. {final_path_small.name} - Small model (320px input)")
    print(f"  3. {info_path.name} - Model metadata")
    print("\nClasses supported:")
    for i, cls in enumerate(model_info["classes"]):
        print(f"  {i}: {cls}")
    print("\n💡 Tip: Use the small model for faster loading on mobile devices!")

if __name__ == "__main__":
    convert_to_onnx()
