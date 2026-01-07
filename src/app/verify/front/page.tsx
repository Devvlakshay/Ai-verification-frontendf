'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ImageCapture from '@/components/ImageCapture';
import { useVerificationStore } from '@/components/VerificationStore';
import { ArrowRight, AlertCircle } from 'lucide-react';

function FrontPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, updateField, isLoaded } = useVerificationStore();
  
  const [hasImage, setHasImage] = useState(!!data.passport_first);
  const [validationError, setValidationError] = useState<string | null>(null);

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

  const handleImageUpdate = (img: string) => {
    console.log('Front image updated:', img ? 'Image captured' : 'Image cleared');
    updateField('passport_first', img);
    setHasImage(!!img);
    setValidationError(null);
    
    // Save front Aadhaar image to uploads directory
    if (img && data.user_id) {
      fetch('/api/save-aadhaar-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: data.user_id,
          image: img,
          side: 'front'
        })
      }).catch(err => console.error('Failed to save front Aadhaar image:', err));
    }
  };

  const handleNext = async () => {
    // Validate image exists
    if (!hasImage || !data.passport_first) {
      setValidationError('Please capture or upload the front side of your Aadhaar card.');
      return;
    }

    console.log('✅ Front card captured, proceeding to back page (verification happens after both images)');
    // No frontend verification - just navigate to back page
    // Backend verification will happen after both front and back images are captured
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
      
      <div className="flex-1 flex justify-center my-4 sm:my-6">
        <ImageCapture 
          onCapture={handleImageUpdate} 
          label="Front Card" 
          initialImage={data.passport_first}
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