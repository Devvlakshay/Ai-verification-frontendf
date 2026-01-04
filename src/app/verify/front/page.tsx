'use client';
import { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import CameraCapture from '@/components/CameraCapture';
import FileUpload from '@/components/FileUpload';
import { useVerificationStore } from '@/components/VerificationStore';
import { ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { AadhaarDetectionResult, useAadhaarDetection } from '@/hooks/useAadhaarDetection';

function FrontPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, updateField, isLoaded } = useVerificationStore();
  
  const [hasImage, setHasImage] = useState(!!data.passport_first);
  const [frontDetection, setFrontDetection] = useState<AadhaarDetectionResult | null>(
    data.front_detection as AadhaarDetectionResult | null
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  // Use the Aadhaar detection hook for file uploads
  const { isModelReady, loadModel, detectImage } = useAadhaarDetection();

  // Load model on mount
  useEffect(() => {
    loadModel();
  }, [loadModel]);

  // Update hasImage state when data.passport_first changes
  useEffect(() => {
    setHasImage(!!data.passport_first);
  }, [data.passport_first]);

  useEffect(() => {
    // Persist user details from URL params into the store
    const userId = searchParams.get('user_id');
    const name = searchParams.get('name');
    const dob = searchParams.get('dob');
    const gender = searchParams.get('gender');

    if (userId) updateField('user_id', userId);
    if (name) updateField('name', name);
    if (dob) updateField('dob', dob);
    if (gender) updateField('gender', gender);
  }, [searchParams, updateField]);

  const handleImageUpdate = (img: string, detection?: AadhaarDetectionResult) => {
    console.log('Front image updated:', img ? 'Image captured' : 'Image cleared', 'Detection:', detection);
    updateField('passport_first', img);
    setHasImage(!!img);
    setValidationError(null);
    
    if (detection) {
      setFrontDetection(detection);
      updateField('front_detection', detection);
    } else {
      setFrontDetection(null);
      updateField('front_detection', null);
    }
  };

  // Handle file upload - run detection on the uploaded image
  const handleFileUpload = useCallback(async (img: string) => {
    console.log('File uploaded, running detection...');
    updateField('passport_first', img);
    setHasImage(true);
    setValidationError(null);
    setIsDetecting(true);

    try {
      // Wait for model to be ready if not already
      if (!isModelReady) {
        await loadModel();
      }

      // Run detection on the uploaded image using the hook's detectImage
      const detection = await detectImage(img);
      
      console.log('File upload detection result:', detection);
      
      setFrontDetection(detection);
      updateField('front_detection', detection);
    } catch (err) {
      console.error('Detection error on uploaded file:', err);
      setValidationError('Failed to analyze the image. Please try again.');
    } finally {
      setIsDetecting(false);
    }
  }, [isModelReady, loadModel, detectImage, updateField]);

  // Check if front card is properly detected
  const isFrontCardValid = frontDetection?.detected && frontDetection?.cardType === 'front';

  const handleNext = () => {
    // Validate front card detection
    if (!hasImage || !data.passport_first) {
      setValidationError('Please capture the front side of your Aadhaar card.');
      return;
    }

    if (!isFrontCardValid) {
      setValidationError('Front card not detected. Please capture a clear image of the front side of your Aadhaar card.');
      return;
    }

    console.log('✅ Front card validated, navigating to back page');
    setTimeout(() => {
      router.push('/verify/back');
    }, 300);
  };
  
  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-2rem)] min-h-[calc(100dvh-2rem)] pt-4 sm:pt-6">
      <div className="text-center px-4">
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">Aadhaar Front</h2>
        <p className="text-white/70 text-xs sm:text-sm mt-1">Capture the front side with your photo.</p>
      </div>

      {/* Validation Error */}
      {validationError && (
        <div className="mx-4 mt-2 p-3 bg-red-500/20 border border-red-500/50 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm">{validationError}</p>
        </div>
      )}

      {/* Detection Status */}
      {isDetecting && (
        <div className="mx-4 mt-2 p-3 bg-blue-500/20 border border-blue-500/50 rounded-xl flex items-center gap-2">
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          <p className="text-blue-300 text-sm">Analyzing image...</p>
        </div>
      )}

      {hasImage && frontDetection && !isDetecting && (
        <div className={`mx-4 mt-2 p-3 rounded-xl flex items-center gap-2 ${
          isFrontCardValid 
            ? 'bg-green-500/20 border border-green-500/50' 
            : 'bg-yellow-500/20 border border-yellow-500/50'
        }`}>
          <p className={`text-sm ${isFrontCardValid ? 'text-green-300' : 'text-yellow-300'}`}>
            {isFrontCardValid 
              ? `✓ Front card detected (${Math.round(frontDetection.confidence * 100)}% confidence)` 
              : `⚠ Detected: ${frontDetection.cardType || 'Unknown'} - Please capture the FRONT side`}
          </p>
        </div>
      )}
      
      <div className="flex-center flex items-center justify-center my-4 sm:my-6">
        <CameraCapture 
          onCapture={handleImageUpdate} 
          label="Front Card Preview" 
          initialImage={data.passport_first}
          isSelfie={false}
          expectedCardSide="front"
          retakeActions={
            <div className="mt-2">
              <FileUpload onUpload={handleFileUpload} label="Or upload Front Image" />
            </div>
          }
        />
      </div>
       
      {!hasImage && (
        <div className="px-4 pb-4">
          <FileUpload onUpload={handleFileUpload} label="Or upload Front Image" />
        </div>
      )}

      {/* Floating Action Button - Responsive */}
      {hasImage && (
        <div className="fixed bottom-4 sm:bottom-6 left-0 w-full px-4 sm:px-6 z-50 pb-safe">
          <div className="max-w-md sm:max-w-lg md:max-w-xl mx-auto">
            <button 
              onClick={handleNext}
              disabled={!isFrontCardValid || isDetecting}
              className={`w-full py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-base sm:text-lg flex items-center justify-center gap-2 shadow-xl transition-transform ${
                isFrontCardValid && !isDetecting
                  ? 'bg-lavender text-deep-violet shadow-lavender/40 hover:scale-[1.02] active:scale-[0.98]' 
                  : 'bg-gray-500 text-gray-300 cursor-not-allowed'
              }`}
            >
              {isDetecting ? (
                <>
                  <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" /> Analyzing...
                </>
              ) : (
                <>
                  Continue <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FrontPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-white">Loading...</div>}>
      <FrontPageContent />
    </Suspense>
  );
}