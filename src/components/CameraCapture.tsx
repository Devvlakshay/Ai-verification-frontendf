'use client';
import { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { FaceDetector, FilesetResolver, Detection } from "@mediapipe/tasks-vision";

interface Props {
  onCapture: (base64: string) => void;
  label: string;
  initialImage: string | null;
  isSelfie?: boolean; // If true, enables Face Alignment logic
}

// Visual states for the overlay
type AlignmentStatus = 'LOADING' | 'SEARCHING' | 'TOO_MANY' | 'TOO_FAR' | 'NOT_CENTERED' | 'BAD_ANGLE' | 'ALIGNED';

export default function CameraCapture({ onCapture, label, initialImage, isSelfie = false }: Props) {
  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<FaceDetector | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);

  // --- State ---
  const [isStreaming, setIsStreaming] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [preview, setPreview] = useState<string | null>(initialImage);
  const [error, setError] = useState<string | null>(null);
  
  // Face Alignment State
  const [alignmentStatus, setAlignmentStatus] = useState<AlignmentStatus>('LOADING');

  // --- 1. Load MediaPipe Model (Only if isSelfie is true) ---
  useEffect(() => {
    if (!isSelfie) {
      setAlignmentStatus('ALIGNED'); // Bypass for documents
      return;
    }

    const loadModel = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`,
            delegate: "GPU"
          },
          runningMode: "VIDEO"
        });
        detectorRef.current = detector;
        setAlignmentStatus('SEARCHING');
      } catch (err) {
        console.error("MediaPipe Load Error:", err);
        // Fallback: allow capture if model fails
        setAlignmentStatus('ALIGNED'); 
      }
    };

    loadModel();
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
      if (detectorRef.current) detectorRef.current.close();
    };
  }, [initialImage]);

  useEffect(() => {
    // Auto-start camera if no preview
    if (!preview) startCamera();
  }, [preview]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setIsStreaming(false);
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  const startCamera = async () => {
    setError(null);
    stopCamera();

    try {
      // Constraints: Prioritize HD resolution
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
        // Fallback for laptops/older devices
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadeddata = () => {
          videoRef.current?.play().catch(e => console.error("Play error:", e));
          setIsStreaming(true);
          
          // Start Face Detection Loop
          if (isSelfie) predictWebcam();
        };
      }
    } catch (err: any) {
      setError("Camera access denied. Please allow permissions.");
      setIsStreaming(false);
    }
  };

  // --- 3. The Face Detection Loop ---
  const predictWebcam = () => {
    // Loop guard
    if (!detectorRef.current || !videoRef.current) return;
    
    const video = videoRef.current;
    
    // Only detect if video has new data
    if (video.currentTime !== lastVideoTimeRef.current) {
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
    if (streamRef.current) { 
      animationFrameRef.current = requestAnimationFrame(predictWebcam);
    }
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

    // Rule 1: Size (Area > 12% of frame)
    // Avoids faces that are too far away
    const faceArea = (box.width * box.height);
    const frameArea = (vWidth * vHeight);
    if ((faceArea / frameArea) < 0.12) {
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
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    // Mirror if user facing
    if (facingMode === 'user') {
      ctx?.translate(canvas.width, 0);
      ctx?.scale(-1, 1);
    }
    
    ctx?.drawImage(video, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg', 0.9);
    
    stopCamera();
    setPreview(base64);
    onCapture(base64);
  }, [onCapture, isStreaming, facingMode]);

  const retake = () => {
    setPreview(null);
    onCapture('');
    startCamera();
  };

  // --- UI Helpers ---
  const isAligned = alignmentStatus === 'ALIGNED';
  
  // Dynamic styles for the oval
  const getOverlayStyles = () => {
    if (!isSelfie) return 'hidden';
    
    const base = "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[220px] h-[300px] rounded-[50%] border-[4px] transition-all duration-300 z-10 box-border";
    
    if (isAligned) {
      return cn(base, "border-green-500 shadow-[0_0_40px_rgba(34,197,94,0.6)]");
    }
    return cn(base, "border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]");
  };

  const getStatusText = () => {
    switch (alignmentStatus) {
      case 'LOADING': return "Loading AI...";
      case 'SEARCHING': return "Find face...";
      case 'TOO_MANY': return "One person only";
      case 'TOO_FAR': return "Come closer";
      case 'NOT_CENTERED': return "Center your face";
      case 'BAD_ANGLE': return "Look straight";
      case 'ALIGNED': return "Perfect";
      default: return "";
    }
  };

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto p-4 border rounded-xl bg-gray-50 shadow-sm relative">
      <h3 className="text-lg font-semibold mb-3 text-gray-700">{label}</h3>
      
      {error && <div className="text-red-500 text-sm mb-2">{error}</div>}

      <div className="relative w-full aspect-[3/4] sm:aspect-[4/3] bg-black rounded-2xl overflow-hidden mb-4 shadow-inner ring-1 ring-gray-200 isolate">
        
        {/* Preview Image (Static) */}
        {preview ? (
          <Image src={preview} alt="Preview" fill className="object-cover z-0" unoptimized />
        ) : (
          /* Live Video */
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className={cn(
              "w-full h-full object-cover z-0 transition-transform", 
              facingMode === 'user' && "scale-x-[-1]"
            )}
          />
        )}

        {/* --- OVERLAY LAYER --- */}
        {isStreaming && isSelfie && !preview && (
          <>
            {/* The Oval */}
            <div className={getOverlayStyles()} />
            
            {/* Status Badge */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
               <div className={cn(
                 "px-4 py-1.5 rounded-full font-bold text-xs uppercase tracking-wide backdrop-blur-md shadow-lg transition-colors duration-300 flex items-center gap-2",
                 isAligned ? "bg-green-500 text-white" : "bg-red-500/90 text-white"
               )}>
                 {isAligned ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                 {getStatusText()}
               </div>
            </div>
          </>
        )}
        
        {/* Loading Spinner for Camera Init */}
        {!isStreaming && !preview && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-900/50 z-30">
                <Camera size={48} className="animate-pulse" />
                <p className="mt-2 text-sm">Initializing...</p>
            </div>
        )}
      </div>

      <div className="flex gap-4">
        {preview ? (
          <button 
            onClick={retake}
            className="flex items-center gap-2 px-6 py-2 bg-white border border-gray-300 text-gray-800 rounded-full hover:bg-gray-100"
          >
            <RefreshCw size={18} /> Retake
          </button>
        ) : (
          <div className="flex gap-4">
             {/* Switch Camera Button */}
             <button 
              onClick={() => {
                setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
                setTimeout(startCamera, 100);
              }}
              className="p-3 bg-gray-200 text-gray-700 rounded-full hover:bg-gray-300"
              title="Switch Camera"
            >
              <RefreshCw size={20} />
            </button>

            {/* Capture Button */}
            <button 
              onClick={captureImage}
              // UX: Disable if not aligned (Optional - remove disabled prop if too strict)
              disabled={isSelfie && !isAligned} 
              className={cn(
                  "px-8 py-2 text-white rounded-full font-bold shadow-lg transition-all transform active:scale-95",
                  (isSelfie && !isAligned) 
                    ? "bg-gray-400 cursor-not-allowed opacity-70" 
                    : "bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/30"
              )}
            >
              Capture
            </button>
          </div>
        )}
      </div>
    </div>
  );
}