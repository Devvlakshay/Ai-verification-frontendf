'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import CameraCapture from '@/components/CameraCapture';
import FileUpload from '@/components/FileUpload';
import { useVerificationStore } from '@/components/VerificationStore';
import { Loader2 } from 'lucide-react';

export default function BackPage() {
  const router = useRouter();
  const { data, updateField, isLoaded } = useVerificationStore();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(data.passport_old);
  const [isRedirectingToSelfie, setIsRedirectingToSelfie] = useState(false);

  // Check if front image exists on mount - but ONLY after store is loaded
  // Skip this check if we're already redirecting to selfie due to verification failure
  useEffect(() => {
    if (!isLoaded || isRedirectingToSelfie) return; // Wait for store to load or skip if redirecting to selfie
    
    if (!data.passport_first) {
      console.error('Front card not found in store:', data);
      setError('Front card not found. Redirecting to front card page...');
      setTimeout(() => router.push('/verify/front'), 2000);
    }
  }, [isLoaded, data.passport_first, router, isRedirectingToSelfie]);

  const handleImageUpdateAndVerify = async (img: string) => {
    if (!img) return;

    // Validate that front image exists
    if (!data.passport_first) {
      setError('Front card image not found. Please go back and capture the front card first.');
      return;
    }

    setImage(img);
    updateField('passport_old', img); // Save to store immediately
    setLoading(true);
    setError(null);

    try {
      // Send BOTH front and back images for verification together
      const response = await fetch('/api/verify-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: data.user_id,
          front_image: data.passport_first, // Front card image from store
          back_image: img, // Current back card image
          side: 'both', // New flag to indicate both images
        }),
      });

      const result = await response.json();
      
      console.log('🔍 Verification result:', result);

      if (response.ok && result.front_detected && result.back_detected) {
        // --- SUCCESS: Both cards verified ---
        router.push('/verify/result'); // Navigate to final page
      } else {
        // --- FAILURE: One or both cards not detected ---
        // Set flag to prevent useEffect from redirecting to front page
        setIsRedirectingToSelfie(true);
        
        // Clear all stored data since verification failed
        updateField('selfie_photo', null);
        updateField('passport_first', null);
        updateField('passport_old', null);
        
        let errorMessage = 'Front and back card not detected. Try again with selfie.';
        
        setError(errorMessage);
        setImage(null);
        
        // Redirect to selfie page after showing error
        setTimeout(() => {
          router.push('/verify/selfie');
        }, 3000);
      }
    } catch (e: any) {
      setError("An unexpected error occurred. Please try again.");
      setImage(null);
    } finally {
      setLoading(false);
    }
  };
  
  // Simple Modal for showing errors - Responsive
  const ErrorPopup = () => (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-gray-800 border border-red-500/50 rounded-xl sm:rounded-2xl p-4 sm:p-6 text-center shadow-2xl max-w-xs sm:max-w-sm mx-auto w-full">
        <h3 className="text-lg sm:text-xl font-bold text-red-400 mb-2 sm:mb-3">Verification Failed</h3>
        <p className="text-white/80 mb-3 sm:mb-4 text-sm sm:text-base">{error}</p>
        <p className="text-white/60 text-xs sm:text-sm">Redirecting to selfie page...</p>
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
      
      <div className="flex-center flex items-center justify-center my-4 sm:my-6">
        {loading ? (
          <div className="flex flex-col items-center gap-3 sm:gap-4 text-white px-4">
            <Loader2 className="animate-spin text-lavender w-10 h-10 sm:w-12 sm:h-12" />
            <p className="font-semibold text-base sm:text-lg">Verifying Both Cards...</p>
            <p className="text-xs sm:text-sm text-white/70 text-center">Checking front and back Aadhaar cards.</p>
          </div>
        ) : (
          <CameraCapture 
            onCapture={handleImageUpdateAndVerify} 
            label="Back Card Preview" 
            initialImage={image}
            isSelfie={false}
            retakeActions={
              <div className="mt-2">
                <FileUpload onUpload={handleImageUpdateAndVerify} label="Or upload Back Image" />
              </div>
            }
          />
        )}
      </div>
       
      {!image && !loading && (
        <div className="px-4 pb-4">
          <FileUpload onUpload={handleImageUpdateAndVerify} label="Or upload Back Image" />
        </div>
      )}
    </div>
  );
}