'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import CameraCapture from '@/components/CameraCapture';
import { useVerificationStore } from '@/components/VerificationStore';
import { ArrowRight } from 'lucide-react';

export default function SelfiePage() {
  const router = useRouter();
  const { data, updateField } = useVerificationStore();
  const [hasImage, setHasImage] = useState(!!data.selfie_photo);

  // Update hasImage when data.selfie_photo changes
  useEffect(() => {
    setHasImage(!!data.selfie_photo);
  }, [data.selfie_photo]);

  const handleImageUpdate = (img: string) => {
    console.log('Front image updated:', img ? 'Image captured' : 'Image cleared');
    updateField('selfie_photo', img);
    setHasImage(!!img);
    
    // Save selfie to uploads directory
    if (img && data.user_id) {
      fetch('/api/save-selfie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: data.user_id,
          image: img
        })
      }).catch(err => console.error('Failed to save selfie:', err));
    }
  };

  const handleNext = () => {
    if (hasImage && data.selfie_photo) {
      router.push('/verify/front');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow flex items-center justify-center">
        <CameraCapture 
          onCapture={handleImageUpdate} 
          label="" 
          initialImage={data.selfie_photo}
          isSelfie={true}
        />
      </div>

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