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
  const [hasImage, setHasImage] = useState(!!data.selfie_photo);

  const handleImageUpdate = (img: string) => {
    updateField('selfie_photo', img);
    setHasImage(!!img);
  };

  const handleNext = () => {
    if (hasImage) router.push('/verify/front');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow flex items-center justify-center">
        <CameraCapture 
          onCapture={handleImageUpdate} 
          label="" 
          initialImage={data.selfie_photo}
          isSelfie={true}
          retakeActions={
            <div className="mt-2">
              <FileUpload onUpload={handleImageUpdate} label="Or Upload from Gallery" />
            </div>
          }
        />
      </div>
      
      {!hasImage && (
        <div className="px-4 pb-4">
          <FileUpload onUpload={handleImageUpdate} label="Upload from Gallery" />
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