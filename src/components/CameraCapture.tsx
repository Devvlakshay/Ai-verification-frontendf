'use client';
import { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { FaceLandmarker, FilesetResolver, FaceLandmarkerResult } from "@mediapipe/tasks-vision";

interface Props {
  onCapture: (base64: string) => void;
  label: string;
  initialImage: string | null;
  isSelfie?: boolean; // If true, enables Face Alignment logic
  retakeActions?: React.ReactNode;
}

// Visual states for the overlay (selfie mode only)
type AlignmentStatus = 'LOADING' | 'SEARCHING' | 'TOO_MANY' | 'TOO_FAR' | 'NOT_CENTERED' | 'BAD_ANGLE' | 'EYES_CLOSED' | 'FACE_COVERED' | 'ALIGNED';

export default function CameraCapture({ 
  onCapture, 
  label, 
  initialImage, 
  isSelfie = false, 
  retakeActions
}: Props) {
  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);

  // --- State ---
  const [isStreaming, setIsStreaming] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(isSelfie ? 'user' : 'environment');
  const [preview, setPreview] = useState<string | null>(initialImage);
  const [error, setError] = useState<string | null>(null);
  
  // Face Alignment State (for selfie only)
  const [alignmentStatus, setAlignmentStatus] = useState<AlignmentStatus>('LOADING');
  const [countdown, setCountdown] = useState<number>(3);
 
  // --- 1. Load MediaPipe Face Landmarker Model (Only if isSelfie is true) ---
  useEffect(() => {
    if (!isSelfie) {
      setAlignmentStatus('ALIGNED'); // Bypass for documents
      return;
    }

    let ignore = false;
    let landmarker: FaceLandmarker;

    // Detect iOS/Safari - they have issues with GPU delegate
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    async function loadFaceLandmarker() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        
        // Use CPU delegate for iOS/Safari as GPU delegate is unreliable
        const delegate = (isIOS || isSafari) ? "CPU" : "GPU";
        console.log(`[FaceLandmarker] Using ${delegate} delegate (iOS: ${isIOS}, Safari: ${isSafari})`);
        
        try {
          landmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
              delegate: delegate,
            },
            outputFaceBlendshapes: true, // Required for eye detection
            runningMode: "VIDEO",
            numFaces: 1
          });
        } catch (gpuError) {
          // Fallback to CPU if GPU fails (common on iOS)
          console.warn("[FaceLandmarker] GPU delegate failed, falling back to CPU:", gpuError);
          landmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
              delegate: "CPU",
            },
            outputFaceBlendshapes: true,
            runningMode: "VIDEO",
            numFaces: 1
          });
        }
        
        if (!ignore) {
            landmarkerRef.current = landmarker;
            setAlignmentStatus('SEARCHING');
        } else {
            landmarker.close();
        }
      } catch (err) {
        console.error("MediaPipe Load Error:", err);
        // Fallback: allow capture if model fails
        if (!ignore) {
            setAlignmentStatus('ALIGNED'); 
        }
      }
    };

    loadFaceLandmarker();

    return () => {
      ignore = true;
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, [isSelfie]);

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
  };

  // --- 3. The Face Detection Loop ---
  const predictWebcam = () => {
    // Loop guard
    if (!landmarkerRef.current || !videoRef.current || !streamRef.current) return;
    
    const video = videoRef.current;
    
    // Only detect if video has new data
    if (video.currentTime !== lastVideoTimeRef.current && video.readyState >= 2) {
      lastVideoTimeRef.current = video.currentTime;
      const startTimeMs = performance.now();
      
      try {
        const result = landmarkerRef.current.detectForVideo(video, startTimeMs);
        validateFace(result, video.videoWidth, video.videoHeight);
      } catch (e) {
        console.error("Detection Error", e);
      }
    }

    // Keep loop running
    animationFrameRef.current = requestAnimationFrame(predictWebcam);
  };

  // --- 4. Face Alignment Logic with Eye Detection ---
  const validateFace = (result: FaceLandmarkerResult, vWidth: number, vHeight: number) => {
    // Rule 0: Exactly one face
    if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
      setAlignmentStatus('SEARCHING');
      return;
    }
    if (result.faceLandmarks.length > 1) {
      setAlignmentStatus('TOO_MANY');
      return;
    }

    const landmarks = result.faceLandmarks[0];
    const blendshapes = result.faceBlendshapes?.[0]?.categories;
    
    // Calculate bounding box from landmarks
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (const lm of landmarks) {
      minX = Math.min(minX, lm.x);
      maxX = Math.max(maxX, lm.x);
      minY = Math.min(minY, lm.y);
      maxY = Math.max(maxY, lm.y);
    }
    
    const boxWidth = (maxX - minX) * vWidth;
    const boxHeight = (maxY - minY) * vHeight;

    // Rule 1: Size (Area > 6% of frame)
    const faceArea = boxWidth * boxHeight;
    const frameArea = vWidth * vHeight;
    if ((faceArea / frameArea) < 0.06) {
      setAlignmentStatus('TOO_FAR');
      return;
    }

    // Rule 2: Centering
    const faceCenterX = (minX + maxX) / 2;
    const faceCenterY = (minY + maxY) / 2;

    // Constraints: X (35% - 65%), Y (25% - 65%)
    if (faceCenterX < 0.35 || faceCenterX > 0.65 || faceCenterY < 0.25 || faceCenterY > 0.65) {
      setAlignmentStatus('NOT_CENTERED');
      return;
    }

    // Rule 3: Front Facing (using nose and ear landmarks)
    // Landmark indices: 1=nose tip, 234=right ear, 454=left ear
    const nose = landmarks[1];
    const rightEar = landmarks[234];
    const leftEar = landmarks[454];

    const distToRight = Math.abs(rightEar.x - nose.x);
    const distToLeft = Math.abs(leftEar.x - nose.x);
    
    const ratio = distToRight / (distToLeft + 0.01);
    if (ratio < 0.4 || ratio > 2.5) {
      setAlignmentStatus('BAD_ANGLE');
      return;
    }

    // Rule 4: EYE DETECTION - Check if eyes are open using blendshapes
    if (blendshapes) {
      // Find eyeBlinkLeft and eyeBlinkRight blendshapes
      const leftBlink = blendshapes.find(b => b.categoryName === 'eyeBlinkLeft');
      const rightBlink = blendshapes.find(b => b.categoryName === 'eyeBlinkRight');
      
      // Score > 0.5 means eye is closed
      const leftEyeClosed = leftBlink && leftBlink.score > 0.5;
      const rightEyeClosed = rightBlink && rightBlink.score > 0.5;
      
      if (leftEyeClosed || rightEyeClosed) {
        setAlignmentStatus('EYES_CLOSED');
        return;
      }
    }

    // Rule 5: FACE VISIBILITY - Ensure full face is visible using landmark confidence
    // Check key facial landmarks are present and have good confidence
    // Key landmarks: nose tip (1), chin (152), forehead (10), left cheek (234), right cheek (454)
    const keyLandmarkIndices = [1, 152, 10, 234, 454, 61, 291]; // nose, chin, forehead, ears, mouth corners
    
    // Calculate face visibility by checking if key landmarks are within frame
    let visibleLandmarks = 0;
    for (const idx of keyLandmarkIndices) {
      const lm = landmarks[idx];
      if (lm && lm.x > 0.05 && lm.x < 0.95 && lm.y > 0.05 && lm.y < 0.95) {
        visibleLandmarks++;
      }
    }
    
    // Require at least 6 out of 7 key landmarks to be visible
    if (visibleLandmarks < 6) {
      setAlignmentStatus('FACE_COVERED');
      return;
    }
    
    // Rule 6: FACE COMPLETENESS - Check nose and mouth area visibility using blendshapes
    // MediaPipe provides jawOpen, mouthClose, noseSneerLeft, noseSneerRight blendshapes
    // If these have very low scores AND face detection confidence is low, face may be covered
    if (blendshapes) {
      // Check for mouth-related blendshapes - their presence indicates mouth is visible
      const jawOpen = blendshapes.find(b => b.categoryName === 'jawOpen');
      const mouthClose = blendshapes.find(b => b.categoryName === 'mouthClose');
      const mouthLeft = blendshapes.find(b => b.categoryName === 'mouthLeft');
      const mouthRight = blendshapes.find(b => b.categoryName === 'mouthRight');
      const mouthPucker = blendshapes.find(b => b.categoryName === 'mouthPucker');
      
      // If mouth blendshapes are not detected or have undefined scores, face may be covered
      const mouthBlendshapesExist = jawOpen !== undefined && mouthClose !== undefined;
      
      if (!mouthBlendshapesExist) {
        setAlignmentStatus('FACE_COVERED');
        return;
      }
      
      // Additional check: verify mouth landmarks are within expected face bounds
      // Mouth landmarks: 61 (left corner), 291 (right corner), 13 (upper lip), 14 (lower lip)
      const upperLip = landmarks[13];
      const lowerLip = landmarks[14];
      const mouthLeftLm = landmarks[61];
      const mouthRightLm = landmarks[291];
      
      // Check that mouth landmarks are positioned correctly relative to nose
      const noseTip = landmarks[1];
      if (upperLip && noseTip) {
        // Mouth should be below nose
        if (upperLip.y < noseTip.y) {
          setAlignmentStatus('FACE_COVERED');
          return;
        }
      }
      
      // Check mouth width is reasonable (not too narrow, which might indicate occlusion)
      if (mouthLeftLm && mouthRightLm) {
        const mouthWidth = Math.abs(mouthRightLm.x - mouthLeftLm.x);
        const faceWidth = maxX - minX;
        // Mouth width should be at least 15% of face width
        if (mouthWidth / faceWidth < 0.15) {
          setAlignmentStatus('FACE_COVERED');
          return;
        }
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
    
    setTimeout(() => onCapture(base64), 0);
  }, [onCapture, isStreaming, facingMode]);

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

  // --- UI Helpers ---
  const isAligned = alignmentStatus === 'ALIGNED';

  const retake = () => {
    setPreview(null);
    setCountdown(3);
    onCapture('');
    // startCamera is called by useEffect
  };

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
  
  // Card border color
  const getCardBorderColor = () => {
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
        case 'EYES_CLOSED': return "Open your eyes";
        case 'FACE_COVERED': return "Show full face";
        case 'ALIGNED': return `Holding... ${countdown}`;
        default: return "";
      }
    }
    
    // For card capture - simple instruction
    return "Position card & capture";
  };
  
  // Get status badge styling based on mode
  const getStatusBadgeStyles = () => {
    if (isSelfie) {
      return isAligned 
        ? "bg-lavender/90 text-deep-violet" 
        : "bg-red-500/90 text-white";
    }
    
    // For card capture
    return "bg-white/90 text-black";
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
                 {isSelfie ? (
                   isAligned ? <CheckCircle2 size={12} className="sm:w-3.5 sm:h-3.5" /> : <AlertCircle size={12} className="sm:w-3.5 sm:h-3.5" />
                 ) : (
                   <Camera size={12} className="sm:w-3.5 sm:h-3.5" />
                 )}
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
            {/* Manual Capture Button for non-selfie (front/back) */}
            {!isSelfie && (
              <button 
                onClick={() => captureImage()}
                className="px-6 sm:px-8 py-2 bg-lavender text-deep-violet rounded-full font-bold shadow-lg transition-all transform active:scale-95 hover:bg-opacity-80 hover:shadow-lavender/30 text-sm sm:text-base"
              >
                Capture
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}