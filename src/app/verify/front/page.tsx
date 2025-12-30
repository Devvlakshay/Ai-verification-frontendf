'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import CameraCapture from '@/components/CameraCapture';
import FileUpload from '@/components/FileUpload';
import { useVerificationStore } from '@/components/VerificationStore';
import { Loader2 } from 'lucide-react';

export default function FrontPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, updateField } = useVerificationStore();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(data.passport_first);

  useEffect(() => {
    // Persist user details from URL params into the store
    const userId = searchParams.get('user_id');
    const token = searchParams.get('token') || searchParams.get('jwt');
    const name = searchParams.get('name');
    const dob = searchParams.get('dob');
    const gender = searchParams.get('gender');

    if (userId) updateField('user_id', userId);
    if (token) updateField('token', token);
    if (name) updateField('name', name);
    if (dob) updateField('dob', dob);
    if (gender) updateField('gender', gender);
  }, [searchParams, updateField]);

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
          user_id: data.user_id || searchParams.get('user_id'),
          image: img,
          side: 'front',
        }),
      });

      const result = await response.json();

      if (response.ok && result.detected) {
        // --- SUCCESS ---
        updateField('passport_first', img); // Save image to store
        router.push('/verify/back'); // Navigate to next step
      } else {
        // --- FAILURE ---
        setError(result.message || "Front Aadhaar not detected. Kindly upload the front Aadhaar.");
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
        <h2 className="text-2xl font-bold text-white">Aadhaar Front</h2>
        <p className="text-white/70 text-sm">Capture the front side with your photo.</p>
      </div>
      
      <div className="flex-grow flex items-center justify-center my-4">
        {loading ? (
          <div className="flex flex-col items-center gap-4 text-white">
            <Loader2 className="animate-spin text-lavender" size={48} />
            <p className="font-semibold text-lg">Verifying Image...</p>
            <p className="text-sm text-white/70">Checking for Aadhaar front card.</p>
          </div>
        ) : (
          <CameraCapture 
            onCapture={handleImageUpdateAndVerify} 
            label="Front Card Preview" 
            initialImage={image}
            isSelfie={false}
            retakeActions={
              <div className="mt-2">
                <FileUpload onUpload={handleImageUpdateAndVerify} label="Or upload Front Image" />
              </div>
            }
          />
        )}
      </div>
       
      {!image && !loading && (
        <div className="px-4 pb-4">
          <FileUpload onUpload={handleImageUpdateAndVerify} label="Or upload Front Image" />
        </div>
      )}
    </div>
  );
}