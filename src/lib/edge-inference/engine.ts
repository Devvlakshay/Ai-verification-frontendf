/**
 * Edge Inference Engine using ONNX Runtime Web
 * Loads and runs YOLO model directly in the browser
 */

import * as ort from 'onnxruntime-web';
import { ModelConfig, InferenceResult, DEFAULT_MODEL_CONFIG } from './types';
import { preprocessImage, loadImageData, base64ToImageData } from './image-utils';
import { processYoloOutput, analyzeDetections } from './postprocess';

// Configure ONNX Runtime Web to use CDN for WASM files
if (typeof window !== 'undefined') {
  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/';
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
}

export class EdgeInferenceEngine {
  private session: ort.InferenceSession | null = null;
  private config: ModelConfig;
  private isLoading = false;
  private loadProgress = 0;

  constructor(config: ModelConfig = DEFAULT_MODEL_CONFIG) {
    this.config = config;
  }

  /**
   * Load the ONNX model into memory
   */
  async loadModel(
    onProgress?: (progress: number) => void
  ): Promise<void> {
    if (this.session) return;
    if (this.isLoading) return;

    this.isLoading = true;
    this.loadProgress = 0;

    try {
      console.log('[EdgeInference] Loading model:', this.config.modelPath);
      
      // Fetch model with progress tracking
      const response = await fetch(this.config.modelPath);
      
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
          this.loadProgress = (loaded / total) * 100;
          onProgress?.(this.loadProgress);
        }
      }

      // Combine chunks into single buffer
      const modelBuffer = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) {
        modelBuffer.set(chunk, offset);
        offset += chunk.length;
      }

      console.log('[EdgeInference] Model downloaded, creating session...');

      // Create inference session with WASM backend (most compatible)
      const options: ort.InferenceSession.SessionOptions = {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'basic',
      };

      this.session = await ort.InferenceSession.create(modelBuffer.buffer, options);
      
      this.loadProgress = 100;
      onProgress?.(100);
      
      console.log('[EdgeInference] Model loaded successfully');
      console.log('[EdgeInference] Input names:', this.session.inputNames);
      console.log('[EdgeInference] Output names:', this.session.outputNames);
      
    } catch (error) {
      console.error('[EdgeInference] Failed to load model:', error);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Check if model is loaded
   */
  isReady(): boolean {
    return this.session !== null;
  }

  /**
   * Get model loading progress (0-100)
   */
  getLoadProgress(): number {
    return this.loadProgress;
  }

  /**
   * Run inference on an image
   */
  async detect(
    image: string | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | Blob | ImageData
  ): Promise<InferenceResult> {
    if (!this.session) {
      return {
        success: false,
        detections: [],
        frontDetected: false,
        backDetected: false,
        printAadhaarDetected: false,
        frontConfidence: 0,
        backConfidence: 0,
        inferenceTime: 0,
        error: 'Model not loaded. Call loadModel() first.',
      };
    }

    const startTime = performance.now();

    try {
      // Get ImageData from various sources
      let imageData: ImageData;
      
      if (image instanceof ImageData) {
        imageData = image;
      } else if (typeof image === 'string' && !image.startsWith('data:') && !image.startsWith('http')) {
        // Assume base64 without data URL prefix
        imageData = await base64ToImageData(image);
      } else {
        imageData = await loadImageData(image as any);
      }

      const originalWidth = imageData.width;
      const originalHeight = imageData.height;

      // Preprocess image
      const inputTensor = preprocessImage(imageData, this.config.inputSize);
      
      // Create ONNX tensor
      const tensor = new ort.Tensor(
        'float32',
        inputTensor,
        [1, 3, this.config.inputSize, this.config.inputSize]
      );

      // Run inference
      const inputName = this.session.inputNames[0];
      const results = await this.session.run({ [inputName]: tensor });
      
      // Get output tensor
      const outputName = this.session.outputNames[0];
      const output = results[outputName];
      const outputData = output.data as Float32Array;

      // Process YOLO output
      const detections = processYoloOutput(
        outputData,
        this.config,
        originalWidth,
        originalHeight
      );

      const inferenceTime = performance.now() - startTime;

      // Analyze and return result
      return analyzeDetections(detections, inferenceTime);

    } catch (error) {
      const inferenceTime = performance.now() - startTime;
      console.error('[EdgeInference] Detection error:', error);
      
      return {
        success: false,
        detections: [],
        frontDetected: false,
        backDetected: false,
        printAadhaarDetected: false,
        frontConfidence: 0,
        backConfidence: 0,
        inferenceTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Release model resources
   */
  async dispose(): Promise<void> {
    if (this.session) {
      await this.session.release();
      this.session = null;
    }
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<ModelConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ModelConfig {
    return { ...this.config };
  }
}

// Singleton instance for easy use
let defaultEngine: EdgeInferenceEngine | null = null;

export function getEdgeInferenceEngine(config?: ModelConfig): EdgeInferenceEngine {
  if (!defaultEngine) {
    defaultEngine = new EdgeInferenceEngine(config);
  }
  return defaultEngine;
}

export function resetEdgeInferenceEngine(): void {
  if (defaultEngine) {
    defaultEngine.dispose();
    defaultEngine = null;
  }
}
