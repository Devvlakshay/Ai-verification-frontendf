'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import CameraCapture from '@/components/CameraCapture';
import FileUpload from '@/components/FileUpload';
import { useVerificationStore } from '@/components/VerificationStore';
import { ArrowRight } from 'lucide-react';

export default function SelfiePage() {
  const router = useRouter();
  const { data, updateField } = useVerificationStore();
  
  // Local state to control the "Continue" button
  const [hasImage, setHasImage] = useState(!!data.selfie_photo);

  const handleImageUpdate = (img: string) => {
    // 1. Update the store (Data)
    updateField('selfie_photo', img);
    
    // 2. Update local state to show "Continue" button
    if (img) setHasImage(true);
    else setHasImage(false);

    // Note: We REMOVED the automatic router.push here 
    // so the user can see the image in the box first.
  };

  const handleNext = () => {
    if (hasImage) {
      router.push('/verify/front');
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Take a Selfie</h2>
        <p className="text-gray-500 text-sm">Ensure your face is clearly visible.</p>
      </div>
      
      {/* 
         The 'initialImage' prop is key! 
         It passes the uploaded file back into the Camera box.
      */}
      <CameraCapture 
        onCapture={handleImageUpdate} 
        label="Selfie Preview" 
        initialImage={data.selfie_photo}
      />
      
      {/* Upload Button updates the same state */}
      <FileUpload onUpload={handleImageUpdate} label="Or upload from Gallery" />

      {/* Only show Next button if image exists */}
      {hasImage && (
        <div className="fixed bottom-0 left-0 w-full p-4 bg-white border-t shadow-lg animate-in slide-in-from-bottom-5">
          <div className="max-w-xl mx-auto">
            <button 
              onClick={handleNext}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-lg flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors"
            >
              Continue <ArrowRight />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}