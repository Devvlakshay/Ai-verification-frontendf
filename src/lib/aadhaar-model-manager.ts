'use client';
/**
 * Singleton Manager for Aadhaar Detection ONNX Model
 * 
 * This manager ensures only ONE model instance is loaded across the entire app,
 * significantly reducing memory usage from ~200MB per instance to a single ~100MB.
 * 
 * Memory optimization features:
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
const MODEL_INPUT_SIZE = 640;
const ONNX_CDN_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/ort.min.js';

class AadhaarModelManager {
  private session: OrtInferenceSession | null = null;
  private ort: OrtModule | null = null;
  private state: ModelState = 'idle';
  private loadProgress = 0;
  private refCount = 0;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  
  // Callbacks for state updates
  private progressCallbacks: Set<LoadProgressCallback> = new Set();
  private stateCallbacks: Set<StateChangeCallback> = new Set();
  
  // Loading promise to prevent duplicate loads
  private loadingPromise: Promise<void> | null = null;

  constructor() {
    // Create reusable canvas for preprocessing
    if (typeof window !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = MODEL_INPUT_SIZE;
      this.canvas.height = MODEL_INPUT_SIZE;
      this.ctx = this.canvas.getContext('2d', { 
        willReadFrequently: true,
        alpha: false 
      });
    }
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
   */
  async loadModel(): Promise<void> {
    // Already ready
    if (this.state === 'ready' && this.session) {
      return;
    }

    // Already loading - wait for existing load
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = this._loadModelInternal();
    
    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async _loadModelInternal(): Promise<void> {
    this.setState('loading');
    this.setProgress(0);

    try {
      console.log('[ModelManager] Loading ONNX Runtime...');
      await this.loadOnnxRuntime();
      this.setProgress(10);
      
      console.log('[ModelManager] Fetching model...');
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

      this.setState('ready');
      this.setProgress(100);
      
      console.log('[ModelManager] Model loaded successfully');
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
    
    // Calculate letterbox parameters
    const scale = Math.min(MODEL_INPUT_SIZE / videoWidth, MODEL_INPUT_SIZE / videoHeight);
    const newWidth = Math.round(videoWidth * scale);
    const newHeight = Math.round(videoHeight * scale);
    const padX = Math.floor((MODEL_INPUT_SIZE - newWidth) / 2);
    const padY = Math.floor((MODEL_INPUT_SIZE - newHeight) / 2);
    
    // Fill with YOLO default padding color
    this.ctx.fillStyle = 'rgb(114, 114, 114)';
    this.ctx.fillRect(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    
    // Draw video frame
    this.ctx.drawImage(video, padX, padY, newWidth, newHeight);
    
    // Get pixel data
    const imageData = this.ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    const data = imageData.data;
    
    // Convert to CHW format and normalize
    const float32Data = new Float32Array(3 * MODEL_INPUT_SIZE * MODEL_INPUT_SIZE);
    const pixelCount = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
    
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
    
    const scale = Math.min(MODEL_INPUT_SIZE / imgWidth, MODEL_INPUT_SIZE / imgHeight);
    const newWidth = Math.round(imgWidth * scale);
    const newHeight = Math.round(imgHeight * scale);
    const padX = Math.floor((MODEL_INPUT_SIZE - newWidth) / 2);
    const padY = Math.floor((MODEL_INPUT_SIZE - newHeight) / 2);
    
    this.ctx.fillStyle = 'rgb(114, 114, 114)';
    this.ctx.fillRect(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    this.ctx.drawImage(img, padX, padY, newWidth, newHeight);
    
    const imageData = this.ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    const data = imageData.data;
    
    const float32Data = new Float32Array(3 * MODEL_INPUT_SIZE * MODEL_INPUT_SIZE);
    const pixelCount = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
    
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
   */
  private parseOutput(
    outputData: Float32Array, 
    dims: number[], 
    originalWidth: number, 
    originalHeight: number
  ): AadhaarDetectionResult {
    const scale = Math.min(MODEL_INPUT_SIZE / originalWidth, MODEL_INPUT_SIZE / originalHeight);
    const padX = Math.floor((MODEL_INPUT_SIZE - originalWidth * scale) / 2);
    const padY = Math.floor((MODEL_INPUT_SIZE - originalHeight * scale) / 2);
    
    const numDetections = dims[2] || 8400;
    const confidenceThreshold = 0.25;
    
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
      
      const inputData = this.preprocessVideo(video);
      
      const tensor = new this.ort.Tensor(
        'float32',
        inputData,
        [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]
      );

      const inputName = this.session.inputNames[0];
      const results = await this.session.run({ [inputName]: tensor });
      
      const outputName = this.session.outputNames[0];
      const output = results[outputName];
      const outputData = output.data as Float32Array;
      
      const result = this.parseOutput(outputData, output.dims, originalWidth, originalHeight);
      
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
      
      const tensor = new this.ort.Tensor(
        'float32',
        inputData,
        [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]
      );

      const inputName = this.session.inputNames[0];
      const results = await this.session.run({ [inputName]: tensor });
      
      const outputName = this.session.outputNames[0];
      const output = results[outputName];
      const outputData = output.data as Float32Array;
      
      const result = this.parseOutput(outputData, output.dims, originalWidth, originalHeight);
      
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
