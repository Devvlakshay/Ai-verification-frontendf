'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ImageCapture from '@/components/ImageCapture';
import { useVerificationStore } from '@/components/VerificationStore';
import { Loader2, AlertCircle, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import { AadhaarDetectionResult, useAadhaarDetection } from '@/hooks/useAadhaarDetection';

type VerificationStep = 'capture' | 'verifying' | 'success' | 'failed';

export default function BackPage() {
  const router = useRouter();
  const { data, updateField, isLoaded } = useVerificationStore();
  
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(data.passport_old);
  const [validationError, setValidationError] = useState<string | null>(null);
  
  // Verification state
  const [verificationStep, setVerificationStep] = useState<VerificationStep>('capture');
  const [verificationMessage, setVerificationMessage] = useState<string>('');
  const [frontDetection, setFrontDetection] = useState<AadhaarDetectionResult | null>(null);
  const [backDetection, setBackDetection] = useState<AadhaarDetectionResult | null>(null);
  
  // Edge detection hook - only used during verification
  const { isModelLoading, loadProgress, isModelReady, loadModel, detectImage } = useAadhaarDetection();

  // Update image state when data.passport_old changes
  useEffect(() => {
    setImage(data.passport_old);
  }, [data.passport_old]);

  // Check if front image exists on mount - but ONLY after store is loaded
  useEffect(() => {
    if (!isLoaded) return;
    
    if (!data.passport_first) {
      console.error('Front card not found in store:', data);
      setError('Front card not found. Redirecting to front card page...');
      setTimeout(() => router.push('/verify/front'), 2000);
    }
  }, [isLoaded, data.passport_first, router]);

  const handleImageUpdate = (img: string) => {
    console.log('Back image updated:', img ? 'Image captured' : 'Image cleared');
    
    setImage(img);
    updateField('passport_old', img);
    setValidationError(null);
    
    // Save back Aadhaar image to uploads directory
    if (img && data.user_id) {
      fetch('/api/save-aadhaar-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: data.user_id,
          image: img,
          side: 'back'
        })
      }).catch(err => console.error('Failed to save back Aadhaar image:', err));
    }
  };

  // Verify both cards using edge detection (ONNX model on device)
  const verifyCards = useCallback(async () => {
    setVerificationStep('verifying');
    setVerificationMessage('Loading AI model...');

    try {
      // Load model if not ready
      if (!isModelReady) {
        await loadModel();
      }

      // Detect front card
      setVerificationMessage('Analyzing front card...');
      const frontResult = await detectImage(data.passport_first!);
      setFrontDetection(frontResult);
      console.log('Front card detection:', frontResult);
      
      // Small delay for UX
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Detect back card
      setVerificationMessage('Analyzing back card...');
      const backResult = await detectImage(image!);
      setBackDetection(backResult);
      console.log('Back card detection:', backResult);
      
      // Check results from edge detection
      const isFrontValid = frontResult.detected && frontResult.cardType === 'front';
      const isBackValid = backResult.detected && backResult.cardType === 'back';

      if (isFrontValid && isBackValid) {
        setVerificationStep('success');
        setVerificationMessage('Both cards verified successfully!');
        updateField('verification_status', 'approved');
        
        // Navigate to result after short delay
        setTimeout(() => {
          router.push('/verify/result');
        }, 1500);
      } else {
        setVerificationStep('failed');
        
        if (!isFrontValid && !isBackValid) {
          setVerificationMessage('Both front and back cards could not be verified. Please recapture.');
        } else if (!isFrontValid) {
          setVerificationMessage(`Front card issue: ${frontResult.detected ? `Detected as ${frontResult.cardType}` : 'Not detected'}. Please recapture.`);
        } else {
          setVerificationMessage(`Back card issue: ${backResult.detected ? `Detected as ${backResult.cardType}` : 'Not detected'}. Please recapture.`);
        }
        
        updateField('verification_status', 'rejected');
      }
    } catch (err) {
      console.error('Edge verification error:', err);
      setVerificationStep('failed');
      setVerificationMessage('An error occurred during verification. Please try again.');
      updateField('verification_status', 'rejected');
    }
  }, [isModelReady, loadModel, detectImage, data.passport_first, image, updateField, router]);

  const handleNext = () => {
    // Validate back card exists
    if (!image || !data.passport_old) {
      setValidationError('Please capture or upload the back side of your Aadhaar card.');
      return;
    }

    // Start verification
    verifyCards();
  };

  const handleRetry = () => {
    setVerificationStep('capture');
    setVerificationMessage('');
    setFrontDetection(null);
    setBackDetection(null);
  };

  const handleRecaptureFront = () => {
    router.push('/verify/front');
  };
  
  // Simple Modal for showing errors
  const ErrorPopup = () => (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-gray-800 border border-red-500/50 rounded-xl sm:rounded-2xl p-4 sm:p-6 text-center shadow-2xl max-w-xs sm:max-w-sm mx-auto w-full">
        <h3 className="text-lg sm:text-xl font-bold text-red-400 mb-2 sm:mb-3">Error</h3>
        <p className="text-white/80 mb-3 sm:mb-4 text-sm sm:text-base">{error}</p>
        <p className="text-white/60 text-xs sm:text-sm">Redirecting...</p>
      </div>
    </div>
  );

  // Verification Overlay
  const VerificationOverlay = () => (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-lavender/30 rounded-2xl p-6 sm:p-8 text-center shadow-2xl max-w-sm w-full">
        {verificationStep === 'verifying' && (
          <>
            <Loader2 className="w-16 h-16 text-lavender animate-spin mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Verifying Cards</h3>
            <p className="text-white/70 text-sm">{verificationMessage}</p>
            {isModelLoading && (
              <div className="mt-4">
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-lavender h-2 rounded-full transition-all duration-300"
                    style={{ width: `${loadProgress}%` }}
                  />
                </div>
                <p className="text-white/50 text-xs mt-1">{loadProgress}% loaded</p>
              </div>
            )}
          </>
        )}
        
        {verificationStep === 'success' && (
          <>
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Verification Successful!</h3>
            <p className="text-green-400 text-sm">{verificationMessage}</p>
            
            {/* Detection Results */}
            <div className="mt-4 space-y-2 text-left">
              {frontDetection && (
                <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-3">
                  <p className="text-green-300 text-sm">
                    ✓ Front: {Math.round(frontDetection.confidence * 100)}% confidence
                  </p>
                </div>
              )}
              {backDetection && (
                <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-3">
                  <p className="text-green-300 text-sm">
                    ✓ Back: {Math.round(backDetection.confidence * 100)}% confidence
                  </p>
                </div>
              )}
            </div>
            
            <p className="text-white/50 text-xs mt-4">Redirecting to results...</p>
          </>
        )}
        
        {verificationStep === 'failed' && (
          <>
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Verification Failed</h3>
            <p className="text-red-400 text-sm mb-4">{verificationMessage}</p>
            
            {/* Detection Results */}
            <div className="mt-4 space-y-2 text-left mb-6">
              {frontDetection && (
                <div className={`rounded-lg p-3 ${
                  frontDetection.detected && frontDetection.cardType === 'front'
                    ? 'bg-green-500/20 border border-green-500/30'
                    : 'bg-red-500/20 border border-red-500/30'
                }`}>
                  <p className={`text-sm ${
                    frontDetection.detected && frontDetection.cardType === 'front'
                      ? 'text-green-300'
                      : 'text-red-300'
                  }`}>
                    Front: {frontDetection.detected 
                      ? `${frontDetection.cardType} (${Math.round(frontDetection.confidence * 100)}%)`
                      : 'Not detected'}
                  </p>
                </div>
              )}
              {backDetection && (
                <div className={`rounded-lg p-3 ${
                  backDetection.detected && backDetection.cardType === 'back'
                    ? 'bg-green-500/20 border border-green-500/30'
                    : 'bg-red-500/20 border border-red-500/30'
                }`}>
                  <p className={`text-sm ${
                    backDetection.detected && backDetection.cardType === 'back'
                      ? 'text-green-300'
                      : 'text-red-300'
                  }`}>
                    Back: {backDetection.detected 
                      ? `${backDetection.cardType} (${Math.round(backDetection.confidence * 100)}%)`
                      : 'Not detected'}
                  </p>
                </div>
              )}
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleRecaptureFront}
                className="flex-1 py-2.5 px-4 bg-white/10 border border-white/30 text-white rounded-xl hover:bg-white/20 transition-all text-sm"
              >
                Recapture Front
              </button>
              <button
                onClick={handleRetry}
                className="flex-1 py-2.5 px-4 bg-lavender text-deep-violet rounded-xl hover:bg-lavender/90 transition-all text-sm font-medium"
              >
                Retry Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  // Check if back card is properly detected (from camera capture)
  const isBackCardValid = backDetection?.detected && backDetection?.cardType === 'back';

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-2rem)] min-h-[calc(100dvh-2rem)] pt-4 sm:pt-6">
      {error && <ErrorPopup />}
      {verificationStep !== 'capture' && <VerificationOverlay />}

      <div className="text-center px-4">
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">Aadhaar Back</h2>
        <p className="text-white/70 text-xs sm:text-sm mt-1">Capture or upload the back side with the address.</p>
      </div>

      {/* Validation Error */}
      {validationError && (
        <div className="mx-4 mt-2 p-3 bg-red-500/20 border border-red-500/50 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm">{validationError}</p>
        </div>
      )}
      
      <div className="flex-1 flex justify-center my-4 sm:my-6">
        <ImageCapture 
          onCapture={handleImageUpdate} 
          label="Back Card" 
          initialImage={image}
        />
      </div>

      {/* Floating Action Button */}
      {image && (
        <div className="fixed bottom-4 sm:bottom-6 left-0 w-full px-4 sm:px-6 z-40 pb-safe">
          <div className="max-w-md sm:max-w-lg md:max-w-xl mx-auto">
            <button 
              onClick={handleNext}
              className="w-full py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-base sm:text-lg flex items-center justify-center gap-2 shadow-xl transition-transform bg-lavender text-deep-violet shadow-lavender/40 hover:scale-[1.02] active:scale-[0.98]"
            >
              Verify & Continue <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}