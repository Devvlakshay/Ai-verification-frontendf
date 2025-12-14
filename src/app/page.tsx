import Link from 'next/link';
import { ShieldCheck, ScanFace } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white p-6 text-center">
      <div className="bg-white p-4 rounded-full shadow-lg mb-6 text-blue-600">
        <ScanFace size={64} />
      </div>
      <h1 className="text-4xl font-bold text-gray-900 mb-4">Identity Verification</h1>
      <p className="text-gray-600 max-w-md mb-8">
        Secure, AI-powered identity verification using Aadhaar and Facial Recognition technology.
      </p>
      
      <Link href="/verify/details" className="bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold px-8 py-4 rounded-full shadow-lg transition-transform hover:scale-105 flex items-center gap-2">
        <ShieldCheck /> Start Verification
      </Link>
    </div>
  );
}