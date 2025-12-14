'use client';
import { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface Props {
  onCapture: (base64: string) => void;
  label: string;
  initialImage: string | null;
}

export default function CameraCapture({ onCapture, label, initialImage }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [isStreaming, setIsStreaming] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [preview, setPreview] = useState<string | null>(initialImage);
  const [error, setError] = useState<string | null>(null);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setIsStreaming(false);
    }
  };

  const startCamera = async () => {
    setError(null);
    stopCamera(); // Ensure previous stream is closed

    try {
      // 1. Try requested facing mode
      const constraints = { 
        video: { 
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      };

      let stream: MediaStream;
      
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        // 2. Fallback: If 'environment' fails (common on laptops), try any camera
        console.warn("Specific camera constraint failed, trying default.", err);
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Wait for video to be ready before setting streaming state
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(e => console.error("Play error:", e));
          setIsStreaming(true);
        };
      }
    } catch (err: any) {
      console.error("Camera Error:", err);
      setError("Camera access denied or not available. Please allow permissions.");
      setIsStreaming(false);
    }
  };

  const captureImage = useCallback(() => {
    if (!videoRef.current || !isStreaming) return;
    
    const canvas = document.createElement('canvas');
    const video = videoRef.current;
    
    // Match canvas size to video actual size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Mirror if user facing
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    
    ctx.drawImage(video, 0, 0);
    
    // Compress quality to 0.8 to save space
    const base64 = canvas.toDataURL('image/jpeg', 0.8);
    
    stopCamera();
    setPreview(base64);
    onCapture(base64);
  }, [onCapture, isStreaming, facingMode]);

  const retake = () => {
    setPreview(null);
    startCamera();
  };

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto p-4 border rounded-xl bg-white shadow-sm">
      <h3 className="text-lg font-semibold mb-3">{label}</h3>
      
      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm mb-4 w-full text-center">
          {error}
        </div>
      )}

      <div className="relative w-full aspect-[4/3] bg-gray-900 rounded-lg overflow-hidden mb-4">
        {preview ? (
          <Image 
            src={preview} 
            alt="Preview" 
            fill 
            className="object-cover" 
            unoptimized // Allow base64
          />
        ) : (
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted // CRITICAL: Muted is often required for autoplay
            className={cn(
              "w-full h-full object-cover transition-transform", 
              facingMode === 'user' && "scale-x-[-1]"
            )}
          />
        )}
        
        {!isStreaming && !preview && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                <Camera size={48} />
                <p className="mt-2 text-sm">Ready</p>
            </div>
        )}
      </div>

      <div className="flex gap-4">
        {preview ? (
          <button 
            onClick={retake}
            className="flex items-center gap-2 px-6 py-2 bg-gray-100 text-gray-800 rounded-full hover:bg-gray-200"
          >
            <RefreshCw size={18} /> Retake
          </button>
        ) : !isStreaming ? (
          <button 
            onClick={startCamera}
            className="px-6 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 font-medium"
          >
            Open Camera
          </button>
        ) : (
          <>
            <button 
              onClick={() => {
                setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
                // Allow state to update before restarting
                setTimeout(startCamera, 100);
              }}
              className="p-3 bg-gray-700 text-white rounded-full hover:bg-gray-600"
              title="Switch Camera"
            >
              <RefreshCw size={20} />
            </button>
            <button 
              onClick={captureImage}
              className="px-8 py-2 bg-red-600 text-white rounded-full font-bold shadow-lg hover:bg-red-700"
            >
              Capture
            </button>
          </>
        )}
      </div>
    </div>
  );
}