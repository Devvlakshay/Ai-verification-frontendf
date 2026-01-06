'use client';
/**
 * Singleton Manager for Aadhaar Detection ONNX Model
 * 
 * This manager ensures only ONE model instance is loaded across the entire app,
 * significantly reducing memory usage.
 * 
 * Default: INT8 quantized model (~25MB, 2x faster than FP32)
 * 
 * Memory optimization features:
 * - INT8 quantization (74% smaller model, ~25MB vs ~99MB)
 * - Single shared ONNX session
 * - Reusable canvas for preprocessing
 * - Proper tensor disposal
 * - Reference counting for safe cleanup
 */

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
  dispose?: () => void;
}

interface OrtInferenceSession {
  inputNames: string[];
  outputNames: string[];
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
  release(): Promise<void>;
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
    __aadhaarModelManager?: AadhaarModelManager;
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

type ModelState = 'idle' | 'loading' | 'ready' | 'error';
type LoadProgressCallback = (progress: number) => void;
type StateChangeCallback = (state: ModelState) => void;

const CLASS_NAMES = ['aadhaar_back', 'aadhaar_front', 'print_aadhaar'];
const ONNX_CDN_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/ort.min.js';

// Model variants available
export type ModelVariant = 'full' | 'small' | 'int8' | 'int8_small';

// Input sizes for each model variant
const MODEL_INPUT_SIZES: Record<ModelVariant, number> = {
  full: 640,
  small: 320,
  int8: 640,
  int8_small: 320,
};

const MODEL_PATHS: Record<ModelVariant, string> = {
  full: '/models/aadhaar_detector.onnx',           // ~99MB, FP32
  small: '/models/aadhaar_detector_small.onnx',    // ~99MB, 320px input
  int8: '/models/aadhaar_detector_int8.onnx',      // ~25MB, INT8 quantized
  int8_small: '/models/aadhaar_detector_small_int8.onnx', // ~25MB, INT8 + 320px
};

// Auto-detect best model for device
// Always use int8 (640px) for better accuracy - the 320px model has lower detection quality
function detectBestModel(): ModelVariant {
  // Always use int8 (640px) model for accurate detection
  // The int8_small (320px) model has lower accuracy and causes misclassifications
  return 'int8';
}

class AadhaarModelManager {
  private session: OrtInferenceSession | null = null;
  private ort: OrtModule | null = null;
  private state: ModelState = 'idle';
  private loadProgress = 0;
  private refCount = 0;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private currentModelVariant: ModelVariant | null = null;
  private inputSize: number = 640; // Dynamic based on model
  
  // Callbacks for state updates
  private progressCallbacks: Set<LoadProgressCallback> = new Set();
  private stateCallbacks: Set<StateChangeCallback> = new Set();
  
  // Loading promise to prevent duplicate loads
  private loadingPromise: Promise<void> | null = null;

  constructor() {
    // Canvas will be created/resized when model loads
    if (typeof window !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d', { 
        willReadFrequently: true,
        alpha: false 
      });
    }
  }
  
  /**
   * Resize canvas for current model input size
   */
  private resizeCanvas(size: number) {
    if (this.canvas) {
      this.canvas.width = size;
      this.canvas.height = size;
    }
  }

  /**
   * Get the currently loaded model variant
   */
  getCurrentModelVariant(): ModelVariant | null {
    return this.currentModelVariant;
  }
  
  /**
   * Get current input size
   */
  getInputSize(): number {
    return this.inputSize;
  }

  /**
   * Subscribe to model loading progress
   */
  onProgress(callback: LoadProgressCallback): () => void {
    this.progressCallbacks.add(callback);
    callback(this.loadProgress);
    return () => this.progressCallbacks.delete(callback);
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(callback: StateChangeCallback): () => void {
    this.stateCallbacks.add(callback);
    callback(this.state);
    return () => this.stateCallbacks.delete(callback);
  }

  private setState(state: ModelState) {
    this.state = state;
    this.stateCallbacks.forEach(cb => cb(state));
  }

  private setProgress(progress: number) {
    this.loadProgress = progress;
    this.progressCallbacks.forEach(cb => cb(progress));
  }

  /**
   * Acquire a reference to the model (increments ref count)
   */
  acquire(): void {
    this.refCount++;
    console.log('[ModelManager] Acquired reference, count:', this.refCount);
  }

  /**
   * Release a reference to the model (decrements ref count)
   * Model is NOT unloaded even when refCount hits 0 - keeps it cached
   */
  release(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    console.log('[ModelManager] Released reference, count:', this.refCount);
  }

  /**
   * Force unload model to free memory (use when navigating away from verification)
   */
  async forceUnload(): Promise<void> {
    console.log('[ModelManager] Force unloading model...');
    if (this.session) {
      await this.session.release();
      this.session = null;
    }
    this.ort = null;
    this.refCount = 0;
    this.loadProgress = 0;
    this.currentModelVariant = null;
    this.setState('idle');
    
    // Force garbage collection hint
    if (typeof window !== 'undefined' && (window as any).gc) {
      (window as any).gc();
    }
  }

  getState(): ModelState {
    return this.state;
  }

  getProgress(): number {
    return this.loadProgress;
  }

  isReady(): boolean {
    return this.state === 'ready' && this.session !== null;
  }

  /**
   * Load the ONNX runtime from CDN
   */
  private async loadOnnxRuntime(): Promise<OrtModule> {
    if (this.ort) return this.ort;
    if (window.ort) {
      this.ort = window.ort;
      return this.ort;
    }

    return new Promise((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${ONNX_CDN_URL}"]`);
      if (existingScript) {
        existingScript.addEventListener('load', () => {
          if (window.ort) {
            window.ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/';
            window.ort.env.wasm.numThreads = 1;
            this.ort = window.ort;
            resolve(this.ort);
          } else {
            reject(new Error('ONNX Runtime failed to initialize'));
          }
        });
        return;
      }

      const script = document.createElement('script');
      script.src = ONNX_CDN_URL;
      script.async = true;
      
      script.onload = () => {
        if (window.ort) {
          window.ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/';
          window.ort.env.wasm.numThreads = 1;
          this.ort = window.ort;
          console.log('[ModelManager] ONNX Runtime loaded from CDN');
          resolve(this.ort);
        } else {
          reject(new Error('ONNX Runtime failed to initialize'));
        }
      };
      
      script.onerror = () => reject(new Error('Failed to load ONNX Runtime'));
      document.head.appendChild(script);
    });
  }

  /**
   * Load the model (shared across all components)
   * @param variant - Model variant to load ('full', 'small', 'int8', 'int8_small', or 'auto')
   */
  async loadModel(variant: ModelVariant | 'auto' = 'auto'): Promise<void> {
    const selectedVariant = variant === 'auto' ? detectBestModel() : variant;
    
    // Already ready with same variant
    if (this.state === 'ready' && this.session && this.currentModelVariant === selectedVariant) {
      return;
    }

    // If different variant requested, unload current model first
    if (this.session && this.currentModelVariant !== selectedVariant) {
      console.log(`[ModelManager] Switching from ${this.currentModelVariant} to ${selectedVariant}`);
      await this.forceUnload();
    }

    // Already loading - wait for existing load
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = this._loadModelInternal(selectedVariant);
    
    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async _loadModelInternal(variant: ModelVariant): Promise<void> {
    this.setState('loading');
    this.setProgress(0);

    try {
      console.log('[ModelManager] Loading ONNX Runtime...');
      await this.loadOnnxRuntime();
      this.setProgress(10);
      
      const modelPath = MODEL_PATHS[variant];
      console.log(`[ModelManager] Fetching model (${variant}): ${modelPath}`);
      
      // Load the INT8 model only - no fallback to FP32 models
      const response = await fetch(modelPath);
      const actualVariant = variant;
      
      if (!response.ok) {
        throw new Error(`Failed to fetch model (${variant}): ${response.status}. Make sure the model file exists at ${modelPath}`);
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
          this.setProgress(10 + Math.round((loaded / total) * 80));
        }
      }

      // Combine chunks
      const modelBuffer = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) {
        modelBuffer.set(chunk, offset);
        offset += chunk.length;
      }
      
      // Clear chunks array to free memory
      chunks.length = 0;

      console.log('[ModelManager] Creating inference session...');
      this.setProgress(95);

      this.session = await this.ort!.InferenceSession.create(modelBuffer.buffer, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'basic',
      });

      this.currentModelVariant = actualVariant;
      this.inputSize = MODEL_INPUT_SIZES[actualVariant];
      this.resizeCanvas(this.inputSize);
      
      this.setState('ready');
      this.setProgress(100);
      
      console.log(`[ModelManager] Model loaded successfully (variant: ${actualVariant}, inputSize: ${this.inputSize})`);
      console.log('[ModelManager] Inputs:', this.session.inputNames);
      console.log('[ModelManager] Outputs:', this.session.outputNames);

    } catch (err) {
      console.error('[ModelManager] Failed to load model:', err);
      this.setState('error');
      throw err;
    }
  }

  /**
   * Preprocess video frame for inference
   */
  private preprocessVideo(video: HTMLVideoElement): Float32Array {
    if (!this.canvas || !this.ctx) {
      throw new Error('Canvas not initialized');
    }
    
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    const inputSize = this.inputSize;
    
    // Calculate letterbox parameters
    const scale = Math.min(inputSize / videoWidth, inputSize / videoHeight);
    const newWidth = Math.round(videoWidth * scale);
    const newHeight = Math.round(videoHeight * scale);
    const padX = Math.floor((inputSize - newWidth) / 2);
    const padY = Math.floor((inputSize - newHeight) / 2);
    
    // Fill with YOLO default padding color
    this.ctx.fillStyle = 'rgb(114, 114, 114)';
    this.ctx.fillRect(0, 0, inputSize, inputSize);
    
    // Draw video frame
    this.ctx.drawImage(video, padX, padY, newWidth, newHeight);
    
    // Get pixel data
    const imageData = this.ctx.getImageData(0, 0, inputSize, inputSize);
    const data = imageData.data;
    
    // Convert to CHW format and normalize
    const float32Data = new Float32Array(3 * inputSize * inputSize);
    const pixelCount = inputSize * inputSize;
    
    for (let i = 0; i < pixelCount; i++) {
      const srcIdx = i * 4;
      float32Data[i] = data[srcIdx] / 255;
      float32Data[pixelCount + i] = data[srcIdx + 1] / 255;
      float32Data[2 * pixelCount + i] = data[srcIdx + 2] / 255;
    }
    
    return float32Data;
  }

  /**
   * Preprocess image for inference
   */
  private async preprocessImage(imageSource: string | HTMLImageElement): Promise<{ data: Float32Array; width: number; height: number }> {
    if (!this.canvas || !this.ctx) {
      throw new Error('Canvas not initialized');
    }
    
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
    const inputSize = this.inputSize;
    
    const scale = Math.min(inputSize / imgWidth, inputSize / imgHeight);
    const newWidth = Math.round(imgWidth * scale);
    const newHeight = Math.round(imgHeight * scale);
    const padX = Math.floor((inputSize - newWidth) / 2);
    const padY = Math.floor((inputSize - newHeight) / 2);
    
    this.ctx.fillStyle = 'rgb(114, 114, 114)';
    this.ctx.fillRect(0, 0, inputSize, inputSize);
    this.ctx.drawImage(img, padX, padY, newWidth, newHeight);
    
    const imageData = this.ctx.getImageData(0, 0, inputSize, inputSize);
    const data = imageData.data;
    
    const float32Data = new Float32Array(3 * inputSize * inputSize);
    const pixelCount = inputSize * inputSize;
    
    for (let i = 0; i < pixelCount; i++) {
      const srcIdx = i * 4;
      float32Data[i] = data[srcIdx] / 255;
      float32Data[pixelCount + i] = data[srcIdx + 1] / 255;
      float32Data[2 * pixelCount + i] = data[srcIdx + 2] / 255;
    }
    
    return { data: float32Data, width: imgWidth, height: imgHeight };
  }

  /**
   * Parse YOLO output to find best detection
   * @param isVideo - Use lower threshold for video (more noise/blur)
   */
  private parseOutput(
    outputData: Float32Array, 
    dims: number[], 
    originalWidth: number, 
    originalHeight: number,
    isVideo: boolean = false
  ): AadhaarDetectionResult {
    const inputSize = this.inputSize;
    const scale = Math.min(inputSize / originalWidth, inputSize / originalHeight);
    const padX = Math.floor((inputSize - originalWidth * scale) / 2);
    const padY = Math.floor((inputSize - originalHeight * scale) / 2);
    
    const numDetections = dims[2] || 8400;
    // Lower threshold for video (0.15) vs image (0.25)
    // Video has motion blur and lower quality frames
    const confidenceThreshold = isVideo ? 0.15 : 0.25;
    
    let bestDetection: AadhaarDetectionResult = {
      detected: false,
      cardType: null,
      confidence: 0
    };
    
    for (let i = 0; i < numDetections; i++) {
      const classScores = [];
      for (let c = 0; c < 3; c++) {
        const idx = (4 + c) * numDetections + i;
        classScores.push(outputData[idx] || 0);
      }
      
      const maxScore = Math.max(...classScores);
      const maxClassIdx = classScores.indexOf(maxScore);
      
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
      }
    }
    
    return bestDetection;
  }

  /**
   * Run detection on video element
   */
  async detectVideo(video: HTMLVideoElement): Promise<AadhaarDetectionResult> {
    if (!this.session || !this.ort) {
      return { detected: false, cardType: null, confidence: 0 };
    }

    try {
      const originalWidth = video.videoWidth;
      const originalHeight = video.videoHeight;
      const inputSize = this.inputSize;
      
      const inputData = this.preprocessVideo(video);
      
      const tensor = new this.ort.Tensor(
        'float32',
        inputData,
        [1, 3, inputSize, inputSize]
      );

      const inputName = this.session.inputNames[0];
      const results = await this.session.run({ [inputName]: tensor });
      
      const outputName = this.session.outputNames[0];
      const output = results[outputName];
      const outputData = output.data as Float32Array;
      
      const result = this.parseOutput(outputData, output.dims, originalWidth, originalHeight, true);
      
      // Dispose tensors to free memory
      if (tensor.dispose) tensor.dispose();
      if (output.dispose) output.dispose();
      
      return result;

    } catch (err) {
      console.error('[ModelManager] Detection error:', err);
      return { detected: false, cardType: null, confidence: 0 };
    }
  }

  /**
   * Run detection on image
   */
  async detectImage(imageSource: string | HTMLImageElement): Promise<AadhaarDetectionResult> {
    if (!this.session || !this.ort) {
      return { detected: false, cardType: null, confidence: 0 };
    }

    try {
      const { data: inputData, width: originalWidth, height: originalHeight } = await this.preprocessImage(imageSource);
      const inputSize = this.inputSize;
      
      const tensor = new this.ort.Tensor(
        'float32',
        inputData,
        [1, 3, inputSize, inputSize]
      );

      const inputName = this.session.inputNames[0];
      const results = await this.session.run({ [inputName]: tensor });
      
      const outputName = this.session.outputNames[0];
      const output = results[outputName];
      const outputData = output.data as Float32Array;
      
      const result = this.parseOutput(outputData, output.dims, originalWidth, originalHeight, false);
      
      // Dispose tensors to free memory
      if (tensor.dispose) tensor.dispose();
      if (output.dispose) output.dispose();
      
      return result;

    } catch (err) {
      console.error('[ModelManager] Image detection error:', err);
      return { detected: false, cardType: null, confidence: 0 };
    }
  }
}

/**
 * Get the singleton model manager instance
 */
export function getAadhaarModelManager(): AadhaarModelManager {
  if (typeof window === 'undefined') {
    // Server-side - return a dummy
    return new AadhaarModelManager();
  }
  
  if (!window.__aadhaarModelManager) {
    window.__aadhaarModelManager = new AadhaarModelManager();
  }
  return window.__aadhaarModelManager;
}

/**
 * Force unload model to free memory (call when leaving verification flow)
 */
export async function unloadAadhaarModel(): Promise<void> {
  if (typeof window !== 'undefined' && window.__aadhaarModelManager) {
    await window.__aadhaarModelManager.forceUnload();
  }
}

/**
 * Preload the INT8 model for mobile devices
 * Call this early in your app to start loading in background
 */
export async function preloadInt8Model(): Promise<void> {
  const manager = getAadhaarModelManager();
  await manager.loadModel('int8');
}

/**
 * Load the best model for the current device (auto-detect)
 */
export async function loadBestModel(): Promise<void> {
  const manager = getAadhaarModelManager();
  await manager.loadModel('auto');
}

/**
 * Get available model variants with their expected sizes
 */
export function getModelVariants(): Record<ModelVariant, { path: string; expectedSizeMB: number; description: string }> {
  return {
    full: { 
      path: MODEL_PATHS.full, 
      expectedSizeMB: 99, 
      description: 'Full precision FP32 model (640px input)' 
    },
    small: { 
      path: MODEL_PATHS.small, 
      expectedSizeMB: 99, 
      description: 'Full precision FP32 model (320px input, faster)' 
    },
    int8: { 
      path: MODEL_PATHS.int8, 
      expectedSizeMB: 25, 
      description: 'INT8 quantized model (640px input, ~4x smaller)' 
    },
    int8_small: { 
      path: MODEL_PATHS.int8_small, 
      expectedSizeMB: 25, 
      description: 'INT8 quantized model (320px input, smallest & fastest)' 
    },
  };
}
