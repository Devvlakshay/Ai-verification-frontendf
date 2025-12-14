'use client';
import { useState, ChangeEvent } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';

interface Props {
  onUpload: (base64: string) => void;
  label: string;
}

export default function FileUpload({ onUpload, label }: Props) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);

    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;

      img.onload = () => {
        // Create canvas for resizing
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Resize logic: Max dimension 1280px (HD)
        const MAX_SIZE = 1280;
        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        // Convert to optimized Base64 (JPEG, 80% quality)
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);

        onUpload(compressedBase64);
        setIsProcessing(false);
      };

      img.onerror = () => {
        alert("Failed to load image. Please try another file.");
        setIsProcessing(false);
      };
    };
  };

  return (
    <div className="mt-4 text-center">
      <label 
        className={`inline-flex items-center gap-2 text-sm text-blue-600 cursor-pointer hover:underline ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}
      >
        {isProcessing ? (
          <Loader2 className="animate-spin" size={16} />
        ) : (
          <UploadCloud size={16} />
        )}
        {isProcessing ? "Processing..." : label}
        
        <input 
          type="file" 
          accept="image/*" 
          onChange={handleFileChange} 
          disabled={isProcessing}
          className="hidden" 
        />
      </label>
    </div>
  );
}