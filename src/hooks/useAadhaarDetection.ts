'use client';
/**
 * Hook for on-device Aadhaar card detection
 * Uses ONNX Runtime Web for browser-based inference
 * Loads ONNX Runtime from CDN to avoid bundler issues with Next.js Turbopack
 */

import { useState, useRef, useCallback, useEffect } from 'react';

// Type definitions for ONNX Runtime (loaded from CDN)
interface OrtEnv {
  wasm: {
    wasmPaths?: string;
    numThreads?: number;
    proxy?: boolean;
  };
}

interface OrtTensor {
  data: Float32Array;
  dims: number[];
}

interface OrtInferenceSession {
  inputNames: string[];
  outputNames: string[];
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
  release(): void;
}

interface OrtModule {
  env: OrtEnv;
  Tensor: new (type: string, data: Float32Array, dims: number[]) => OrtTensor;
  InferenceSession: {
    create(buffer: ArrayBuffer, options?: object): Promise<OrtInferenceSession>;
  };
}

declare global {
  interface Window {
    ort?: OrtModule;
  }
}

export interface AadhaarDetectionResult {
  detected: boolean;
  cardType: 'front' | 'back' | 'print' | null;
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface UseAadhaarDetectionReturn {
  isModelLoading: boolean;
  loadProgress: number;
  isModelReady: boolean;
  error: string | null;
  detect: (videoElement: HTMLVideoElement) => Promise<AadhaarDetectionResult>;
  detectImage: (imageSource: string | HTMLImageElement) => Promise<AadhaarDetectionResult>;
  loadModel: () => Promise<void>;
}

// Class labels from the YOLO model - actual training order
// Order: aadhaar_back=0, aadhaar_front=1, print_aadhaar=2
const CLASS_NAMES = ['aadhaar_back', 'aadhaar_front', 'print_aadhaar'];
const MODEL_INPUT_SIZE = 640;
const ONNX_CDN_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/ort.min.js';

// Load ONNX Runtime from CDN
function loadOnnxRuntime(): Promise<OrtModule> {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.ort) {
      resolve(window.ort);
      return;
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector(`script[src="${ONNX_CDN_URL}"]`);
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        if (window.ort) {
          // Configure WASM paths
          window.ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/';
          window.ort.env.wasm.numThreads = 1;
          resolve(window.ort);
        } else {
          reject(new Error('ONNX Runtime failed to initialize'));
        }
      });
      return;
    }

    // Load the script
    const script = document.createElement('script');
    script.src = ONNX_CDN_URL;
    script.async = true;
    
    script.onload = () => {
      if (window.ort) {
        // Configure WASM paths
        window.ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/';
        window.ort.env.wasm.numThreads = 1;
        console.log('[AadhaarDetection] ONNX Runtime loaded from CDN');
        resolve(window.ort);
      } else {
        reject(new Error('ONNX Runtime failed to initialize'));
      }
    };
    
    script.onerror = () => {
      reject(new Error('Failed to load ONNX Runtime from CDN'));
    };
    
    document.head.appendChild(script);
  });
}

export function useAadhaarDetection(): UseAadhaarDetectionReturn {
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [isModelReady, setIsModelReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const sessionRef = useRef<OrtInferenceSession | null>(null);
  const ortRef = useRef<OrtModule | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Create canvas for preprocessing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = MODEL_INPUT_SIZE;
      canvasRef.current.height = MODEL_INPUT_SIZE;
    }
    
    return () => {
      if (sessionRef.current) {
        sessionRef.current.release();
        sessionRef.current = null;
      }
    };
  }, []);

  const loadModel = useCallback(async () => {
    if (sessionRef.current || isModelLoading) return;
    
    setIsModelLoading(true);
    setError(null);
    setLoadProgress(0);

    try {
      // First, load ONNX Runtime from CDN
      console.log('[AadhaarDetection] Loading ONNX Runtime from CDN...');
      const ort = await loadOnnxRuntime();
      ortRef.current = ort;
      
      console.log('[AadhaarDetection] Loading model...');
      
      // Fetch the model with progress tracking
      const response = await fetch('/models/aadhaar_detector.onnx');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch model: ${response.status}`);
      }

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      
      const reader = response.body!.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        loaded += value.length;
        
        if (total > 0) {
          setLoadProgress(Math.round((loaded / total) * 100));
        }
      }

      // Combine chunks
      const modelBuffer = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) {
        modelBuffer.set(chunk, offset);
        offset += chunk.length;
      }

      console.log('[AadhaarDetection] Model downloaded, creating session...');

      // Create session with WASM backend using CDN-loaded ort
      const session = await ort.InferenceSession.create(modelBuffer.buffer, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'basic',
      });

      sessionRef.current = session;
      setIsModelReady(true);
      setLoadProgress(100);
      
      console.log('[AadhaarDetection] Model loaded successfully');
      console.log('[AadhaarDetection] Inputs:', session.inputNames);
      console.log('[AadhaarDetection] Outputs:', session.outputNames);

    } catch (err) {
      console.error('[AadhaarDetection] Failed to load model:', err);
      setError(err instanceof Error ? err.message : 'Failed to load model');
    } finally {
      setIsModelLoading(false);
    }
  }, [isModelLoading]);

  const preprocessVideo = useCallback((video: HTMLVideoElement): Float32Array => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('Canvas not initialized');
    
    const ctx = canvas.getContext('2d')!;
    
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    
    // Calculate scaling and padding for letterbox resize (maintain aspect ratio)
    const scale = Math.min(MODEL_INPUT_SIZE / videoWidth, MODEL_INPUT_SIZE / videoHeight);
    const newWidth = Math.round(videoWidth * scale);
    const newHeight = Math.round(videoHeight * scale);
    const padX = Math.floor((MODEL_INPUT_SIZE - newWidth) / 2);
    const padY = Math.floor((MODEL_INPUT_SIZE - newHeight) / 2);
    
    // Fill with gray (114 - YOLO default padding color)
    ctx.fillStyle = 'rgb(114, 114, 114)';
    ctx.fillRect(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    
    // Draw video frame with letterbox (centered, maintaining aspect ratio)
    ctx.drawImage(video, padX, padY, newWidth, newHeight);
    
    // Get pixel data
    const imageData = ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    const data = imageData.data;
    
    // Convert to CHW format and normalize to 0-1
    const float32Data = new Float32Array(3 * MODEL_INPUT_SIZE * MODEL_INPUT_SIZE);
    const pixelCount = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
    
    for (let i = 0; i < pixelCount; i++) {
      const srcIdx = i * 4;
      // RGB channels normalized to 0-1
      float32Data[i] = data[srcIdx] / 255; // R
      float32Data[pixelCount + i] = data[srcIdx + 1] / 255; // G
      float32Data[2 * pixelCount + i] = data[srcIdx + 2] / 255; // B
    }
    
    return float32Data;
  }, []);

  // Preprocess static image (base64 or HTMLImageElement)
  const preprocessImage = useCallback(async (imageSource: string | HTMLImageElement): Promise<{ data: Float32Array; width: number; height: number }> => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('Canvas not initialized');
    
    const ctx = canvas.getContext('2d')!;
    
    // Load image if it's a string (base64 or URL)
    let img: HTMLImageElement;
    if (typeof imageSource === 'string') {
      img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imageSource;
      });
    } else {
      img = imageSource;
    }
    
    const imgWidth = img.naturalWidth || img.width;
    const imgHeight = img.naturalHeight || img.height;
    
    // Calculate scaling and padding for letterbox resize (maintain aspect ratio)
    const scale = Math.min(MODEL_INPUT_SIZE / imgWidth, MODEL_INPUT_SIZE / imgHeight);
    const newWidth = Math.round(imgWidth * scale);
    const newHeight = Math.round(imgHeight * scale);
    const padX = Math.floor((MODEL_INPUT_SIZE - newWidth) / 2);
    const padY = Math.floor((MODEL_INPUT_SIZE - newHeight) / 2);
    
    // Fill with gray (114 - YOLO default padding color)
    ctx.fillStyle = 'rgb(114, 114, 114)';
    ctx.fillRect(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    
    // Draw image with letterbox (centered, maintaining aspect ratio)
    ctx.drawImage(img, padX, padY, newWidth, newHeight);
    
    // Get pixel data
    const imageData = ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    const data = imageData.data;
    
    // Convert to CHW format and normalize to 0-1
    const float32Data = new Float32Array(3 * MODEL_INPUT_SIZE * MODEL_INPUT_SIZE);
    const pixelCount = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
    
    for (let i = 0; i < pixelCount; i++) {
      const srcIdx = i * 4;
      // RGB channels normalized to 0-1
      float32Data[i] = data[srcIdx] / 255; // R
      float32Data[pixelCount + i] = data[srcIdx + 1] / 255; // G
      float32Data[2 * pixelCount + i] = data[srcIdx + 2] / 255; // B
    }
    
    return { data: float32Data, width: imgWidth, height: imgHeight };
  }, []);

  const detect = useCallback(async (video: HTMLVideoElement): Promise<AadhaarDetectionResult> => {
    if (!sessionRef.current || !ortRef.current) {
      return { detected: false, cardType: null, confidence: 0 };
    }

    try {
      const ort = ortRef.current;
      const originalWidth = video.videoWidth;
      const originalHeight = video.videoHeight;
      
      // Calculate letterbox parameters (same as preprocessing)
      const scale = Math.min(MODEL_INPUT_SIZE / originalWidth, MODEL_INPUT_SIZE / originalHeight);
      const padX = Math.floor((MODEL_INPUT_SIZE - originalWidth * scale) / 2);
      const padY = Math.floor((MODEL_INPUT_SIZE - originalHeight * scale) / 2);
      
      // Preprocess
      const inputData = preprocessVideo(video);
      
      // Create tensor using CDN-loaded ort
      const tensor = new ort.Tensor(
        'float32',
        inputData,
        [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]
      );

      // Run inference
      const inputName = sessionRef.current.inputNames[0];
      const results = await sessionRef.current.run({ [inputName]: tensor });
      
      // Get output
      const outputName = sessionRef.current.outputNames[0];
      const output = results[outputName];
      const outputData = output.data as Float32Array;

      // Log output shape for debugging
      console.log('[AadhaarDetection] Output dims:', output.dims);
      console.log('[AadhaarDetection] Output data length:', outputData.length);

      // Parse YOLO output format: [1, 7, 8400] for YOLOv8
      // Each detection: [x, y, w, h, class0_conf, class1_conf, class2_conf]
      const numDetections = output.dims[2] || 8400;
      const numChannels = output.dims[1] || 7;
      
      console.log('[AadhaarDetection] Num detections:', numDetections, 'Num channels:', numChannels);
      
      let bestDetection: AadhaarDetectionResult = {
        detected: false,
        cardType: null,
        confidence: 0
      };
      
      const confidenceThreshold = 0.25; // Lowered threshold for better detection
      
      // Parse detections
      for (let i = 0; i < numDetections; i++) {
        // Get class scores (last 3 channels are class probabilities)
        const classScores = [];
        for (let c = 0; c < 3; c++) {
          const idx = (4 + c) * numDetections + i;
          classScores.push(outputData[idx] || 0);
        }
        
        // Find best class
        const maxScore = Math.max(...classScores);
        const maxClassIdx = classScores.indexOf(maxScore);
        
        // Log high confidence detections
        if (maxScore > 0.1) {
          console.log(`[AadhaarDetection] Detection ${i}: class=${maxClassIdx} (${CLASS_NAMES[maxClassIdx]}), score=${maxScore.toFixed(3)}`);
        }
        
        if (maxScore > confidenceThreshold && maxScore > bestDetection.confidence) {
          // Get bounding box (in model input coordinates)
          const xCenter = outputData[0 * numDetections + i];
          const yCenter = outputData[1 * numDetections + i];
          const width = outputData[2 * numDetections + i];
          const height = outputData[3 * numDetections + i];
          
          // Convert from letterboxed coordinates to original image coordinates
          const x1 = ((xCenter - width / 2) - padX) / scale;
          const y1 = ((yCenter - height / 2) - padY) / scale;
          const boxWidth = width / scale;
          const boxHeight = height / scale;
          
          // Class mapping: aadhaar_back=0 -> 'back', aadhaar_front=1 -> 'front', print_aadhaar=2 -> 'print'
          bestDetection = {
            detected: true,
            cardType: maxClassIdx === 0 ? 'back' : maxClassIdx === 1 ? 'front' : 'print',
            confidence: maxScore,
            boundingBox: {
              x: Math.max(0, x1),
              y: Math.max(0, y1),
              width: Math.min(boxWidth, originalWidth - x1),
              height: Math.min(boxHeight, originalHeight - y1)
            }
          };
          
          console.log('[AadhaarDetection] Best detection updated:', bestDetection);
        }
      }

      return bestDetection;

    } catch (err) {
      console.error('[AadhaarDetection] Detection error:', err);
      return { detected: false, cardType: null, confidence: 0 };
    }
  }, [preprocessVideo]);

  // Detect from static image (base64 or HTMLImageElement)
  const detectImage = useCallback(async (imageSource: string | HTMLImageElement): Promise<AadhaarDetectionResult> => {
    if (!sessionRef.current || !ortRef.current) {
      return { detected: false, cardType: null, confidence: 0 };
    }

    try {
      const ort = ortRef.current;
      
      // Preprocess image
      const { data: inputData, width: originalWidth, height: originalHeight } = await preprocessImage(imageSource);
      
      // Calculate letterbox parameters
      const scale = Math.min(MODEL_INPUT_SIZE / originalWidth, MODEL_INPUT_SIZE / originalHeight);
      const padX = Math.floor((MODEL_INPUT_SIZE - originalWidth * scale) / 2);
      const padY = Math.floor((MODEL_INPUT_SIZE - originalHeight * scale) / 2);
      
      // Create tensor using CDN-loaded ort
      const tensor = new ort.Tensor(
        'float32',
        inputData,
        [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]
      );

      // Run inference
      const inputName = sessionRef.current.inputNames[0];
      const results = await sessionRef.current.run({ [inputName]: tensor });
      
      // Get output
      const outputName = sessionRef.current.outputNames[0];
      const output = results[outputName];
      const outputData = output.data as Float32Array;

      console.log('[AadhaarDetection] Image detection - Output dims:', output.dims);

      const numDetections = output.dims[2] || 8400;
      
      let bestDetection: AadhaarDetectionResult = {
        detected: false,
        cardType: null,
        confidence: 0
      };
      
      const confidenceThreshold = 0.25;
      
      // Parse detections
      for (let i = 0; i < numDetections; i++) {
        const classScores = [];
        for (let c = 0; c < 3; c++) {
          const idx = (4 + c) * numDetections + i;
          classScores.push(outputData[idx] || 0);
        }
        
        const maxScore = Math.max(...classScores);
        const maxClassIdx = classScores.indexOf(maxScore);
        
        if (maxScore > 0.1) {
          console.log(`[AadhaarDetection] Image detection ${i}: class=${maxClassIdx} (${CLASS_NAMES[maxClassIdx]}), score=${maxScore.toFixed(3)}`);
        }
        
        if (maxScore > confidenceThreshold && maxScore > bestDetection.confidence) {
          const xCenter = outputData[0 * numDetections + i];
          const yCenter = outputData[1 * numDetections + i];
          const width = outputData[2 * numDetections + i];
          const height = outputData[3 * numDetections + i];
          
          const x1 = ((xCenter - width / 2) - padX) / scale;
          const y1 = ((yCenter - height / 2) - padY) / scale;
          const boxWidth = width / scale;
          const boxHeight = height / scale;
          
          bestDetection = {
            detected: true,
            cardType: maxClassIdx === 0 ? 'back' : maxClassIdx === 1 ? 'front' : 'print',
            confidence: maxScore,
            boundingBox: {
              x: Math.max(0, x1),
              y: Math.max(0, y1),
              width: Math.min(boxWidth, originalWidth - x1),
              height: Math.min(boxHeight, originalHeight - y1)
            }
          };
          
          console.log('[AadhaarDetection] Image best detection:', bestDetection);
        }
      }

      return bestDetection;

    } catch (err) {
      console.error('[AadhaarDetection] Image detection error:', err);
      return { detected: false, cardType: null, confidence: 0 };
    }
  }, [preprocessImage]);

  return {
    isModelLoading,
    loadProgress,
    isModelReady,
    error,
    detect,
    detectImage,
    loadModel
  };
}
