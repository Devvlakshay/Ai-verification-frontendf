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
    <div className="space-y-6 pb-24 pt-4">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-white">Take a Selfie</h2>
        <p className="text-white/70 text-sm">
           Fit your face inside the oval.
        </p>
      </div>
      
      <CameraCapture 
        onCapture={handleImageUpdate} 
        label="" 
        initialImage={data.selfie_photo}
        isSelfie={true} 
      />
      
      <FileUpload onUpload={handleImageUpdate} label="Upload from Gallery" />

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