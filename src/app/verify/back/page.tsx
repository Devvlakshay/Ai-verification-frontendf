'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import CameraCapture from '@/components/CameraCapture';
import FileUpload from '@/components/FileUpload';
import { useVerificationStore } from '@/components/VerificationStore';
import { Loader2 } from 'lucide-react';

export default function BackPage() {
  const router = useRouter();
  const { data, updateField } = useVerificationStore();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(data.passport_old);

  const handleImageUpdateAndVerify = async (img: string) => {
    if (!img) return;

    setImage(img);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/verify-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: data.user_id,
          image: img,
          side: 'back',
        }),
      });

      const result = await response.json();

      if (response.ok && result.detected) {
        // --- SUCCESS ---
        updateField('passport_old', img); // Save image to store
        router.push('/verify/result'); // Navigate to final page
      } else {
        // --- FAILURE ---
        setError(result.message || "Back Aadhaar not detected. Kindly upload the back Aadhaar.");
        setImage(null); // Clear the invalid image
      }
    } catch (e: any) {
      setError("An unexpected error occurred. Please try again.");
      setImage(null);
    } finally {
      setLoading(false);
    }
  };
  
  // Simple Modal for showing errors
  const ErrorPopup = () => (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 border border-red-500/50 rounded-2xl p-6 text-center shadow-2xl max-w-sm mx-auto">
        <h3 className="text-xl font-bold text-red-400 mb-3">Verification Failed</h3>
        <p className="text-white/80 mb-6">{error}</p>
        <button
          onClick={() => setError(null)}
          className="bg-lavender text-deep-violet px-8 py-2 rounded-lg font-semibold hover:bg-opacity-80 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full pt-4">
      {error && <ErrorPopup />}

      <div className="text-center px-4">
        <h2 className="text-2xl font-bold text-white">Aadhaar Back</h2>
        <p className="text-white/70 text-sm">Capture the back side with the address.</p>
      </div>
      
      <div className="flex-grow flex items-center justify-center my-4">
        {loading ? (
          <div className="flex flex-col items-center gap-4 text-white">
            <Loader2 className="animate-spin text-lavender" size={48} />
            <p className="font-semibold text-lg">Verifying Image...</p>
            <p className="text-sm text-white/70">Checking for Aadhaar back card.</p>
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