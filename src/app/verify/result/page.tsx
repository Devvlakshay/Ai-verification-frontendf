'use client';
import { useRouter } from 'next/navigation';
import { useVerificationStore } from '@/components/VerificationStore';
import { CheckCircle, PartyPopper, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ResultPage() {
  const router = useRouter();
  const { data, clearImages } = useVerificationStore();

  const handleRestart = () => {
    clearImages();
    router.push('/verify/front');
  };

  // Determine verification status
  const status = data.verification_status || 'pending';
  const isPendingReview = status === 'pending_review';
  const isApproved = status === 'approved';

  // Send response to app dev window (if running in app)
  if (typeof window !== 'undefined' && window.parent !== window) {
    const { user_id } = JSON.parse(sessionStorage.getItem('verification_user') || '{}');
    window.parent.postMessage({
      user_id: user_id || data.user_id || null,
      success: isApproved || isPendingReview,
      status: status,
      message: isPendingReview 
        ? 'Document submitted for manual review.' 
        : 'Submission received. Verification in progress.'
    }, '*');
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-6 sm:pb-10 flex flex-col items-center justify-center text-center min-h-[60vh] sm:min-h-[70vh] px-2">
      
      {/* Main Status Card - Responsive */}
      <div className={cn(
        "text-center p-5 sm:p-8 rounded-2xl sm:rounded-3xl border-2 flex flex-col items-center shadow-sm w-full max-w-sm sm:max-w-md",
        isPendingReview ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-green-500/10 border-green-500/20'
      )}>
        <div className="mb-3 sm:mb-4 bg-white/10 p-3 sm:p-4 rounded-full shadow-sm">
          {isPendingReview ? (
            <Clock className="text-yellow-400 w-12 h-12 sm:w-16 sm:h-16" />
          ) : (
            <PartyPopper className="text-green-400 w-12 h-12 sm:w-16 sm:h-16" />
          )}
        </div>
        <h2 className={cn(
          "text-2xl sm:text-3xl font-bold mb-2",
          isPendingReview ? 'text-yellow-400' : 'text-green-400'
        )}>
          {isPendingReview ? 'Under Review' : 'Submission Received'}
        </h2>
      </div>

      {/* Message Body - Responsive */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 sm:p-5 text-center w-full max-w-sm sm:max-w-md">
        {isPendingReview ? (
          <>
            <p className="text-white/80 text-sm sm:text-base">
              Your document has been submitted for <span className="text-yellow-400 font-semibold">manual review</span>.
            </p>
            <p className="text-xs sm:text-sm text-white/60 mt-2">
              Our team will verify your documents and notify you within 24-48 hours.
              This happens when our AI needs human assistance for verification.
            </p>
          </>
        ) : (
          <>
            <p className="text-white/80 text-sm sm:text-base">
              Thank you for submitting your verification request. 
              We have received your details, and the verification process may take up to 72 hours.
            </p>
            <p className="text-xs sm:text-sm text-white/60 mt-2">
              Kindly wait while we review and approve your verification.
            </p>
          </>
        )}
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-2 text-white/60 text-xs sm:text-sm">
        <CheckCircle className="w-4 h-4 text-green-400" />
        <span>All documents uploaded successfully</span>
      </div>

    </div>
  );
}
