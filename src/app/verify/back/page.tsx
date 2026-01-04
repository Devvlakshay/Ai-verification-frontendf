'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import CameraCapture from '@/components/CameraCapture';
import FileUpload from '@/components/FileUpload';
import { useVerificationStore } from '@/components/VerificationStore';
import { Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { AadhaarDetectionResult, useAadhaarDetection } from '@/hooks/useAadhaarDetection';

export default function BackPage() {
  const router = useRouter();
  const { data, updateField, isLoaded } = useVerificationStore();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(data.passport_old);
  const [backDetection, setBackDetection] = useState<AadhaarDetectionResult | null>(
    data.back_detection as AadhaarDetectionResult | null
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  // Use the Aadhaar detection hook for file uploads
  const { isModelReady, loadModel, detectImage } = useAadhaarDetection();

  // Load model on mount
  useEffect(() => {
    loadModel();
  }, [loadModel]);

  // Check if front image exists on mount - but ONLY after store is loaded
  useEffect(() => {
    if (!isLoaded) return;
    
    if (!data.passport_first) {
      console.error('Front card not found in store:', data);
      setError('Front card not found. Redirecting to front card page...');
      setTimeout(() => router.push('/verify/front'), 2000);
    }
  }, [isLoaded, data.passport_first, router]);

  const handleImageUpdate = (img: string, detection?: AadhaarDetectionResult) => {
    console.log('Back image updated:', img ? 'Image captured' : 'Image cleared', 'Detection:', detection);
    
    setImage(img);
    updateField('passport_old', img);
    setValidationError(null);
    
    if (detection) {
      setBackDetection(detection);
      updateField('back_detection', detection);
    } else {
      setBackDetection(null);
      updateField('back_detection', null);
    }
  };

  // Handle file upload - run detection on the uploaded image
  const handleFileUpload = useCallback(async (img: string) => {
    console.log('File uploaded, running detection...');
    setImage(img);
    updateField('passport_old', img);
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
      
      setBackDetection(detection);
      updateField('back_detection', detection);
    } catch (err) {
      console.error('Detection error on uploaded file:', err);
      setValidationError('Failed to analyze the image. Please try again.');
    } finally {
      setIsDetecting(false);
    }
  }, [isModelReady, loadModel, detectImage, updateField]);

  // Check if back card is properly detected
  const isBackCardValid = backDetection?.detected && backDetection?.cardType === 'back';
  
  // Check if front card was properly detected
  const frontDetection = data.front_detection as AadhaarDetectionResult | null;
  const isFrontCardValid = frontDetection?.detected && frontDetection?.cardType === 'front';

  const handleNext = () => {
    // Validate back card detection
    if (!image || !data.passport_old) {
      setValidationError('Please capture the back side of your Aadhaar card.');
      return;
    }

    if (!isBackCardValid) {
      setValidationError('Back card not detected. Please capture a clear image of the back side of your Aadhaar card.');
      return;
    }

    // Both cards should be valid
    if (!isFrontCardValid) {
      setValidationError('Front card detection issue. Please go back and recapture the front side.');
      return;
    }

    console.log('✅ Both front and back cards validated!');
    console.log('Front:', frontDetection);
    console.log('Back:', backDetection);
    
    // Mark as approved and go to result
    updateField('verification_status', 'approved');
    
    setLoading(true);
    setTimeout(() => {
      router.push('/verify/result');
    }, 500);
  };
  
  // Simple Modal for showing errors - Responsive
  const ErrorPopup = () => (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-gray-800 border border-red-500/50 rounded-xl sm:rounded-2xl p-4 sm:p-6 text-center shadow-2xl max-w-xs sm:max-w-sm mx-auto w-full">
        <h3 className="text-lg sm:text-xl font-bold text-red-400 mb-2 sm:mb-3">Error</h3>
        <p className="text-white/80 mb-3 sm:mb-4 text-sm sm:text-base">{error}</p>
        <p className="text-white/60 text-xs sm:text-sm">Redirecting...</p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-2rem)] min-h-[calc(100dvh-2rem)] pt-4 sm:pt-6">
      {error && <ErrorPopup />}

      <div className="text-center px-4">
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">Aadhaar Back</h2>
        <p className="text-white/70 text-xs sm:text-sm mt-1">Capture the back side with the address.</p>
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

      {image && backDetection && !isDetecting && (
        <div className={`mx-4 mt-2 p-3 rounded-xl flex items-center gap-2 ${
          isBackCardValid 
            ? 'bg-green-500/20 border border-green-500/50' 
            : 'bg-yellow-500/20 border border-yellow-500/50'
        }`}>
          <p className={`text-sm ${isBackCardValid ? 'text-green-300' : 'text-yellow-300'}`}>
            {isBackCardValid 
              ? `✓ Back card detected (${Math.round(backDetection.confidence * 100)}% confidence)` 
              : `⚠ Detected: ${backDetection.cardType || 'Unknown'} - Please capture the BACK side`}
          </p>
        </div>
      )}
      
      <div className="flex-center flex items-center justify-center my-4 sm:my-6">
        {loading ? (
          <div className="flex flex-col items-center gap-3 sm:gap-4 text-white px-4">
            <Loader2 className="animate-spin text-lavender w-10 h-10 sm:w-12 sm:h-12" />
            <p className="font-semibold text-base sm:text-lg">Verifying cards...</p>
          </div>
        ) : (
          <CameraCapture 
            onCapture={handleImageUpdate} 
            label="Back Card Preview" 
            initialImage={image}
            isSelfie={false}
            expectedCardSide="back"
            retakeActions={
              <div className="mt-2">
                <FileUpload onUpload={handleFileUpload} label="Or upload Back Image" />
              </div>
            }
          />
        )}
      </div>
       
      {!image && !loading && (
        <div className="px-4 pb-4">
          <FileUpload onUpload={handleFileUpload} label="Or upload Back Image" />
        </div>
      )}

      {/* Floating Action Button - Responsive */}
      {image && !loading && (
        <div className="fixed bottom-4 sm:bottom-6 left-0 w-full px-4 sm:px-6 z-50 pb-safe">
          <div className="max-w-md sm:max-w-lg md:max-w-xl mx-auto">
            <button 
              onClick={handleNext}
              disabled={!isBackCardValid || isDetecting}
              className={`w-full py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-base sm:text-lg flex items-center justify-center gap-2 shadow-xl transition-transform ${
                isBackCardValid && !isDetecting
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
                  Verify & Continue <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}