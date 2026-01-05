'use client';
import { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, RefreshCw, AlertCircle, CheckCircle2, Upload, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { FaceDetector, FilesetResolver, Detection } from "@mediapipe/tasks-vision";
import { useAadhaarDetection, AadhaarDetectionResult } from '@/hooks/useAadhaarDetection';

interface Props {
  onCapture: (base64: string, detection?: AadhaarDetectionResult) => void;
  label: string;
  initialImage: string | null;
  isSelfie?: boolean; // If true, enables Face Alignment logic
  retakeActions?: React.ReactNode;
  // Expected card side for validation
  expectedCardSide?: 'front' | 'back';
}

// Visual states for the overlay
type AlignmentStatus = 'LOADING' | 'SEARCHING' | 'TOO_MANY' | 'TOO_FAR' | 'NOT_CENTERED' | 'BAD_ANGLE' | 'ALIGNED';

// Card detection states
type CardDetectionStatus = 'LOADING' | 'NO_CARD' | 'DETECTED' | 'WRONG_SIDE';

export default function CameraCapture({ 
  onCapture, 
  label, 
  initialImage, 
  isSelfie = false, 
  retakeActions,
  expectedCardSide
}: Props) {
  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<FaceDetector | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);
  const aadhaarDetectionRef = useRef<NodeJS.Timeout | null>(null);

  // --- State ---
  const [isStreaming, setIsStreaming] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [preview, setPreview] = useState<string | null>(initialImage);
  const [error, setError] = useState<string | null>(null);
  
  // Face Alignment State
  const [alignmentStatus, setAlignmentStatus] = useState<AlignmentStatus>('LOADING');
  const [countdown, setCountdown] = useState<number>(3);
  
  // Card Detection State (for non-selfie captures)
  const [cardDetectionStatus, setCardDetectionStatus] = useState<CardDetectionStatus>('LOADING');
  
  // Aadhaar Detection State
  const [lastDetection, setLastDetection] = useState<AadhaarDetectionResult | null>(null);
  
  // Hook for on-device Aadhaar detection
  const { isModelLoading, loadProgress, isModelReady, detect: detectAadhaar, loadModel } = useAadhaarDetection();
 
  // --- 1. Load MediaPipe Model (Only if isSelfie is true) ---
  useEffect(() => {
    if (!isSelfie) {
      setAlignmentStatus('ALIGNED'); // Bypass for documents
      return;
    }

    let ignore = false;
    let detector: FaceDetector;

    async function loadModel() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`,
            delegate: "GPU",
            
          },
          runningMode: "VIDEO"
        });
        
        if (!ignore) {
            detectorRef.current = detector;
            setAlignmentStatus('SEARCHING');
        } else {
            detector.close();
        }
      } catch (err) {
        console.error("MediaPipe Load Error:", err);
        // Fallback: allow capture if model fails
        if (!ignore) {
            setAlignmentStatus('ALIGNED'); 
        }
      }
    };

    loadModel();

    return () => {
      ignore = true;
      if (detectorRef.current) {
        detectorRef.current.close();
        detectorRef.current = null;
      }
    };
  }, [isSelfie]);

  // --- 1.5 Load Aadhaar Detection Model (Only for non-selfie) ---
  useEffect(() => {
    if (isSelfie) return;
    
    // Load the on-device Aadhaar detection model
    loadModel();
  }, [isSelfie, loadModel]);

  // --- 1.6 Aadhaar Detection Loop (Only for non-selfie) ---
  useEffect(() => {
    if (isSelfie || !isModelReady || !isStreaming || preview) return;

    let isDetecting = false;
    let lastDetectionTime = 0;
    const DETECTION_INTERVAL = 400; // ms between detections (reduced for faster response)
    const THROTTLE_ON_DETECT = 800; // Slow down after detection to save CPU
    
    // Start detection loop with requestAnimationFrame for smoother performance
    const runDetection = async () => {
      if (!videoRef.current || !isStreaming || isDetecting) return;
      
      // Skip detection if page is not visible (tab in background)
      if (document.hidden) return;
      
      const now = performance.now();
      const interval = lastDetection?.detected ? THROTTLE_ON_DETECT : DETECTION_INTERVAL;
      
      if (now - lastDetectionTime < interval) return;
      
      isDetecting = true;
      lastDetectionTime = now;
      
      try {
        const result = await detectAadhaar(videoRef.current);
        setLastDetection(result);
        
        if (result.detected) {
          // Check if it's the expected side
          if (expectedCardSide && result.cardType !== expectedCardSide) {
            setCardDetectionStatus('WRONG_SIDE');
          } else {
            setCardDetectionStatus('DETECTED');
          }
        } else {
          setCardDetectionStatus('NO_CARD');
        }
      } catch (err) {
        console.error('[AadhaarDetection] Error:', err);
      } finally {
        isDetecting = false;
      }
    };

    // Use setInterval with shorter interval, but actual detection is throttled
    aadhaarDetectionRef.current = setInterval(runDetection, 200);

    return () => {
      if (aadhaarDetectionRef.current) {
        clearInterval(aadhaarDetectionRef.current);
        aadhaarDetectionRef.current = null;
      }
    };
  }, [isSelfie, isModelReady, isStreaming, preview, detectAadhaar, expectedCardSide]);

  // --- 2. Camera Lifecycle & Cleanup ---
  useEffect(() => {
    if (initialImage) {
      setPreview(initialImage);
      stopCamera();
    }
    
    // Cleanup on unmount
    return () => {
      stopCamera();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      // The FaceDetector is now cleaned up in its own effect
    };
  }, [initialImage]);

  useEffect(() => {
    if (preview) return;

    let isCancelled = false;

    const initCamera = async () => {
      setError(null);
      
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setError("Camera API not supported. Please use HTTPS.");
        return;
      }

      const video = videoRef.current;
      if (!video) return;

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
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
        }

        if (isCancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        
        video.onloadedmetadata = () => {
          if (isCancelled) return;
          video.play().catch(e => console.error("Play error:", e));
          setIsStreaming(true);
          if (isSelfie) {
            predictWebcam();
          }
          // Aadhaar detection loop is started via useEffect when isStreaming becomes true
        };
        
        video.srcObject = stream;
      } catch (err: any) {
        if (!isCancelled) {
          console.error("Camera Error:", err);
          setError("Camera access denied. Please allow permissions.");
          setIsStreaming(false);
        }
      }
    };

    initCamera();

    return () => {
      isCancelled = true;
      stopCamera();
    };
  }, [preview, facingMode, isSelfie]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Clear Aadhaar detection interval
    
    // Clear Aadhaar detection interval
    if (aadhaarDetectionRef.current) {
      clearInterval(aadhaarDetectionRef.current);
      aadhaarDetectionRef.current = null;
    }
  };

  // --- 3. The Face Detection Loop ---
  const predictWebcam = () => {
    // Loop guard
    if (!detectorRef.current || !videoRef.current || !streamRef.current) return;
    
    const video = videoRef.current;
    
    // Only detect if video has new data
    if (video.currentTime !== lastVideoTimeRef.current && video.readyState >= 2) {
      lastVideoTimeRef.current = video.currentTime;
      const startTimeMs = performance.now();
      
      try {
        const detections = detectorRef.current.detectForVideo(video, startTimeMs).detections;
        validateFace(detections, video.videoWidth, video.videoHeight);
      } catch (e) {
        console.error("Detection Error", e);
      }
    }

    // Keep loop running
    animationFrameRef.current = requestAnimationFrame(predictWebcam);
  };

  // --- 4. Face Alignment Logic (The Core Request) ---
  const validateFace = (detections: Detection[], vWidth: number, vHeight: number) => {
    // Rule 0: Exactly one face
    if (detections.length === 0) {
      setAlignmentStatus('SEARCHING');
      return;
    }
    if (detections.length > 1) {
      setAlignmentStatus('TOO_MANY');
      return;
    }

    const face = detections[0];
    const box = face.boundingBox;
    
    // Only available if boundingBox is valid
    if (!box) return;

    // Rule 1: Size (Area > 6% of frame)
    // Avoids faces that are too far away
    const faceArea = (box.width * box.height);
    const frameArea = (vWidth * vHeight);
    if ((faceArea / frameArea) < 0.06) {
      setAlignmentStatus('TOO_FAR');
      return;
    }

    // Rule 2: Centering
    // Center of the face bounding box
    const faceCenterX = box.originX + (box.width / 2);
    const faceCenterY = box.originY + (box.height / 2);

    // Normalize coordinates (0.0 to 1.0)
    const normX = faceCenterX / vWidth;
    const normY = faceCenterY / vHeight;

    // Constraints: X (35% - 65%), Y (25% - 65%)
    if (normX < 0.35 || normX > 0.65 || normY < 0.25 || normY > 0.65) {
      setAlignmentStatus('NOT_CENTERED');
      return;
    }

    // Rule 3: Front Facing (Yaw check using landmarks)
    // Keypoints: 2=Nose, 4=RightEar, 5=LeftEar
    if (face.keypoints && face.keypoints.length >= 6) {
        const nose = face.keypoints[2];
        const rightEar = face.keypoints[4];
        const leftEar = face.keypoints[5];

        const distToRight = Math.abs(rightEar.x - nose.x);
        const distToLeft = Math.abs(leftEar.x - nose.x);
        
        // Ratio close to 1.0 means looking straight. 
        // < 0.5 or > 2.0 means looking side.
        const ratio = distToRight / (distToLeft + 0.01);
        if (ratio < 0.4 || ratio > 2.5) {
            setAlignmentStatus('BAD_ANGLE');
            return;
        }
    }

    // If all pass:
    setAlignmentStatus('ALIGNED');
  };

  const captureImage = useCallback(() => {
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
    
    // Mirror if user facing
    if (facingMode === 'user') {
      ctx?.translate(canvas.width, 0);
      ctx?.scale(-1, 1);
    }
    
    ctx?.drawImage(video, 0, 0, width, height);
    
    // Use lower quality (0.8 instead of 0.9) to reduce memory
    const base64 = canvas.toDataURL('image/jpeg', 0.8);
    
    stopCamera();
    setPreview(base64);
    
    // Pass the ONNX detection result along with the image
    setTimeout(() => onCapture(base64, lastDetection || undefined), 0);
  }, [onCapture, isStreaming, facingMode, lastDetection]);

  // --- Auto Capture Countdown ---
  useEffect(() => {
    let timer: NodeJS.Timeout;
    // Only start a timer if we are aligned and streaming
    if (alignmentStatus === 'ALIGNED' && isSelfie && isStreaming) {
      timer = setInterval(() => {
        // Just decrement the counter.
        setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else {
      // If not aligned, reset the counter.
      setCountdown(3);
    }
    // Cleanup clears the timer.
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [alignmentStatus, isSelfie, isStreaming]);

  // A separate effect to watch the countdown value.
  useEffect(() => {
    // When countdown hits zero, and we are still streaming, capture.
    if (countdown <= 0 && isSelfie && isStreaming) {
      captureImage();
    }
  }, [countdown, isSelfie, isStreaming, captureImage]);

  const retake = () => {
    setPreview(null);
    setLastDetection(null);
    setCardDetectionStatus('LOADING');
    onCapture('');
    // startCamera is called by useEffect
  };

  // --- UI Helpers ---
  const isAligned = alignmentStatus === 'ALIGNED';
  const isCardDetected = cardDetectionStatus === 'DETECTED' || (lastDetection?.detected && (!expectedCardSide || lastDetection.cardType === expectedCardSide));
  
  // Dynamic styles for the oval
  const getSelfieOverlayStyles = () => {
    if (!isSelfie) return 'hidden';
    
    const base = "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] rounded-[50%] border-[4px] transition-all duration-300 z-10 box-border";
    
    if (isAligned) {
      return cn(base, "border-lavender shadow-[0_0_40px_rgba(168,125,242,0.6)]");
    }
    return cn(base, "border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]");
  };

  const getCardOverlayStyles = () => {
    if (isSelfie) return 'hidden';
    
    const base = "absolute inset-0 w-full h-full flex items-center justify-center z-10 p-4";
    return base;
  };
  
  // Get card border color based on Aadhaar detection
  const getCardBorderColor = () => {
    if (cardDetectionStatus === 'WRONG_SIDE') {
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

  const getStatusText = () => {
    if (isSelfie) {
      switch (alignmentStatus) {
        case 'LOADING': return "Loading AI...";
        case 'SEARCHING': return "Find face...";
        case 'TOO_MANY': return "One person only";
        case 'TOO_FAR': return "Come closer";
        case 'NOT_CENTERED': return "Center your face";
        case 'BAD_ANGLE': return "Look straight";
        case 'ALIGNED': return `Holding... ${countdown}`;
        default: return "";
      }
    }
    
    // Show loading status for on-device model
    if (isModelLoading) {
      return `Loading AI (${loadProgress}%)`;
    }
    
    // Show Aadhaar detection status
    if (lastDetection?.detected) {
      const side = lastDetection.cardType === 'front' ? 'Front' : 
                   lastDetection.cardType === 'back' ? 'Back' : 'Print';
      const conf = Math.round(lastDetection.confidence * 100);
      
      if (expectedCardSide && lastDetection.cardType !== expectedCardSide) {
        return `Wrong side (${side})`;
      }
      return `${side} detected (${conf}%)`;
    }
    
    // Fallback status
    switch (cardDetectionStatus) {
      case 'LOADING': return "Loading AI...";
      case 'NO_CARD': return "No Aadhaar card";
      case 'WRONG_SIDE': return "Wrong side";
      case 'DETECTED': return "Ready to capture ✓";
      default: return "Position card...";
    }
  };
  
  // Get status badge styling based on detection
  const getStatusBadgeStyles = () => {
    if (isSelfie) {
      return isAligned 
        ? "bg-lavender/90 text-deep-violet" 
        : "bg-red-500/90 text-white";
    }
    
    // For Aadhaar detection
    if (isModelLoading) {
      return "bg-blue-500/90 text-white";
    }
    if (cardDetectionStatus === 'WRONG_SIDE') {
      return "bg-red-500/90 text-white";
    }
    if (isCardDetected) {
      return "bg-green-500/90 text-white";
    }
    return "bg-yellow-500/90 text-black";
  };

  return (
    <div className="flex flex-col items-center w-full h-full mx-auto border-none rounded-none bg-transparent shadow-none relative px-2 sm:px-4">
      <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3 text-white">{label}</h3>
      
      {error && <div className="text-red-400 text-xs sm:text-sm mb-2">{error}</div>}

      <div className={cn(
        "relative w-full max-w-sm sm:max-w-md md:max-w-lg rounded-xl sm:rounded-2xl overflow-hidden mb-3 sm:mb-4 shadow-inner ring-1 ring-royal-purple isolate",
        isSelfie ? 'aspect-[3/4]' : 'aspect-[8/5]'
      )}>
        
        {/* Preview Image (Static) */}
        {preview ? (
          <Image src={preview} alt="Preview" fill className="object-cover" unoptimized />
        ) : (
          /* Live Video */
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className={cn(
              "w-full h-full object-cover transition-transform", 
              facingMode === 'user' && "scale-x-[-1]"
            )}
          />
        )}

        {/* --- OVERLAY LAYER --- */}
        {isStreaming && !preview && (
          <>
            {/* Selfie Oval */}
            <div className={getSelfieOverlayStyles()} />

            {/* Card Rectangle */}
            <div className={getCardOverlayStyles()}>
              <div className={cn(
                "w-full h-full border-4 border-dashed rounded-2xl transition-colors duration-300",
                getCardBorderColor()
              )} />
            </div>
            
            {/* Countdown Overlay - Responsive */}
            {isSelfie && isAligned && countdown > 0 && (
              <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
                <span className="text-6xl sm:text-8xl font-bold text-white drop-shadow-lg animate-pulse">{countdown}</span>
              </div>
            )}

            {/* Status Badge - Responsive */}
            <div className="absolute top-2 sm:top-4 left-1/2 -translate-x-1/2 z-20">
               <div className={cn(
                 "px-3 sm:px-4 py-1 sm:py-1.5 rounded-full font-bold text-[10px] sm:text-xs uppercase tracking-wide backdrop-blur-md shadow-lg transition-colors duration-300 flex items-center gap-1.5 sm:gap-2",
                 getStatusBadgeStyles()
               )}>
                 {isModelLoading ? (
                   <Loader2 size={12} className="sm:w-3.5 sm:h-3.5 animate-spin" />
                 ) : (isSelfie ? isAligned : isCardDetected) 
                   ? <CheckCircle2 size={12} className="sm:w-3.5 sm:h-3.5" /> 
                   : <AlertCircle size={12} className="sm:w-3.5 sm:h-3.5" />}
                 {getStatusText()}
               </div>
            </div>
          </>
        )}
        
        {/* Loading Spinner for Camera Init - Responsive */}
        {!isStreaming && !preview && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 bg-deep-violet/50 z-30">
                <Camera size={36} className="sm:w-12 sm:h-12 animate-pulse" />
                <p className="mt-2 text-xs sm:text-sm">Initializing...</p>
            </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        {preview ? (
          <div className="flex flex-col items-center gap-2">
            <button 
              onClick={retake}
              className="flex items-center gap-2 px-4 sm:px-6 py-1.5 sm:py-2 bg-white/10 border border-lavender/30 text-white rounded-full hover:bg-white/20 text-sm sm:text-base active:scale-95 transition-transform"
            >
              <RefreshCw size={16} className="sm:w-[18px] sm:h-[18px]" /> Retake
            </button>
            {retakeActions}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 sm:gap-4">
            <div className="flex gap-3 sm:gap-4">
               {/* Switch Camera Button - Only show for non-selfie */}
               {!isSelfie && (
                 <button 
                  onClick={() => {
                    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
                  }}
                  className="p-2.5 sm:p-3 bg-royal-purple/50 text-white rounded-full hover:bg-royal-purple active:scale-95 transition-transform"
                  title="Switch Camera"
                >
                  <RefreshCw size={18} className="sm:w-5 sm:h-5" />
                </button>
               )}

              {/* Capture Button - Only show for non-selfie */}
              {!isSelfie && (
                <button 
                  onClick={() => captureImage()}
                  className="px-6 sm:px-8 py-2 bg-lavender text-deep-violet rounded-full font-bold shadow-lg transition-all transform active:scale-95 hover:bg-opacity-80 hover:shadow-lavender/30 text-sm sm:text-base"
                >
                  Capture
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}