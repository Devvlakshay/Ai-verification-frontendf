'use client';
/**
 * Hook for on-device Aadhaar card detection
 * 
 * OPTIMIZED VERSION: Uses singleton model manager to prevent duplicate model loading.
 * This reduces memory from ~200MB per component to a single shared ~100MB session.
 * 
 * Memory optimization features:
 * - Single shared ONNX session via model manager
 * - Proper cleanup on unmount
 * - Reference counting for safe resource management
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { 
  getAadhaarModelManager, 
  AadhaarDetectionResult 
} from '@/lib/aadhaar-model-manager';

// Re-export types for backwards compatibility
export type { AadhaarDetectionResult } from '@/lib/aadhaar-model-manager';

interface UseAadhaarDetectionReturn {
  isModelLoading: boolean;
  loadProgress: number;
  isModelReady: boolean;
  error: string | null;
  detect: (videoElement: HTMLVideoElement) => Promise<AadhaarDetectionResult>;
  detectImage: (imageSource: string | HTMLImageElement) => Promise<AadhaarDetectionResult>;
  loadModel: () => Promise<void>;
}

export function useAadhaarDetection(): UseAadhaarDetectionReturn {
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [isModelReady, setIsModelReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const mountedRef = useRef(true);

  // Subscribe to manager state changes
  useEffect(() => {
    mountedRef.current = true;
    const manager = getAadhaarModelManager();
    
    // Acquire reference to indicate this component is using the model
    manager.acquire();
    
    // Check initial state
    if (manager.isReady()) {
      setIsModelReady(true);
      setLoadProgress(100);
    }
    
    // Subscribe to progress updates
    const unsubProgress = manager.onProgress((progress) => {
      if (mountedRef.current) {
        setLoadProgress(progress);
      }
    });
    
    // Subscribe to state changes
    const unsubState = manager.onStateChange((state) => {
      if (mountedRef.current) {
        setIsModelLoading(state === 'loading');
        setIsModelReady(state === 'ready');
        if (state === 'error') {
          setError('Failed to load model');
        }
      }
    });
    
    return () => {
      mountedRef.current = false;
      unsubProgress();
      unsubState();
      // Release reference when component unmounts
      manager.release();
    };
  }, []);

  const loadModel = useCallback(async () => {
    const manager = getAadhaarModelManager();
    
    if (manager.isReady()) {
      if (mountedRef.current) {
        setIsModelReady(true);
      }
      return;
    }

    if (mountedRef.current) {
      setError(null);
    }

    try {
      await manager.loadModel();
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load model');
      }
    }
  }, []);

  const detect = useCallback(async (video: HTMLVideoElement): Promise<AadhaarDetectionResult> => {
    const manager = getAadhaarModelManager();
    
    if (!manager.isReady()) {
      return { detected: false, cardType: null, confidence: 0 };
    }

    return manager.detectVideo(video);
  }, []);

  const detectImage = useCallback(async (imageSource: string | HTMLImageElement): Promise<AadhaarDetectionResult> => {
    const manager = getAadhaarModelManager();
    
    if (!manager.isReady()) {
      // Try to load model first
      try {
        await manager.loadModel();
      } catch {
        return { detected: false, cardType: null, confidence: 0 };
      }
    }

    return manager.detectImage(imageSource);
  }, []);

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
