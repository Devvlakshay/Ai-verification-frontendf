/**
 * Types for Edge-based ONNX inference
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Detection {
  class: string;
  classId: number;
  confidence: number;
  bbox: BoundingBox;
}

export interface InferenceResult {
  success: boolean;
  detections: Detection[];
  frontDetected: boolean;
  backDetected: boolean;
  printAadhaarDetected: boolean;
  frontConfidence: number;
  backConfidence: number;
  inferenceTime: number;
  error?: string;
}

export interface ModelConfig {
  modelPath: string;
  inputSize: number;
  classes: string[];
  confidenceThreshold: number;
}

// INT8 quantized models (default - 74% smaller, 2x faster)
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  modelPath: '/models/aadhaar_detector_small_int8.onnx',  // Fastest: 42 FPS
  inputSize: 320,
  // Actual training order: aadhaar_back=0, aadhaar_front=1, print_aadhaar=2
  classes: ['aadhaar_back', 'aadhaar_front', 'print_aadhaar'],
  confidenceThreshold: 0.15,
};

export const SMALL_MODEL_CONFIG: ModelConfig = {
  modelPath: '/models/aadhaar_detector_small_int8.onnx',
  inputSize: 320,
  // Actual training order: aadhaar_back=0, aadhaar_front=1, print_aadhaar=2
  classes: ['aadhaar_back', 'aadhaar_front', 'print_aadhaar'],
  confidenceThreshold: 0.15,
};

// Higher accuracy INT8 model (still fast)
export const INT8_MODEL_CONFIG: ModelConfig = {
  modelPath: '/models/aadhaar_detector_int8.onnx',
  inputSize: 640,
  classes: ['aadhaar_back', 'aadhaar_front', 'print_aadhaar'],
  confidenceThreshold: 0.15,
};

export type ModelLoadingState = 'idle' | 'loading' | 'ready' | 'error';

export interface EdgeInferenceState {
  modelState: ModelLoadingState;
  loadProgress: number;
  error: string | null;
  isProcessing: boolean;
}
