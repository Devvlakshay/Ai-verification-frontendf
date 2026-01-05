#!/usr/bin/env python3
"""
Quantize ONNX model to INT8 for better mobile performance.

INT8 quantization benefits:
- ~4x smaller model size
- ~2-4x faster inference on mobile CPUs
- Lower memory usage
- Better battery efficiency

This script supports both static and dynamic quantization.
"""

import os
import sys
import shutil
from pathlib import Path
import json
import numpy as np

def install_dependencies():
    """Install required packages for quantization."""
    required = ['onnx', 'onnxruntime']
    for pkg in required:
        try:
            __import__(pkg.replace('-', '_').split('[')[0])
        except ImportError:
            print(f"Installing {pkg}...")
            os.system(f"{sys.executable} -m pip install {pkg}")

def create_calibration_data(num_samples: int = 100, input_size: int = 640):
    """
    Create calibration dataset for static quantization.
    For best results, use real Aadhaar card images.
    
    Args:
        num_samples: Number of calibration samples
        input_size: Input image size (640 or 320)
    
    Returns:
        List of numpy arrays for calibration
    """
    print(f"📊 Creating {num_samples} calibration samples...")
    
    calibration_data = []
    for i in range(num_samples):
        # Generate random images that simulate real input distribution
        # For production, replace with actual Aadhaar images
        img = np.random.rand(1, 3, input_size, input_size).astype(np.float32)
        # Normalize to [0, 1] range (YOLO preprocessing)
        calibration_data.append(img)
    
    return calibration_data


class YOLOCalibrationDataReader:
    """Calibration data reader for ONNX quantization."""
    
    def __init__(self, calibration_data, input_name: str = "images"):
        self.calibration_data = calibration_data
        self.input_name = input_name
        self.index = 0
    
    def get_next(self):
        if self.index >= len(self.calibration_data):
            return None
        data = {self.input_name: self.calibration_data[self.index]}
        self.index += 1
        return data
    
    def rewind(self):
        self.index = 0


def quantize_dynamic(input_model: Path, output_model: Path):
    """
    Apply dynamic INT8 quantization (simpler, no calibration data needed).
    Good for quick deployment, slightly less optimal than static.
    """
    from onnxruntime.quantization import quantize_dynamic as ort_quantize_dynamic
    from onnxruntime.quantization import QuantType
    
    print(f"🔄 Applying dynamic INT8 quantization...")
    print(f"   Input: {input_model}")
    print(f"   Output: {output_model}")
    
    ort_quantize_dynamic(
        model_input=str(input_model),
        model_output=str(output_model),
        weight_type=QuantType.QUInt8,
    )
    
    return output_model


def quantize_static(input_model: Path, output_model: Path, calibration_data: list):
    """
    Apply static INT8 quantization with calibration data.
    Better accuracy than dynamic quantization.
    """
    from onnxruntime.quantization import (
        quantize_static as ort_quantize_static,
        QuantFormat,
        QuantType,
        CalibrationMethod,
    )
    import onnx
    
    print(f"🔄 Applying static INT8 quantization with calibration...")
    print(f"   Input: {input_model}")
    print(f"   Output: {output_model}")
    print(f"   Calibration samples: {len(calibration_data)}")
    
    # Load model to get input name
    model = onnx.load(str(input_model))
    input_name = model.graph.input[0].name
    print(f"   Input name: {input_name}")
    
    # Create calibration data reader
    calibration_reader = YOLOCalibrationDataReader(calibration_data, input_name)
    
    # Quantize with static calibration
    ort_quantize_static(
        model_input=str(input_model),
        model_output=str(output_model),
        calibration_data_reader=calibration_reader,
        quant_format=QuantFormat.QDQ,  # Quantize-DeQuantize format
        per_channel=True,               # Per-channel quantization (better accuracy)
        weight_type=QuantType.QInt8,
        activation_type=QuantType.QUInt8,
        calibrate_method=CalibrationMethod.MinMax,
    )
    
    return output_model


def verify_model(model_path: Path, input_size: int = 640):
    """Verify the quantized model works correctly."""
    import onnxruntime as ort
    import onnx
    
    print(f"\n🔍 Verifying quantized model...")
    
    # Check ONNX model validity
    model = onnx.load(str(model_path))
    onnx.checker.check_model(model)
    print("   ✅ ONNX model is valid")
    
    # Test inference
    session = ort.InferenceSession(
        str(model_path),
        providers=['CPUExecutionProvider']
    )
    
    input_name = session.get_inputs()[0].name
    output_names = [o.name for o in session.get_outputs()]
    
    # Create dummy input
    dummy_input = np.random.rand(1, 3, input_size, input_size).astype(np.float32)
    
    # Run inference
    outputs = session.run(output_names, {input_name: dummy_input})
    
    print(f"   ✅ Inference successful")
    print(f"   📊 Output shape: {outputs[0].shape}")
    
    return True


def compare_model_sizes(original: Path, quantized: Path):
    """Compare original and quantized model sizes."""
    original_size = original.stat().st_size / (1024 * 1024)
    quantized_size = quantized.stat().st_size / (1024 * 1024)
    reduction = (1 - quantized_size / original_size) * 100
    
    print(f"\n📊 Model Size Comparison:")
    print(f"   Original:  {original_size:.2f} MB")
    print(f"   Quantized: {quantized_size:.2f} MB")
    print(f"   Reduction: {reduction:.1f}%")
    
    return {
        "original_mb": round(original_size, 2),
        "quantized_mb": round(quantized_size, 2),
        "reduction_percent": round(reduction, 1)
    }


def benchmark_inference(model_path: Path, input_size: int = 640, num_runs: int = 50):
    """Benchmark inference speed."""
    import onnxruntime as ort
    import time
    
    print(f"\n⚡ Benchmarking inference speed ({num_runs} runs)...")
    
    session = ort.InferenceSession(
        str(model_path),
        providers=['CPUExecutionProvider']
    )
    
    input_name = session.get_inputs()[0].name
    output_names = [o.name for o in session.get_outputs()]
    
    # Warmup
    dummy_input = np.random.rand(1, 3, input_size, input_size).astype(np.float32)
    for _ in range(5):
        session.run(output_names, {input_name: dummy_input})
    
    # Benchmark
    times = []
    for _ in range(num_runs):
        dummy_input = np.random.rand(1, 3, input_size, input_size).astype(np.float32)
        start = time.perf_counter()
        session.run(output_names, {input_name: dummy_input})
        times.append((time.perf_counter() - start) * 1000)  # ms
    
    avg_time = np.mean(times)
    std_time = np.std(times)
    
    print(f"   Average: {avg_time:.2f} ms")
    print(f"   Std Dev: {std_time:.2f} ms")
    print(f"   FPS: {1000/avg_time:.1f}")
    
    return {
        "avg_ms": round(avg_time, 2),
        "std_ms": round(std_time, 2),
        "fps": round(1000/avg_time, 1)
    }


def quantize_model(
    input_model: str = None,
    output_dir: str = None,
    method: str = "dynamic",
    input_size: int = 640,
    num_calibration_samples: int = 100,
    benchmark: bool = True
):
    """
    Main quantization function.
    
    Args:
        input_model: Path to input ONNX model
        output_dir: Output directory for quantized models
        method: "dynamic" or "static" quantization
        input_size: Input image size (640 or 320)
        num_calibration_samples: Number of calibration samples for static quantization
        benchmark: Whether to run benchmarks
    """
    install_dependencies()
    
    # Default paths
    if input_model is None:
        input_model = Path(__file__).parent.parent / "public" / "models" / "aadhaar_detector.onnx"
    else:
        input_model = Path(input_model)
    
    if output_dir is None:
        output_dir = Path(__file__).parent.parent / "public" / "models"
    else:
        output_dir = Path(output_dir)
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Check input model exists
    if not input_model.exists():
        print(f"❌ Model not found: {input_model}")
        print("\n💡 Run convert_to_onnx.py first to create the ONNX model:")
        print(f"   python {Path(__file__).parent / 'convert_to_onnx.py'}")
        sys.exit(1)
    
    print("=" * 60)
    print("🔧 ONNX INT8 Quantization for Mobile Deployment")
    print("=" * 60)
    print(f"\n📁 Input model: {input_model}")
    print(f"📁 Output directory: {output_dir}")
    print(f"📐 Input size: {input_size}x{input_size}")
    print(f"🔄 Method: {method}")
    
    # Determine output filename
    model_name = input_model.stem
    output_model = output_dir / f"{model_name}_int8.onnx"
    
    # Quantize based on method
    if method == "dynamic":
        quantize_dynamic(input_model, output_model)
    elif method == "static":
        calibration_data = create_calibration_data(num_calibration_samples, input_size)
        quantize_static(input_model, output_model, calibration_data)
    else:
        print(f"❌ Unknown method: {method}")
        print("   Use 'dynamic' or 'static'")
        sys.exit(1)
    
    # Verify the model
    verify_model(output_model, input_size)
    
    # Compare sizes
    size_info = compare_model_sizes(input_model, output_model)
    
    # Benchmark if requested
    benchmark_results = {}
    if benchmark:
        print("\n" + "=" * 60)
        print("📊 Performance Comparison")
        print("=" * 60)
        
        print("\n🔹 Original Model:")
        original_bench = benchmark_inference(input_model, input_size)
        
        print("\n🔹 INT8 Quantized Model:")
        quantized_bench = benchmark_inference(output_model, input_size)
        
        speedup = original_bench["avg_ms"] / quantized_bench["avg_ms"]
        print(f"\n⚡ Speedup: {speedup:.2f}x faster")
        
        benchmark_results = {
            "original": original_bench,
            "quantized": quantized_bench,
            "speedup": round(speedup, 2)
        }
    
    # Update model info JSON
    model_info_path = output_dir / "model_info.json"
    if model_info_path.exists():
        with open(model_info_path, "r") as f:
            model_info = json.load(f)
    else:
        model_info = {}
    
    model_info["int8"] = {
        "filename": output_model.name,
        "method": method,
        "inputSize": input_size,
        "size": size_info,
        "benchmark": benchmark_results if benchmark else None
    }
    
    with open(model_info_path, "w") as f:
        json.dump(model_info, f, indent=2)
    
    print("\n" + "=" * 60)
    print("✅ Quantization Complete!")
    print("=" * 60)
    print(f"\n📁 Quantized model: {output_model}")
    print(f"📊 Size reduction: {size_info['reduction_percent']}%")
    if benchmark:
        print(f"⚡ Speedup: {benchmark_results['speedup']}x")
    
    print("\n💡 Usage in browser:")
    print("   Update your model path to use the INT8 model:")
    print(f"   const modelPath = '/models/{output_model.name}';")
    
    return output_model


def quantize_all_models():
    """Quantize all available ONNX models."""
    models_dir = Path(__file__).parent.parent / "public" / "models"
    
    onnx_models = list(models_dir.glob("*.onnx"))
    # Filter out already quantized models
    onnx_models = [m for m in onnx_models if "_int8" not in m.stem]
    
    if not onnx_models:
        print("❌ No ONNX models found to quantize")
        print(f"   Looking in: {models_dir}")
        return
    
    print(f"Found {len(onnx_models)} models to quantize:")
    for m in onnx_models:
        print(f"   - {m.name}")
    
    for model_path in onnx_models:
        print("\n" + "=" * 60)
        # Determine input size from filename
        input_size = 320 if "small" in model_path.stem else 640
        quantize_model(
            input_model=str(model_path),
            method="dynamic",
            input_size=input_size,
            benchmark=True
        )


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Quantize ONNX models to INT8")
    parser.add_argument("--input", "-i", type=str, help="Input ONNX model path")
    parser.add_argument("--output-dir", "-o", type=str, help="Output directory")
    parser.add_argument("--method", "-m", choices=["dynamic", "static"], 
                        default="dynamic", help="Quantization method")
    parser.add_argument("--size", "-s", type=int, default=640, 
                        help="Input image size (640 or 320)")
    parser.add_argument("--calibration-samples", "-c", type=int, default=100,
                        help="Number of calibration samples for static quantization")
    parser.add_argument("--no-benchmark", action="store_true",
                        help="Skip benchmarking")
    parser.add_argument("--all", "-a", action="store_true",
                        help="Quantize all ONNX models in public/models")
    
    args = parser.parse_args()
    
    if args.all:
        quantize_all_models()
    else:
        quantize_model(
            input_model=args.input,
            output_dir=args.output_dir,
            method=args.method,
            input_size=args.size,
            num_calibration_samples=args.calibration_samples,
            benchmark=not args.no_benchmark
        )
