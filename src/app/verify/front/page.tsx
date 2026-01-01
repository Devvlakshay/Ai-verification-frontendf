'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import CameraCapture from '@/components/CameraCapture';
import FileUpload from '@/components/FileUpload';
import { useVerificationStore } from '@/components/VerificationStore';
import { ArrowRight } from 'lucide-react';

export default function FrontPage() {
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
    <div className="flex flex-col h-full pt-4">
      <div className="text-center px-4">
        <h2 className="text-2xl font-bold text-white">Aadhaar Front</h2>
        <p className="text-white/70 text-sm">Capture the front side with your photo.</p>
      </div>
      
      <div className="flex-grow flex items-center justify-center my-4">
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

      {/* Floating Action Button */}
      {hasImage && (
        <div className="fixed bottom-6 left-0 w-full px-6 z-50">
          <div className="max-w-xl mx-auto">
            <button 
              onClick={handleNext}
              className="w-full bg-lavender text-deep-violet py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 shadow-xl shadow-lavender/40 hover:scale-[1.02] transition-transform"
            >
              Continue <ArrowRight />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}