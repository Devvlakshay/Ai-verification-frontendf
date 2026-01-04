'use client';

/**
 * React Hook for Edge-based ONNX Inference
 * Provides easy integration of on-device ML inference in React components
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  EdgeInferenceEngine,
  ModelConfig,
  InferenceResult,
  ModelLoadingState,
  DEFAULT_MODEL_CONFIG,
  SMALL_MODEL_CONFIG,
} from '@/lib/edge-inference';

interface UseEdgeInferenceOptions {
  /** Use smaller model for faster inference on slower devices */
  useSmallModel?: boolean;
  /** Custom model configuration */
  config?: Partial<ModelConfig>;
  /** Auto-load model on mount */
  autoLoad?: boolean;
  /** Callback when model is loaded */
  onModelLoaded?: () => void;
  /** Callback when error occurs */
  onError?: (error: Error) => void;
}

interface UseEdgeInferenceReturn {
  /** Current model loading state */
  modelState: ModelLoadingState;
  /** Model download progress (0-100) */
  loadProgress: number;
  /** Whether inference is in progress */
  isProcessing: boolean;
  /** Last inference result */
  result: InferenceResult | null;
  /** Last error message */
  error: string | null;
  /** Load the model */
  loadModel: () => Promise<void>;
  /** Run inference on an image */
  detect: (image: string | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | Blob | ImageData) => Promise<InferenceResult>;
  /** Reset state and unload model */
  reset: () => void;
}

export function useEdgeInference(
  options: UseEdgeInferenceOptions = {}
): UseEdgeInferenceReturn {
  const {
    useSmallModel = false,
    config: customConfig,
    autoLoad = false,
    onModelLoaded,
    onError,
  } = options;

  const [modelState, setModelState] = useState<ModelLoadingState>('idle');
  const [loadProgress, setLoadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const engineRef = useRef<EdgeInferenceEngine | null>(null);

  // Initialize engine
  useEffect(() => {
    const baseConfig = useSmallModel ? SMALL_MODEL_CONFIG : DEFAULT_MODEL_CONFIG;
    const finalConfig = { ...baseConfig, ...customConfig };
    engineRef.current = new EdgeInferenceEngine(finalConfig);

    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [useSmallModel, customConfig]);

  // Auto-load model if enabled
  useEffect(() => {
    if (autoLoad && modelState === 'idle') {
      loadModel();
    }
  }, [autoLoad]);

  const loadModel = useCallback(async () => {
    if (!engineRef.current) return;
    if (modelState === 'loading' || modelState === 'ready') return;

    setModelState('loading');
    setError(null);
    setLoadProgress(0);

    try {
      await engineRef.current.loadModel((progress) => {
        setLoadProgress(Math.round(progress));
      });
      setModelState('ready');
      onModelLoaded?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load model');
      setModelState('error');
      setError(error.message);
      onError?.(error);
    }
  }, [modelState, onModelLoaded, onError]);

  const detect = useCallback(async (
    image: string | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | Blob | ImageData
  ): Promise<InferenceResult> => {
    if (!engineRef.current) {
      const errorResult: InferenceResult = {
        success: false,
        detections: [],
        frontDetected: false,
        backDetected: false,
        printAadhaarDetected: false,
        frontConfidence: 0,
        backConfidence: 0,
        inferenceTime: 0,
        error: 'Engine not initialized',
      };
      setResult(errorResult);
      return errorResult;
    }

    if (!engineRef.current.isReady()) {
      // Auto-load if not loaded
      await loadModel();
    }

    setIsProcessing(true);
    setError(null);

    try {
      const inferenceResult = await engineRef.current.detect(image);
      setResult(inferenceResult);
      
      if (!inferenceResult.success && inferenceResult.error) {
        setError(inferenceResult.error);
      }
      
      return inferenceResult;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Inference failed');
      const errorResult: InferenceResult = {
        success: false,
        detections: [],
        frontDetected: false,
        backDetected: false,
        printAadhaarDetected: false,
        frontConfidence: 0,
        backConfidence: 0,
        inferenceTime: 0,
        error: error.message,
      };
      setResult(errorResult);
      setError(error.message);
      onError?.(error);
      return errorResult;
    } finally {
      setIsProcessing(false);
    }
  }, [loadModel, onError]);

  const reset = useCallback(() => {
    setModelState('idle');
    setLoadProgress(0);
    setIsProcessing(false);
    setResult(null);
    setError(null);
    
    if (engineRef.current) {
      engineRef.current.dispose();
      const baseConfig = useSmallModel ? SMALL_MODEL_CONFIG : DEFAULT_MODEL_CONFIG;
      const finalConfig = { ...baseConfig, ...customConfig };
      engineRef.current = new EdgeInferenceEngine(finalConfig);
    }
  }, [useSmallModel, customConfig]);

  return {
    modelState,
    loadProgress,
    isProcessing,
    result,
    error,
    loadModel,
    detect,
    reset,
  };
}

export default useEdgeInference;
