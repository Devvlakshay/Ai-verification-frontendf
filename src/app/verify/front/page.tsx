'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import CameraCapture from '@/components/CameraCapture';
import FileUpload from '@/components/FileUpload';
import { useVerificationStore } from '@/components/VerificationStore';
import { ArrowRight } from 'lucide-react';

export default function FrontPage() {
  const router = useRouter();
  const { data, updateField } = useVerificationStore();
  const [hasImage, setHasImage] = useState(!!data.passport_first);

  const handleImageUpdate = (img: string) => {
    updateField('passport_first', img);
    setHasImage(!!img);
  };

  const handleNext = () => {
    router.push('/verify/back');
  };

  return (
    <div className="flex flex-col h-full pt-4">
      <div className="text-center px-4">
        <h2 className="text-2xl font-bold text-white">Aadhaar Front</h2>
        <p className="text-white/70 text-sm">Upload/Capture the front side with your photo.</p>
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