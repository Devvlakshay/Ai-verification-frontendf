'use client';
import { useRouter } from 'next/navigation';
import { useVerificationStore } from '@/components/VerificationStore';
import { CheckCircle, PartyPopper } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ResultPage() {
  const router = useRouter();
  const { clearImages } = useVerificationStore();

  const handleRestart = () => {
    clearImages();
    router.push('/verify/front'); // Or wherever the flow starts
  };

  // Send response to app dev window (if running in app)
  if (typeof window !== 'undefined' && window.parent !== window) {
    const { user_id } = JSON.parse(sessionStorage.getItem('verification_user') || '{}');
    window.parent.postMessage({
      user_id: user_id || null,
      success: true,
      message: 'Submission received. Verification in progress.'
    }, '*');
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10 flex flex-col items-center justify-center text-center min-h-[70vh]">
      
      {/* Main Status Card */}
      <div className={cn("text-center p-8 rounded-3xl border-2 flex flex-col items-center shadow-sm", 'bg-green-500/10', 'border-green-500/20')}>
        <div className="mb-4 bg-white/10 p-4 rounded-full shadow-sm">
          <PartyPopper size={64} className="text-green-400" />
        </div>
        <h2 className={cn("text-3xl font-bold mb-2", 'text-green-400')}>Submission Received</h2>
      </div>

      {/* Message Body */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
          <p className="text-white/80">
            Thank you for submitting your verification request. 
            We’ve received your details, and the verification process may take up to 72 hours.
          </p>
          <p className="text-sm text-white/60 mt-2">
            Kindly wait while we review and approve your verification.
          </p>
      </div>

    </div>
  );
}