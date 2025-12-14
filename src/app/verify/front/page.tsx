'use client';
import { useRouter } from 'next/navigation';
import CameraCapture from '@/components/CameraCapture';
import FileUpload from '@/components/FileUpload';
import { useVerificationStore } from '@/components/VerificationStore';

export default function FrontPage() {
  const router = useRouter();
  const { data, updateField } = useVerificationStore();

  const handleCapture = (img: string) => {
    updateField('passport_first', img);
    setTimeout(() => router.push('/verify/back'), 500);
  };

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold">Aadhaar Front</h2>
        <p className="text-gray-500 text-sm">Capture the front side of your Aadhaar card containing your photo.</p>
      </div>
      
      <CameraCapture 
        onCapture={handleCapture} 
        label="Aadhaar Front Side" 
        initialImage={data.passport_first}
      />
       
      <FileUpload onUpload={handleCapture} label="Or upload front image" />
    </div>
  );
}