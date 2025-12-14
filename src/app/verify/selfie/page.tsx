'use client';
import { useRouter } from 'next/navigation';
import CameraCapture from '@/components/CameraCapture';
import FileUpload from '@/components/FileUpload';
import { useVerificationStore } from '@/components/VerificationStore';

export default function SelfiePage() {
  const router = useRouter();
  const { data, updateField } = useVerificationStore();

  const handleCapture = (img: string) => {
    updateField('selfie_photo', img);
    setTimeout(() => router.push('/verify/front'), 500);
  };

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold">Take a Selfie</h2>
        <p className="text-gray-500 text-sm">Position your face within the frame. Ensure good lighting.</p>
      </div>
      
      <CameraCapture 
        onCapture={handleCapture} 
        label="Selfie Photo" 
        initialImage={data.selfie_photo}
      />
      
      <FileUpload onUpload={handleCapture} label="Or upload selfie from gallery" />
    </div>
  );
}