'use client';
import { useRef, useEffect, useCallback } from 'react';
import { Area } from 'react-easy-crop';

type WorkerMessage = {
  type: 'CROP_COMPLETE' | 'RESIZE_COMPLETE' | 'ERROR';
  payload: {
    base64?: string;
    resized?: boolean;
    message?: string;
  };
};

export function useImageWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingCallbacks = useRef<Map<string, { resolve: (val: any) => void; reject: (err: Error) => void }>>(new Map());

  // Initialize worker
  useEffect(() => {
    if (typeof window !== 'undefined' && window.Worker) {
      workerRef.current = new Worker('/workers/image-processor.js');

      workerRef.current.onmessage = (e: MessageEvent<WorkerMessage>) => {
        const { type, payload } = e.data;

        if (type === 'ERROR') {
          // Reject all pending operations
          pendingCallbacks.current.forEach(({ reject }) => {
            reject(new Error(payload.message || 'Worker error'));
          });
          pendingCallbacks.current.clear();
          return;
        }

        const callbackKey = type === 'CROP_COMPLETE' ? 'crop' : 'resize';
        const callback = pendingCallbacks.current.get(callbackKey);
        
        if (callback) {
          callback.resolve(payload);
          pendingCallbacks.current.delete(callbackKey);
        }
      };

      workerRef.current.onerror = (error) => {
        console.error('[ImageWorker] Error:', error);
        pendingCallbacks.current.forEach(({ reject }) => {
          reject(new Error('Worker failed'));
        });
        pendingCallbacks.current.clear();
      };
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  // Crop image using worker
  const cropImage = useCallback(async (
    imageSrc: string,
    pixelCrop: Area,
    rotation: number = 0
  ): Promise<string> => {
    if (!workerRef.current) {
      throw new Error('Worker not available');
    }

    // Load image and create ImageBitmap (can be transferred to worker)
    const response = await fetch(imageSrc);
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);

    return new Promise((resolve, reject) => {
      pendingCallbacks.current.set('crop', { resolve: (p) => resolve(p.base64), reject });

      workerRef.current!.postMessage(
        {
          type: 'CROP_IMAGE',
          payload: { imageBitmap, pixelCrop, rotation },
        },
        [imageBitmap] // Transfer ownership for better performance
      );
    });
  }, []);

  // Resize image using worker
  const resizeImage = useCallback(async (
    imageSrc: string,
    maxSize: number = 1200
  ): Promise<{ base64: string | null; resized: boolean }> => {
    if (!workerRef.current) {
      throw new Error('Worker not available');
    }

    const response = await fetch(imageSrc);
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);

    return new Promise((resolve, reject) => {
      pendingCallbacks.current.set('resize', { resolve, reject });

      workerRef.current!.postMessage(
        {
          type: 'RESIZE_IMAGE',
          payload: { imageBitmap, maxSize },
        },
        [imageBitmap]
      );
    });
  }, []);

  // Check if worker is available
  const isWorkerAvailable = useCallback(() => {
    return workerRef.current !== null;
  }, []);

  return { cropImage, resizeImage, isWorkerAvailable };
}
