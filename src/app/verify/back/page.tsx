'use client';
import { useRouter } from 'next/navigation';
import CameraCapture from '@/components/CameraCapture';
import FileUpload from '@/components/FileUpload';
import { useVerificationStore } from '@/components/VerificationStore';

export default function BackPage() {
  const router = useRouter();
  const { data, updateField } = useVerificationStore();

  const handleCapture = (img: string) => {
    updateField('passport_old', img);
    setTimeout(() => router.push('/verify/result'), 500);
  };

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold">Aadhaar Back</h2>
        <p className="text-gray-500 text-sm">Capture the back side of your Aadhaar card containing the address.</p>
      </div>
      
      <CameraCapture 
        onCapture={handleCapture} 
        label="Aadhaar Back Side" 
        initialImage={data.passport_old}
      />

      <FileUpload onUpload={handleCapture} label="Or upload back image" />
    </div>
  );
}