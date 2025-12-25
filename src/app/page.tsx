import Link from 'next/link';
import { ShieldCheck, ScanFace } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-deep-violet text-white p-6 text-center">
      <div
        className="absolute inset-0 z-0"
        style={{
          background: 'radial-gradient(circle at center, #3E1875 0%, #140030 70%)',
        }}
      />
      <div className="relative z-10 flex flex-col items-center">
        <div className="bg-lavender/20 p-4 rounded-full shadow-lg mb-6 text-lavender">
          <ScanFace size={64} />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Identity Verification</h1>
        <p className="text-white/80 max-w-md mb-8">
          Secure, AI-powered identity verification using Aadhaar and Facial Recognition technology.
        </p>
        
        <Link 
          href="/verify/details" 
          className="bg-lavender hover:bg-opacity-80 text-deep-violet text-lg font-semibold px-8 py-4 rounded-full shadow-lg transition-transform hover:scale-105 flex items-center gap-2"
        >
          <ShieldCheck /> Start Verification
        </Link>
      </div>
    </div>
  );
}