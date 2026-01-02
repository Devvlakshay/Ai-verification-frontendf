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
    <div className="space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-6 sm:pb-10 flex flex-col items-center justify-center text-center min-h-[60vh] sm:min-h-[70vh] px-2">
      
      {/* Main Status Card - Responsive */}
      <div className={cn("text-center p-5 sm:p-8 rounded-2xl sm:rounded-3xl border-2 flex flex-col items-center shadow-sm w-full max-w-sm sm:max-w-md", 'bg-green-500/10', 'border-green-500/20')}>
        <div className="mb-3 sm:mb-4 bg-white/10 p-3 sm:p-4 rounded-full shadow-sm">
          <PartyPopper className="text-green-400 w-12 h-12 sm:w-16 sm:h-16" />
        </div>
        <h2 className={cn("text-2xl sm:text-3xl font-bold mb-2", 'text-green-400')}>Submission Received</h2>
      </div>

      {/* Message Body - Responsive */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 sm:p-5 text-center w-full max-w-sm sm:max-w-md">
          <p className="text-white/80 text-sm sm:text-base">
            Thank you for submitting your verification request. 
            We have received your details, and the verification process may take up to 72 hours.
          </p>
          <p className="text-xs sm:text-sm text-white/60 mt-2">
            Kindly wait while we review and approve your verification.
          </p>
      </div>

    </div>
  );
}
