'use client';
import { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, RefreshCw, X } from 'lucide-react';
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

  // --- MAGIC FIX: Sync prop changes to local state ---
  // This ensures if you upload a file from the parent, it shows up here in the box!
  useEffect(() => {
    if (initialImage) {
      setPreview(initialImage);
      stopCamera(); // Stop camera if image is loaded
    }
  }, [initialImage]);

  useEffect(() => {
    // Start camera automatically if no image exists
    if (!preview) {
      startCamera();
    }
    return () => stopCamera();
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
    stopCamera(); 

    try {
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
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(e => console.error(e));
          setIsStreaming(true);
        };
      }
    } catch (err: any) {
      setError("Camera access denied.");
      setIsStreaming(false);
    }
  };

  const captureImage = useCallback(() => {
    if (!videoRef.current || !isStreaming) return;
    
    const canvas = document.createElement('canvas');
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (facingMode === 'user') {
      ctx?.translate(canvas.width, 0);
      ctx?.scale(-1, 1);
    }
    
    ctx?.drawImage(video, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg', 0.8);
    
    stopCamera();
    setPreview(base64);
    onCapture(base64);
  }, [onCapture, isStreaming, facingMode]);

  const retake = () => {
    setPreview(null);
    onCapture(''); // Clear parent state
    startCamera();
  };

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto p-4 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50">
      <h3 className="text-lg font-semibold mb-3 text-gray-700">{label}</h3>
      
      {/* THE BOX */}
      <div className="relative w-full aspect-[4/3] bg-black rounded-lg overflow-hidden mb-4 shadow-inner ring-4 ring-white">
        
        {/* Scenario 1: Image is uploaded/captured */}
        {preview ? (
          <div className="relative w-full h-full">
            <Image 
              src={preview} 
              alt="Preview" 
              fill 
              className="object-contain bg-black" 
              unoptimized 
            />
            {/* Overlay to show it's a static image */}
            <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
              Captured
            </div>
          </div>
        ) : (
          /* Scenario 2: Camera Stream */
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className={cn(
              "w-full h-full object-cover", 
              facingMode === 'user' && "scale-x-[-1]"
            )}
          />
        )}

        {/* Loading/Error State */}
        {!isStreaming && !preview && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                <Camera size={48} />
                <p className="mt-2 text-sm">Starting Camera...</p>
            </div>
        )}
      </div>

      <div className="flex gap-4">
        {preview ? (
          <button 
            onClick={retake}
            className="flex items-center gap-2 px-6 py-2 bg-white border border-gray-300 text-gray-800 rounded-full hover:bg-gray-100 shadow-sm"
          >
            <RefreshCw size={18} /> Retake / Re-upload
          </button>
        ) : (
          <div className="flex gap-4">
             <button 
              onClick={() => {
                setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
                setTimeout(startCamera, 100);
              }}
              className="p-3 bg-gray-200 text-gray-700 rounded-full hover:bg-gray-300"
            >
              <RefreshCw size={20} />
            </button>
            <button 
              onClick={captureImage}
              className="px-8 py-2 bg-blue-600 text-white rounded-full font-bold shadow-lg hover:bg-blue-700"
            >
              Capture Photo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}