'use client';
import { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, RefreshCw, AlertCircle, Upload, CheckCircle2, Loader2, RotateCw, RotateCcw, ZoomIn, ZoomOut, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import Cropper, { Area, Point } from 'react-easy-crop';
import { useAadhaarDetection, AadhaarDetectionResult } from '@/hooks/useAadhaarDetection';

interface Props {
  onCapture: (base64: string, detection?: AadhaarDetectionResult) => void;
  label: string;
  initialImage: string | null;
  // Expected card side for validation
  cardSide?: 'front' | 'back';
}

type CaptureMode = 'camera' | 'preview' | 'crop';

// Helper function to get rotated bounding box
const getRotatedBoundingBox = (width: number, height: number, rotation: number) => {
  const rotRad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rotRad));
  const cos = Math.abs(Math.cos(rotRad));
  return {
    width: Math.round(width * cos + height * sin),
    height: Math.round(width * sin + height * cos),
  };
};

// Helper function to create cropped image
const createCroppedImage = async (
  imageSrc: string,
  pixelCrop: Area,
  rotation: number = 0
): Promise<string> => {
  const image = new window.Image();
  image.crossOrigin = 'anonymous';
  
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');

  const rotRad = (rotation * Math.PI) / 180;
  const { width: bBoxWidth, height: bBoxHeight } = getRotatedBoundingBox(
    image.width,
    image.height,
    rotation
  );

  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);

  const croppedCanvas = document.createElement('canvas');
  const croppedCtx = croppedCanvas.getContext('2d');
  if (!croppedCtx) throw new Error('Canvas context not available');

  // Max 1280px on longest side
  const MAX_SIZE = 1280;
  let finalWidth = pixelCrop.width;
  let finalHeight = pixelCrop.height;
  
  if (finalWidth > MAX_SIZE || finalHeight > MAX_SIZE) {
    if (finalWidth > finalHeight) {
      finalHeight = Math.round(finalHeight * MAX_SIZE / finalWidth);
      finalWidth = MAX_SIZE;
    } else {
      finalWidth = Math.round(finalWidth * MAX_SIZE / finalHeight);
      finalHeight = MAX_SIZE;
    }
  }

  croppedCanvas.width = finalWidth;
  croppedCanvas.height = finalHeight;

  croppedCtx.fillStyle = '#FFFFFF';
  croppedCtx.fillRect(0, 0, finalWidth, finalHeight);
  croppedCtx.drawImage(
    canvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    finalWidth,
    finalHeight
  );

  return croppedCanvas.toDataURL('image/jpeg', 0.9);
};

export default function ImageCapture({ 
  onCapture, 
  label, 
  initialImage,
  cardSide = 'front'
}: Props) {
  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- State ---
  const [mode, setMode] = useState<CaptureMode>(initialImage ? 'preview' : 'camera');
  const [preview, setPreview] = useState<string | null>(initialImage);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Detection state
  const [lastDetection, setLastDetection] = useState<AadhaarDetectionResult | null>(null);
  const [countdown, setCountdown] = useState<number>(3);
  const [consecutiveDetections, setConsecutiveDetections] = useState<number>(0);
  
  // Crop state (for gallery uploads)
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  
  // Hook for on-device Aadhaar detection
  const { isModelLoading, loadProgress, isModelReady, detect: detectAadhaar, loadModel } = useAadhaarDetection();

  // Require 2 consecutive detections for stable detection (reduces flickering)
  const REQUIRED_CONSECUTIVE = 2;

  // Update preview when initialImage changes
  useEffect(() => {
    if (initialImage) {
      setPreview(initialImage);
      setMode('preview');
    }
  }, [initialImage]);

  // Start camera on mount if not in preview mode
  useEffect(() => {
    if (mode === 'camera' && !preview) {
      startCamera();
      loadModel();
    }
  }, []);

  // --- Real-time Detection Loop ---
  useEffect(() => {
    if (mode !== 'camera' || !isModelReady || !isStreaming) return;

    let isDetecting = false;
    const DETECTION_INTERVAL = 300; // ms between detections (faster for smoother UX)
    
    const runDetection = async () => {
      if (!videoRef.current || !isStreaming || isDetecting) return;
      if (document.hidden) return; // Skip if tab is in background
      
      isDetecting = true;
      
      try {
        const result = await detectAadhaar(videoRef.current);
        setLastDetection(result);
        
        // Track consecutive detections for stability
        const isCorrectSide = result.detected && (!cardSide || result.cardType === cardSide);
        if (isCorrectSide) {
          setConsecutiveDetections(prev => prev + 1);
        } else {
          setConsecutiveDetections(0);
        }
      } catch (err) {
        console.error('[AadhaarDetection] Error:', err);
      } finally {
        isDetecting = false;
      }
    };

    detectionIntervalRef.current = setInterval(runDetection, DETECTION_INTERVAL);

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
    };
  }, [mode, isModelReady, isStreaming, detectAadhaar, cardSide]);

  // Check if card is properly detected (requires consecutive detections for stability)
  const isCardDetected = lastDetection?.detected && 
    (!cardSide || lastDetection.cardType === cardSide) &&
    consecutiveDetections >= REQUIRED_CONSECUTIVE;
  
  const isWrongSide = lastDetection?.detected && 
    cardSide && lastDetection.cardType !== cardSide;

  // --- Auto Capture Countdown ---
  useEffect(() => {
    if (mode !== 'camera' || !isStreaming) {
      setCountdown(3);
      return;
    }

    let timer: NodeJS.Timeout;
    
    if (isCardDetected) {
      timer = setInterval(() => {
        setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else {
      setCountdown(3);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isCardDetected, mode, isStreaming]);

  // Capture when countdown reaches 0
  useEffect(() => {
    if (countdown === 0 && isCardDetected && mode === 'camera' && isStreaming) {
      captureFromCamera();
    }
  }, [countdown, isCardDetected, mode, isStreaming]);

  // --- Camera Functions ---
  const startCamera = async () => {
    setError(null);
    setMode('camera');
    setLastDetection(null);
    setCountdown(3);
    
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError("Camera API not supported. Please use HTTPS or upload from gallery.");
      return;
    }

    try {
      const constraints = { 
        video: { 
          facingMode: 'environment', // Use back camera for documents
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        // Fallback to any camera
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(e => console.error("Play error:", e));
          setIsStreaming(true);
        };
      }
    } catch (err: any) {
      console.error("Camera Error:", err);
      setError("Camera access denied. Please allow permissions or upload from gallery.");
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
    
    // Clear detection interval
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const captureFromCamera = useCallback(() => {
    if (!videoRef.current || !isStreaming) return;
    
    const canvas = document.createElement('canvas');
    const video = videoRef.current;
    
    // Reduce resolution for memory optimization (max 1280px on longest side)
    const maxDim = 1280;
    let width = video.videoWidth;
    let height = video.videoHeight;
    
    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height / width) * maxDim);
        width = maxDim;
      } else {
        width = Math.round((width / height) * maxDim);
        height = maxDim;
      }
    }
    
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0, width, height);
    
    const base64 = canvas.toDataURL('image/jpeg', 0.85);
    
    stopCamera();
    setPreview(base64);
    setMode('preview');
    
    // Pass the detection result along with the image
    onCapture(base64, lastDetection || undefined);
  }, [isStreaming, stopCamera, onCapture, lastDetection]);

  // --- Gallery/File Upload ---
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image is too large. Please select an image under 10MB.');
      return;
    }

    setError(null);
    stopCamera(); // Stop camera when opening gallery

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      // Open crop editor
      setImageToCrop(result);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
      setMode('crop');
    };
    reader.readAsDataURL(file);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // --- Crop Functions ---
  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const rotateLeft = () => setRotation(r => r - 90);
  const rotateRight = () => setRotation(r => r + 90);
  const zoomIn = () => setZoom(z => Math.min(z + 0.1, 3));
  const zoomOut = () => setZoom(z => Math.max(z - 0.1, 1));

  const confirmCrop = async () => {
    if (!imageToCrop || !croppedAreaPixels) return;
    
    setIsCropping(true);
    try {
      const croppedImage = await createCroppedImage(imageToCrop, croppedAreaPixels, rotation);
      setPreview(croppedImage);
      setImageToCrop(null);
      setMode('preview');
      onCapture(croppedImage); // Will be detected later on verify
    } catch (err) {
      console.error('Failed to crop image:', err);
      setError('Failed to process image. Please try again.');
    } finally {
      setIsCropping(false);
    }
  };

  const cancelCrop = () => {
    setImageToCrop(null);
    setMode('camera');
    setTimeout(() => startCamera(), 100);
  };

  const openGallery = () => {
    fileInputRef.current?.click();
  };

  const retake = () => {
    setPreview(null);
    setLastDetection(null);
    setCountdown(3);
    setConsecutiveDetections(0);
    setImageToCrop(null);
    setMode('camera');
    onCapture('');
    // Start camera after state update
    setTimeout(() => startCamera(), 100);
  };

  // --- Status Helpers ---
  const getStatusText = () => {
    if (isModelLoading) {
      return `Loading AI (${loadProgress}%)`;
    }
    
    if (lastDetection?.detected) {
      const side = lastDetection.cardType === 'front' ? 'Front' : 
                   lastDetection.cardType === 'back' ? 'Back' : 'Print';
      const conf = Math.round(lastDetection.confidence * 100);
      
      if (isWrongSide) {
        return `Wrong side (${side})`;
      }
      return `${side} detected (${conf}%)`;
    }
    
    if (!isModelReady && !isModelLoading) {
      return "Initializing...";
    }
    
    return "Position card in frame";
  };

  const getStatusBadgeStyles = () => {
    if (isModelLoading) {
      return "bg-blue-500/90 text-white";
    }
    if (isWrongSide) {
      return "bg-red-500/90 text-white";
    }
    if (isCardDetected) {
      return "bg-green-500/90 text-white";
    }
    return "bg-yellow-500/90 text-black";
  };

  const getCardBorderColor = () => {
    if (isWrongSide) {
      return 'border-red-500/70';
    }
    if (isCardDetected) {
      return 'border-green-500/70';
    }
    if (isModelLoading) {
      return 'border-blue-500/70';
    }
    return 'border-white/50';
  };

  // --- Render ---
  return (
    <div className="flex flex-col items-center w-full h-full mx-auto relative px-2 sm:px-4">
      <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3 text-white">{label}</h3>
      
      {error && (
        <div className="text-red-400 text-xs sm:text-sm mb-2 flex items-center gap-1">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
        title="Select image file"
        aria-label="Select image file"
      />

      {/* Camera Mode */}
      {mode === 'camera' && (
        <div className="w-full max-w-sm sm:max-w-md">
          <div className={cn(
            "relative w-full rounded-xl sm:rounded-2xl overflow-hidden mb-4 shadow-inner ring-1 ring-royal-purple bg-black",
            "aspect-[8/5]"
          )}>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-full object-cover"
            />

            {/* Overlay when streaming */}
            {isStreaming && (
              <>
                {/* Card Frame Overlay */}
                <div className="absolute inset-0 flex items-center justify-center z-10 p-4">
                  <div className={cn(
                    "w-full h-full border-4 border-dashed rounded-2xl transition-colors duration-300",
                    getCardBorderColor()
                  )} />
                </div>

                {/* Status Badge */}
                <div className="absolute top-2 sm:top-4 left-1/2 -translate-x-1/2 z-20">
                  <div className={cn(
                    "px-3 sm:px-4 py-1 sm:py-1.5 rounded-full font-bold text-[10px] sm:text-xs uppercase tracking-wide backdrop-blur-md shadow-lg transition-colors duration-300 flex items-center gap-1.5 sm:gap-2",
                    getStatusBadgeStyles()
                  )}>
                    {isModelLoading ? (
                      <Loader2 size={12} className="sm:w-3.5 sm:h-3.5 animate-spin" />
                    ) : isCardDetected ? (
                      <CheckCircle2 size={12} className="sm:w-3.5 sm:h-3.5" />
                    ) : (
                      <AlertCircle size={12} className="sm:w-3.5 sm:h-3.5" />
                    )}
                    {getStatusText()}
                  </div>
                </div>

                {/* Countdown Overlay */}
                {isCardDetected && countdown > 0 && (
                  <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                    <span className="text-7xl sm:text-8xl font-bold text-white drop-shadow-lg animate-pulse">
                      {countdown}
                    </span>
                  </div>
                )}
              </>
            )}
            
            {/* Loading state */}
            {!isStreaming && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 z-30">
                <Camera size={36} className="animate-pulse" />
                <p className="mt-2 text-xs sm:text-sm">Starting camera...</p>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="flex gap-3 justify-center">
              <button
                onClick={openGallery}
                className="flex items-center gap-2 px-5 py-2.5 bg-white/10 border border-white/30 text-white rounded-xl hover:bg-white/20 transition-all active:scale-95"
              >
                <Upload size={18} />
                <span className="text-sm">Upload from Gallery</span>
              </button>
              
              <button
                onClick={captureFromCamera}
                disabled={!isStreaming}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 rounded-xl transition-all active:scale-95 font-medium",
                  isStreaming 
                    ? "bg-lavender text-deep-violet hover:bg-lavender/90" 
                    : "bg-gray-500 text-gray-300 cursor-not-allowed"
                )}
              >
                <Camera size={18} />
                <span className="text-sm">Capture</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Mode */}
      {mode === 'preview' && preview && (
        <div className="w-full max-w-sm sm:max-w-md">
          <div className={cn(
            "relative w-full rounded-xl sm:rounded-2xl overflow-hidden mb-4 shadow-inner ring-1 ring-royal-purple",
            "aspect-[8/5]"
          )}>
            <Image src={preview} alt="Preview" fill className="object-cover" unoptimized />
            
            {/* Show detection result badge if available */}
            {lastDetection?.detected && (
              <div className="absolute top-2 sm:top-4 left-1/2 -translate-x-1/2 z-20">
                <div className={cn(
                  "px-3 sm:px-4 py-1 sm:py-1.5 rounded-full font-bold text-[10px] sm:text-xs uppercase tracking-wide backdrop-blur-md shadow-lg flex items-center gap-1.5 sm:gap-2",
                  lastDetection.cardType === cardSide 
                    ? "bg-green-500/90 text-white" 
                    : "bg-yellow-500/90 text-black"
                )}>
                  <CheckCircle2 size={12} className="sm:w-3.5 sm:h-3.5" />
                  {lastDetection.cardType === 'front' ? 'Front' : 'Back'} ({Math.round(lastDetection.confidence * 100)}%)
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-center">
            <button 
              onClick={retake}
              className="flex items-center gap-2 px-5 py-2.5 bg-white/10 border border-lavender/30 text-white rounded-xl hover:bg-white/20 transition-all active:scale-95"
            >
              <RefreshCw size={16} />
              <span className="text-sm">Change Image</span>
            </button>
          </div>
        </div>
      )}

      {/* Crop Mode - for gallery uploads */}
      {mode === 'crop' && imageToCrop && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col">
          {/* Header */}
          <div className="p-4 flex items-center justify-between border-b border-white/10">
            <button
              onClick={cancelCrop}
              disabled={isCropping}
              aria-label="Cancel crop"
              title="Cancel"
              className="p-2 text-white/70 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
            <h3 className="text-white font-semibold">Crop & Adjust</h3>
            <div className="w-10" /> {/* Spacer for centering */}
          </div>

          {/* Cropper Area */}
          <div className="flex-1 relative">
            <Cropper
              image={imageToCrop}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={8 / 5}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              cropShape="rect"
              showGrid
              style={{
                containerStyle: {
                  backgroundColor: '#000',
                },
              }}
            />
          </div>

          {/* Controls */}
          <div className="p-4 space-y-4 bg-black/50 border-t border-white/10">
            {/* Rotation Buttons */}
            <div className="flex justify-center gap-6">
              <button
                onClick={rotateLeft}
                disabled={isCropping}
                className="flex flex-col items-center gap-1 p-2 sm:p-3 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50"
              >
                <RotateCcw size={20} className="sm:w-6 sm:h-6" />
                <span className="text-[10px] sm:text-xs">Rotate Left</span>
              </button>
              
              <button
                onClick={rotateRight}
                disabled={isCropping}
                className="flex flex-col items-center gap-1 p-2 sm:p-3 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50"
              >
                <RotateCw size={20} className="sm:w-6 sm:h-6" />
                <span className="text-[10px] sm:text-xs">Rotate Right</span>
              </button>
            </div>

            {/* Zoom Slider */}
            <div className="flex items-center gap-3 px-2">
              <button
                onClick={zoomOut}
                disabled={isCropping || zoom <= 1}
                aria-label="Zoom out"
                title="Zoom out"
                className="p-1.5 text-white/70 hover:text-white disabled:opacity-30 transition-colors"
              >
                <ZoomOut size={18} />
              </button>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                disabled={isCropping}
                aria-label="Zoom level"
                title="Zoom level"
                className="flex-1 h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none 
                  [&::-webkit-slider-thumb]:w-4 
                  [&::-webkit-slider-thumb]:h-4 
                  [&::-webkit-slider-thumb]:rounded-full 
                  [&::-webkit-slider-thumb]:bg-lavender
                  [&::-webkit-slider-thumb]:cursor-pointer
                  disabled:opacity-50"
              />
              <button
                onClick={zoomIn}
                disabled={isCropping || zoom >= 3}
                aria-label="Zoom in"
                title="Zoom in"
                className="p-1.5 text-white/70 hover:text-white disabled:opacity-30 transition-colors"
              >
                <ZoomIn size={18} />
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={cancelCrop}
                disabled={isCropping}
                className="flex-1 py-2.5 sm:py-3 px-4 bg-white/10 text-white rounded-xl font-medium text-sm sm:text-base hover:bg-white/20 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmCrop}
                disabled={isCropping}
                className={cn(
                  "flex-1 py-2.5 sm:py-3 px-4 rounded-xl font-medium text-sm sm:text-base transition-colors flex items-center justify-center gap-2",
                  isCropping
                    ? "bg-lavender/50 text-deep-violet/70 cursor-not-allowed"
                    : "bg-lavender text-deep-violet hover:bg-lavender/90"
                )}
              >
                {isCropping ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    Confirm
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
