'use client';

/**
 * EdgeDetector Component
 * Provides on-device Aadhaar card detection using ONNX Runtime Web
 */

import React, { useEffect, useState, useRef } from 'react';
import { useEdgeInference } from '@/hooks/useEdgeInference';
import { InferenceResult, Detection } from '@/lib/edge-inference';

interface EdgeDetectorProps {
  /** Image source - URL, base64, or File */
  image?: string | File | null;
  /** Whether to use the smaller, faster model */
  useSmallModel?: boolean;
  /** Callback when detection completes */
  onDetectionComplete?: (result: InferenceResult) => void;
  /** Callback when model is loaded */
  onModelLoaded?: () => void;
  /** Callback on error */
  onError?: (error: string) => void;
  /** Show detection overlay on image */
  showOverlay?: boolean;
  /** Show debug information */
  showDebug?: boolean;
  /** Custom class name */
  className?: string;
  /** Auto-detect when image changes */
  autoDetect?: boolean;
}

export function EdgeDetector({
  image,
  useSmallModel = false,
  onDetectionComplete,
  onModelLoaded,
  onError,
  showOverlay = true,
  showDebug = false,
  className = '',
  autoDetect = true,
}: EdgeDetectorProps) {
  const {
    modelState,
    loadProgress,
    isProcessing,
    result,
    error,
    loadModel,
    detect,
  } = useEdgeInference({
    useSmallModel,
    autoLoad: true,
    onModelLoaded,
    onError: (err) => onError?.(err.message),
  });

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Convert File to URL
  useEffect(() => {
    if (!image) {
      setImageUrl(null);
      return;
    }

    if (image instanceof File) {
      const url = URL.createObjectURL(image);
      setImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setImageUrl(image);
    }
  }, [image]);

  // Auto-detect when image changes
  useEffect(() => {
    if (autoDetect && imageUrl && modelState === 'ready') {
      handleDetect();
    }
  }, [imageUrl, modelState, autoDetect]);

  // Notify parent of results
  useEffect(() => {
    if (result) {
      onDetectionComplete?.(result);
    }
  }, [result, onDetectionComplete]);

  // Notify parent of errors
  useEffect(() => {
    if (error) {
      onError?.(error);
    }
  }, [error, onError]);

  const handleDetect = async () => {
    if (!imageUrl) return;
    await detect(imageUrl);
  };

  // Draw detection overlay
  useEffect(() => {
    if (!showOverlay || !canvasRef.current || !imageRef.current || !result) return;

    const canvas = canvasRef.current;
    const img = imageRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Wait for image to load
    if (!img.complete) {
      img.onload = () => drawOverlay(ctx, img, result.detections);
    } else {
      drawOverlay(ctx, img, result.detections);
    }
  }, [result, showOverlay]);

  const drawOverlay = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    detections: Detection[]
  ) => {
    const canvas = ctx.canvas;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    // Draw image
    ctx.drawImage(img, 0, 0);

    // Draw detections
    for (const det of detections) {
      const color = getClassColor(det.class);
      
      // Draw bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(det.bbox.x, det.bbox.y, det.bbox.width, det.bbox.height);

      // Draw label background
      ctx.fillStyle = color;
      const label = `${det.class} ${(det.confidence * 100).toFixed(1)}%`;
      const textMetrics = ctx.measureText(label);
      const labelHeight = 24;
      ctx.fillRect(det.bbox.x, det.bbox.y - labelHeight, textMetrics.width + 10, labelHeight);

      // Draw label text
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px Arial';
      ctx.fillText(label, det.bbox.x + 5, det.bbox.y - 7);
    }
  };

  const getClassColor = (className: string): string => {
    switch (className) {
      case 'aadhaar_front':
        return '#22c55e'; // Green
      case 'aadhaar_back':
        return '#3b82f6'; // Blue
      case 'print_aadhaar':
        return '#ef4444'; // Red
      default:
        return '#f59e0b'; // Orange
    }
  };

  const getStatusText = (): string => {
    if (modelState === 'loading') return `Loading model... ${loadProgress}%`;
    if (modelState === 'error') return `Error: ${error}`;
    if (isProcessing) return 'Detecting...';
    if (result) {
      if (result.printAadhaarDetected) return '⚠️ Print Aadhaar Detected - Security Risk';
      if (result.frontDetected && result.backDetected) return '✅ Both sides detected';
      if (result.frontDetected) return '✅ Front side detected';
      if (result.backDetected) return '✅ Back side detected';
      return '❌ No Aadhaar card detected';
    }
    return modelState === 'ready' ? 'Ready to detect' : 'Initializing...';
  };

  return (
    <div className={`edge-detector ${className}`}>
      {/* Model Loading Progress */}
      {modelState === 'loading' && (
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Loading AI Model</span>
            <span>{loadProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${loadProgress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            First load downloads ~100MB model to your device
          </p>
        </div>
      )}

      {/* Image Display */}
      {imageUrl && (
        <div className="relative">
          {showOverlay && result ? (
            <canvas
              ref={canvasRef}
              className="w-full h-auto rounded-lg"
            />
          ) : null}
          <img
            ref={imageRef}
            src={imageUrl}
            alt="Detection input"
            className={`w-full h-auto rounded-lg ${showOverlay && result ? 'hidden' : ''}`}
            crossOrigin="anonymous"
          />
          
          {/* Processing Overlay */}
          {isProcessing && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
              <div className="text-white text-center">
                <div className="animate-spin w-10 h-10 border-4 border-white border-t-transparent rounded-full mx-auto mb-2" />
                <p>Analyzing on device...</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status */}
      <div className={`mt-4 p-3 rounded-lg ${
        result?.printAadhaarDetected ? 'bg-red-100 text-red-800' :
        result?.success ? 'bg-green-100 text-green-800' :
        error ? 'bg-red-100 text-red-800' :
        'bg-gray-100 text-gray-800'
      }`}>
        <p className="font-medium">{getStatusText()}</p>
        
        {result && !result.printAadhaarDetected && (
          <div className="mt-2 text-sm">
            <p>Front: {result.frontDetected ? `✓ ${(result.frontConfidence * 100).toFixed(1)}%` : '✗ Not detected'}</p>
            <p>Back: {result.backDetected ? `✓ ${(result.backConfidence * 100).toFixed(1)}%` : '✗ Not detected'}</p>
          </div>
        )}
      </div>

      {/* Debug Info */}
      {showDebug && result && (
        <div className="mt-4 p-3 bg-gray-900 text-green-400 rounded-lg text-xs font-mono overflow-auto max-h-48">
          <p>Model: {useSmallModel ? 'small (320px)' : 'standard (640px)'}</p>
          <p>Inference Time: {result.inferenceTime.toFixed(2)}ms</p>
          <p>Detections: {result.detections.length}</p>
          <pre>{JSON.stringify(result.detections, null, 2)}</pre>
        </div>
      )}

      {/* Manual Detect Button */}
      {!autoDetect && imageUrl && modelState === 'ready' && (
        <button
          onClick={handleDetect}
          disabled={isProcessing}
          className="mt-4 w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isProcessing ? 'Detecting...' : 'Detect Aadhaar Card'}
        </button>
      )}
    </div>
  );
}

export default EdgeDetector;
