'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import CameraCapture from '@/components/CameraCapture';
import FileUpload from '@/components/FileUpload';
import { useVerificationStore } from '@/components/VerificationStore';
import { ArrowRight } from 'lucide-react';

function FrontPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, updateField, isLoaded } = useVerificationStore();
  
  const [hasImage, setHasImage] = useState(!!data.passport_first);

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
  };

  const handleNext = () => {
    // Double-check the image exists in store before navigating
    if (hasImage && data.passport_first) {
      console.log('Navigating to back page with front image saved');
      // Add a small delay to ensure IndexedDB write completes
      setTimeout(() => {
        router.push('/verify/back');
      }, 300);
    } else {
      console.error('Front image not found in store');
      setHasImage(false);
    }
  };
  
  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-2rem)] min-h-[calc(100dvh-2rem)] pt-4 sm:pt-6">
      <div className="text-center px-4">
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">Aadhaar Front</h2>
        <p className="text-white/70 text-xs sm:text-sm mt-1">Capture the front side with your photo.</p>
      </div>
      
      <div className="flex-center flex items-center justify-center my-4 sm:my-6">
        <CameraCapture 
          onCapture={handleImageUpdate} 
          label="Front Card Preview" 
          initialImage={data.passport_first}
          isSelfie={false}
          retakeActions={
            <div className="mt-2">
              <FileUpload onUpload={handleImageUpdate} label="Or upload Front Image" />
            </div>
          }
        />
      </div>
       
      {!hasImage && (
        <div className="px-4 pb-4">
          <FileUpload onUpload={handleImageUpdate} label="Or upload Front Image" />
        </div>
      )}

      {/* Floating Action Button - Responsive */}
      {hasImage && (
        <div className="fixed bottom-4 sm:bottom-6 left-0 w-full px-4 sm:px-6 z-50 pb-safe">
          <div className="max-w-md sm:max-w-lg md:max-w-xl mx-auto">
            <button 
              onClick={handleNext}
              className="w-full bg-lavender text-deep-violet py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-base sm:text-lg flex items-center justify-center gap-2 shadow-xl shadow-lavender/40 hover:scale-[1.02] active:scale-[0.98] transition-transform"
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