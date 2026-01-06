'use client';
import { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ImageCapture from '@/components/ImageCapture';
import { useVerificationStore } from '@/components/VerificationStore';
import { ArrowRight, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { AadhaarDetectionResult, useAadhaarDetection } from '@/hooks/useAadhaarDetection';

function FrontPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, updateField, isLoaded } = useVerificationStore();
  
  const [hasImage, setHasImage] = useState(!!data.passport_first);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [frontDetection, setFrontDetection] = useState<AadhaarDetectionResult | null>(
    data.front_detection as AadhaarDetectionResult | null
  );
  
  // Background detection state
  const [isBackgroundDetecting, setIsBackgroundDetecting] = useState(false);
  
  // Detection hook for background detection (gallery uploads)
  const { isModelReady, loadModel, detectImage } = useAadhaarDetection();

  // Update hasImage state when data.passport_first changes
  useEffect(() => {
    setHasImage(!!data.passport_first);
  }, [data.passport_first]);

  // Save Aadhaar image to disk
  const saveAadhaarImage = async (image: string, side: 'front' | 'back') => {
    const userId = data.user_id || searchParams.get('user_id');
    
    if (!userId) {
      console.warn(`⚠️ Cannot save Aadhaar ${side} - no user_id available`);
      return;
    }
    
    if (!image) {
      console.warn(`⚠️ Cannot save Aadhaar ${side} - no image provided`);
      return;
    }
    
    console.log(`📤 Saving Aadhaar ${side} for user: ${userId}`);
    
    try {
      const response = await fetch('/api/save-aadhaar-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          image,
          side
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Aadhaar ${side} image saved:`, result.path);
      } else {
        const error = await response.json();
        console.error(`❌ Failed to save Aadhaar ${side} image:`, error);
      }
    } catch (err) {
      console.error(`❌ Error saving Aadhaar ${side} image:`, err);
    }
  };

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
    
    // Store detection result from camera capture (real-time detection)
    if (detection) {
      setFrontDetection(detection);
      updateField('front_detection', detection);
    } else if (img) {
      // No detection provided = gallery upload
      // Clear existing detection and start background detection
      setFrontDetection(null);
      updateField('front_detection', null);
      
      // Start background detection for gallery uploads
      runBackgroundDetection(img);
    } else {
      setFrontDetection(null);
      updateField('front_detection', null);
    }
    
    // Save image to disk
    if (img) {
      saveAadhaarImage(img, 'front');
    }
  };
  
  // Background detection for gallery uploads
  const runBackgroundDetection = useCallback(async (imageData: string) => {
    if (!imageData) return;
    
    setIsBackgroundDetecting(true);
    console.log('🔄 Starting background detection for front card...');
    
    try {
      // Load model if not ready
      if (!isModelReady) {
        await loadModel();
      }
      
      // Run detection
      const result = await detectImage(imageData);
      console.log('✅ Background detection complete:', result);
      
      // Update state with result
      setFrontDetection(result);
      updateField('front_detection', result);
    } catch (err) {
      console.error('❌ Background detection failed:', err);
    } finally {
      setIsBackgroundDetecting(false);
    }
  }, [isModelReady, loadModel, detectImage, updateField]);

  // Check if front card is properly detected
  const isFrontCardValid = frontDetection?.detected && frontDetection?.cardType === 'front';

  const handleNext = () => {
    // Validate image exists
    if (!hasImage || !data.passport_first) {
      setValidationError('Please capture or upload the front side of your Aadhaar card.');
      return;
    }

    console.log('✅ Front card captured, navigating to back page');
    router.push('/verify/back');
  };
  
  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-2rem)] min-h-[calc(100dvh-2rem)] pt-4 sm:pt-6">
      <div className="text-center px-4">
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">Aadhaar Front</h2>
        <p className="text-white/70 text-xs sm:text-sm mt-1">Capture or upload the front side with your photo.</p>
      </div>

      {/* Validation Error */}
      {validationError && (
        <div className="mx-4 mt-2 p-3 bg-red-500/20 border border-red-500/50 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm">{validationError}</p>
        </div>
      )}

      {/* Detection Status */}
      {hasImage && (isBackgroundDetecting || frontDetection) && (
        <div className={`mx-4 mt-2 p-3 rounded-xl flex items-center gap-2 ${
          isBackgroundDetecting 
            ? 'bg-blue-500/20 border border-blue-500/50'
            : isFrontCardValid 
              ? 'bg-green-500/20 border border-green-500/50' 
              : 'bg-yellow-500/20 border border-yellow-500/50'
        }`}>
          {isBackgroundDetecting ? (
            <>
              <Loader2 className="w-5 h-5 text-blue-400 flex-shrink-0 animate-spin" />
              <p className="text-blue-300 text-sm">Analyzing card in background...</p>
            </>
          ) : isFrontCardValid ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
              <p className="text-green-300 text-sm">
                ✓ Front card detected ({Math.round(frontDetection!.confidence * 100)}% confidence)
              </p>
            </>
          ) : (
            <>
              <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
              <p className="text-yellow-300 text-sm">
                ⚠ Detected: {frontDetection?.cardType || 'Unknown'} - Please capture the FRONT side
              </p>
            </>
          )}
        </div>
      )}
      
      <div className="flex-1 flex justify-center my-4 sm:my-6">
        <ImageCapture 
          onCapture={handleImageUpdate} 
          label="Front Card" 
          initialImage={data.passport_first}
          cardSide="front"
        />
      </div>

      {/* Floating Action Button */}
      {hasImage && (
        <div className="fixed bottom-4 sm:bottom-6 left-0 w-full px-4 sm:px-6 z-50 pb-safe">
          <div className="max-w-md sm:max-w-lg md:max-w-xl mx-auto">
            <button 
              onClick={handleNext}
              className="w-full py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-base sm:text-lg flex items-center justify-center gap-2 shadow-xl transition-transform bg-lavender text-deep-violet shadow-lavender/40 hover:scale-[1.02] active:scale-[0.98]"
            >
              Continue <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6" />
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