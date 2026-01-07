'use client';
import { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import Cropper, { Area, Point } from 'react-easy-crop';
import { 
  ImagePlus, 
  Loader2, 
  AlertCircle, 
  RotateCw, 
  RotateCcw, 
  Check, 
  X, 
  Crop,
  ZoomIn,
  ZoomOut,
  Upload
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useImageWorker } from '@/hooks/useImageWorker';

interface Props {
  onUpload: (base64: string, detection?: AadhaarDetectionResult) => void;
  label: string;
  expectedCardSide?: 'front' | 'back';
}

// Temporary type for AadhaarDetectionResult (not needed for detection, but kept for interface compatibility)
interface AadhaarDetectionResult {
  detected: boolean;
  cardType: 'front' | 'back' | 'print' | null;
  confidence: number;
}

// Helper function to create cropped image
const createCroppedImage = async (
  imageSrc: string,
  pixelCrop: Area,
  rotation: number = 0
): Promise<string> => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');

  // Calculate bounding box of the rotated image
  const rotRad = (rotation * Math.PI) / 180;
  const { width: bBoxWidth, height: bBoxHeight } = getRotatedBoundingBox(
    image.width,
    image.height,
    rotation
  );

  // Set canvas size to match the bounding box
  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  // Translate to center, rotate, then translate back
  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.translate(-image.width / 2, -image.height / 2);

  // Draw the image
  ctx.drawImage(image, 0, 0);

  // Extract the cropped area
  const croppedCanvas = document.createElement('canvas');
  const croppedCtx = croppedCanvas.getContext('2d');
  if (!croppedCtx) throw new Error('Canvas context not available');

  // Set cropped canvas size (max 1280px)
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

  // Fill white background
  croppedCtx.fillStyle = '#FFFFFF';
  croppedCtx.fillRect(0, 0, finalWidth, finalHeight);

  // Draw the cropped portion
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

  return croppedCanvas.toDataURL('image/jpeg', 0.85);
};

// Helper to get rotated bounding box dimensions
const getRotatedBoundingBox = (width: number, height: number, rotation: number) => {
  const rotRad = Math.abs((rotation * Math.PI) / 180);
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
};

// Helper to resize image for better cropper performance
const resizeImageForCropper = (imageSrc: string, maxSize: number = 1200): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // If image is already small enough, return as-is
      if (img.width <= maxSize && img.height <= maxSize) {
        resolve(imageSrc);
        return;
      }
      
      // Calculate new dimensions
      let newWidth = img.width;
      let newHeight = img.height;
      
      if (newWidth > newHeight) {
        newHeight = Math.round((newHeight / newWidth) * maxSize);
        newWidth = maxSize;
      } else {
        newWidth = Math.round((newWidth / newHeight) * maxSize);
        newHeight = maxSize;
      }
      
      // Create canvas and resize
      const canvas = document.createElement('canvas');
      canvas.width = newWidth;
      canvas.height = newHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, newWidth, newHeight);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageSrc;
  });
};

export default function FileUpload({ onUpload, label, expectedCardSide }: Props) {
  // States
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Web Worker for image processing (runs in separate thread)
  const { cropImage, resizeImage, isWorkerAvailable } = useImageWorker();

  // Dropzone configuration
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setError(null);
    setIsProcessing(true);

    try {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        throw new Error('Please select an image file');
      }
      
      // Validate file size (max 20MB)
      if (file.size > 20 * 1024 * 1024) {
        throw new Error('Image too large. Max 20MB allowed');
      }

      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const result = e.target?.result as string;
        try {
          // Resize image for smoother cropping experience
          const resizedImage = await resizeImageForCropper(result, 1200);
          // Use requestAnimationFrame for smoother state update
          requestAnimationFrame(() => {
            setSelectedImage(resizedImage);
            setRotation(0);
            setZoom(1);
            setCrop({ x: 0, y: 0 });
            setIsProcessing(false);
          });
        } catch (resizeErr) {
          console.warn('[FileUpload] Resize failed, using original:', resizeErr);
          requestAnimationFrame(() => {
            setSelectedImage(result);
            setIsProcessing(false);
          });
        }
      };
      reader.onerror = () => {
        setError('Failed to read file');
        setIsProcessing(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('[FileUpload] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to process image');
      setIsProcessing(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.heic', '.heif']
    },
    maxFiles: 1,
    disabled: isProcessing || isDetecting,
    // Prevent opening file dialog on click - we'll control this manually
    noClick: false,
    noKeyboard: false,
  });
  
  // Custom input props that explicitly prevent camera capture on mobile
  const customInputProps = {
    ...getInputProps(),
    // Explicitly remove capture attribute to force gallery on mobile
    capture: undefined,
  };

  // Handle crop complete
  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  // Rotate handlers
  const rotateLeft = () => setRotation((prev) => (prev - 90) % 360);
  const rotateRight = () => setRotation((prev) => (prev + 90) % 360);

  // Zoom handlers
  const zoomIn = () => setZoom((prev) => Math.min(prev + 0.1, 3));
  const zoomOut = () => setZoom((prev) => Math.max(prev - 0.1, 1));

  // Cancel editing
  const cancelEdit = () => {
    setSelectedImage(null);
    setRotation(0);
    setZoom(1);
    setCrop({ x: 0, y: 0 });
    setCroppedAreaPixels(null);
    setError(null);
  };

  // Confirm and process image (uses Web Worker for better performance)
  const confirmImage = async () => {
    if (!selectedImage || !croppedAreaPixels) return;

    setIsDetecting(true);
    setError(null);

    try {
      let croppedImage: string;

      // Use Web Worker if available (runs in separate thread, won't freeze UI)
      if (isWorkerAvailable()) {
        console.log('[FileUpload] Using Web Worker for image processing');
        croppedImage = await cropImage(selectedImage, croppedAreaPixels, rotation);
      } else {
        // Fallback to main thread processing
        console.log('[FileUpload] Web Worker unavailable, using main thread');
        croppedImage = await createCroppedImage(
          selectedImage,
          croppedAreaPixels,
          rotation
        );
      }

      // NO detection for gallery uploads - backend will handle verification
      // This improves performance and prevents UI lag
      
      // Pass to parent WITHOUT detection (undefined = will be verified in backend)
      onUpload(croppedImage);
      
      // Reset state
      setSelectedImage(null);
      setRotation(0);
      setZoom(1);
      setCroppedAreaPixels(null);
    } catch (err) {
      console.error('[FileUpload] Process error:', err);
      setError(err instanceof Error ? err.message : 'Failed to process image');
    } finally {
      setIsDetecting(false);
    }
  };

  // Render crop editor
  if (selectedImage) {
    return (
      <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 bg-deep-violet/80 backdrop-blur-sm">
          <button
            onClick={cancelEdit}
            className="p-2 text-white/70 hover:text-white transition-colors"
            disabled={isDetecting}
          >
            <X size={24} />
          </button>
          <h3 className="text-white font-semibold text-sm sm:text-base">Edit Image</h3>
          <button
            onClick={confirmImage}
            disabled={isDetecting}
            className={cn(
              "p-2 rounded-full transition-colors",
              isDetecting 
                ? "text-white/50 cursor-not-allowed" 
                : "text-green-400 hover:text-green-300 hover:bg-green-500/20"
            )}
          >
            {isDetecting ? <Loader2 size={24} className="animate-spin" /> : <Check size={24} />}
          </button>
        </div>

        {/* Cropper Area */}
        <div className="flex-1 relative">
          <Cropper
            image={selectedImage}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={8 / 5}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            cropShape="rect"
            showGrid={true}
            style={{
              containerStyle: { backgroundColor: '#1a1a2e' },
              cropAreaStyle: { border: '2px solid #a87df2' }
            }}
          />
          
          {/* Detection Loader Overlay */}
          {isDetecting && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10">
              <div className="relative">
                <div className="w-16 h-16 sm:w-20 sm:h-20 border-4 border-lavender/30 border-t-lavender rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Crop className="w-6 h-6 sm:w-8 sm:h-8 text-lavender" />
                </div>
              </div>
              <p className="mt-4 text-white text-sm sm:text-base font-medium">Detecting Card...</p>
              <p className="mt-1 text-white/60 text-xs sm:text-sm">Please wait</p>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="px-4 py-2 bg-red-500/20 border-t border-red-500/30">
            <p className="text-red-400 text-xs sm:text-sm text-center flex items-center justify-center gap-2">
              <AlertCircle size={14} />
              {error}
            </p>
          </div>
        )}

        {/* Controls */}
        <div className="p-3 sm:p-4 bg-deep-violet/80 backdrop-blur-sm space-y-3">
          {/* Rotation Controls */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={rotateLeft}
              disabled={isDetecting}
              className="flex flex-col items-center gap-1 p-2 sm:p-3 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50"
            >
              <RotateCcw size={20} className="sm:w-6 sm:h-6" />
              <span className="text-[10px] sm:text-xs">Rotate Left</span>
            </button>
            
            <button
              onClick={rotateRight}
              disabled={isDetecting}
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
              disabled={isDetecting || zoom <= 1}
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
              disabled={isDetecting}
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
              disabled={isDetecting || zoom >= 3}
              className="p-1.5 text-white/70 hover:text-white disabled:opacity-30 transition-colors"
            >
              <ZoomIn size={18} />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={cancelEdit}
              disabled={isDetecting}
              className="flex-1 py-2.5 sm:py-3 px-4 bg-white/10 text-white rounded-xl font-medium text-sm sm:text-base hover:bg-white/20 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={confirmImage}
              disabled={isDetecting}
              className={cn(
                "flex-1 py-2.5 sm:py-3 px-4 rounded-xl font-medium text-sm sm:text-base transition-colors flex items-center justify-center gap-2",
                isDetecting
                  ? "bg-lavender/50 text-deep-violet/70 cursor-not-allowed"
                  : "bg-lavender text-deep-violet hover:bg-lavender/90"
              )}
            >
              {isDetecting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Detecting...
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
    );
  }

  // Render dropzone
  return (
    <div className="mt-4 sm:mt-6">
      {error && (
        <div className="mb-2 text-xs text-red-400 flex items-center justify-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </div>
      )}
      
      <div
        {...getRootProps()}
        className={cn(
          "relative cursor-pointer transition-all duration-200",
          "flex items-center justify-center gap-2 mx-auto", // Added mx-auto to center the box
          "px-2 py-1",
          "border border-dashed rounded-md",
          "bg-white/5 hover:bg-white/10",
          isDragActive 
            ? "border-lavender bg-lavender/10" 
            : "border-white/30 hover:border-lavender/50",
          (isProcessing || isDetecting) && "opacity-50 pointer-events-none",
          "w-48" // Set fixed width to make the box smaller
        )}
      >
        {/* Custom input that explicitly prevents camera capture on mobile */}
        <input {...customInputProps} />
        
        {isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 text-lavender animate-spin" />
            <p className="text-white/70 text-xs">Loading...</p>
          </>
        ) : isDragActive ? (
          <>
            <Upload className="w-4 h-4 text-lavender" />
            <p className="text-lavender text-xs font-medium">Drop here</p>
          </>
        ) : (
          <>
            <ImagePlus className="w-4 h-4 text-lavender" />
            <p className="text-white/80 text-xs font-medium">{label}</p>
          </>
        )}
      </div>
    </div>
  );
}