'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useVerificationStore } from '@/components/VerificationStore';
import { CheckCircle, XCircle, AlertTriangle, Loader2, RefreshCcw, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ResultPage() {
  const router = useRouter();
  const { data, resetStore, isLoaded } = useVerificationStore();
  
  const [status, setStatus] = useState<'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [result, setResult] = useState<any>(null);
  
  // Prevent double-firing in React Strict Mode
  const hasSubmitted = useRef(false);

  useEffect(() => {
    // 1. Wait for IndexedDB to load
    if (!isLoaded) return;

    // 2. Check if we have data to submit
    if (!data.selfie_photo || !data.passport_first) {
      // No data found? Redirect to start
      router.replace('/verify/details');
      return;
    }

    // 3. Submit only once
    if (!hasSubmitted.current) {
      hasSubmitted.current = true;
      submitVerification();
    }
  }, [isLoaded, data]);

  const submitVerification = async () => {
    setStatus('LOADING');
    
    try {
      const response = await fetch('/api/submit-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const json = await response.json();

      if (response.ok) {
        setResult(json);
        setStatus('SUCCESS');
        // Optional: Clear store after success so user can't re-submit same data immediately
        // resetStore(); 
      } else {
        console.error("API Error:", json);
        setResult(json); // Store error details if available
        setStatus('ERROR');
      }
    } catch (error) {
      console.error("Network Error:", error);
      setStatus('ERROR');
    }
  };

  const handleRetry = () => {
    resetStore();
    router.push('/verify/details');
  };

  // --- 1. LOADING UI ---
  if (status === 'LOADING' || status === 'IDLE') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
        <div className="relative">
          {/* Pulsing Effect */}
          <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-75"></div>
          <div className="relative bg-white p-6 rounded-full shadow-xl border border-blue-100">
            <Loader2 className="animate-spin text-blue-600" size={48} />
          </div>
        </div>
        
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-gray-800">Verifying Identity</h2>
          <p className="text-gray-500 text-sm">
            AI is analyzing your documents...<br/>
            <span className="text-xs text-gray-400">(Checking Face Match, OCR, and Liveness)</span>
          </p>
        </div>
      </div>
    );
  }

  // --- 2. ERROR UI (Network/Server Crash) ---
  if (status === 'ERROR' && !result?.final_decision) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6">
        <div className="p-4 bg-red-100 text-red-600 rounded-full mb-4">
          <XCircle size={48} />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
        <p className="text-gray-600 max-w-xs mb-6">
          {result?.error || result?.details || "We couldn't connect to the verification server."}
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-black transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  // --- 3. RESULT UI (Approved / Rejected / Review) ---
  const decision = result?.final_decision || 'REJECTED'; 
  const isApproved = decision === 'APPROVED';
  const isReview = decision === 'REVIEW';
  const isRejected = decision === 'REJECTED';

  // Dynamic Styles based on result
  const statusConfig = {
    APPROVED: {
      color: 'text-green-700',
      bg: 'bg-green-50',
      border: 'border-green-200',
      icon: <CheckCircle size={64} className="text-green-600" />,
      text: 'Verification Successful'
    },
    REVIEW: {
      color: 'text-yellow-700',
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      icon: <AlertTriangle size={64} className="text-yellow-600" />,
      text: 'Manual Review Required'
    },
    REJECTED: {
      color: 'text-red-700',
      bg: 'bg-red-50',
      border: 'border-red-200',
      icon: <XCircle size={64} className="text-red-600" />,
      text: 'Verification Failed'
    }
  };

  const ui = statusConfig[decision as keyof typeof statusConfig] || statusConfig.REJECTED;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      
      {/* Main Status Card */}
      <div className={cn("text-center p-8 rounded-3xl border-2 flex flex-col items-center shadow-sm", ui.bg, ui.border)}>
        <div className="mb-4 bg-white p-4 rounded-full shadow-sm">
          {ui.icon}
        </div>
        <h2 className={cn("text-3xl font-bold mb-2", ui.color)}>{decision}</h2>
        <p className="text-gray-600 font-medium">{ui.text}</p>
        
        <div className="mt-4 px-4 py-1 bg-white/60 rounded-full border border-gray-200 text-sm font-mono text-gray-600">
            Trust Score: <span className="font-bold text-gray-900">{result?.score?.toFixed(1) || 0}/100</span>
        </div>
      </div>

      {/* Failure Reasons (Only show if Rejected/Review) */}
      {(isRejected || isReview) && result?.rejection_reasons?.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-5">
            <h3 className="text-red-800 font-semibold mb-2 flex items-center gap-2">
                <AlertTriangle size={16} /> Issues Found:
            </h3>
            <ul className="space-y-2">
                {result.rejection_reasons.map((reason: string, idx: number) => (
                    <li key={idx} className="text-sm text-red-700 flex items-start gap-2">
                        <span className="mt-1.5 w-1.5 h-1.5 bg-red-400 rounded-full flex-shrink-0" />
                        {reason}
                    </li>
                ))}
            </ul>
        </div>
      )}

      {/* Score Breakdown */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="bg-gray-50 px-5 py-3 border-b flex justify-between items-center">
            <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Analysis Report</h3>
            <span className="text-xs text-gray-400">ID: {result?.user_id}</span>
        </div>
        <div className="p-5 space-y-4">
            <ScoreRow label="Face Match" score={result?.breakdown?.face_score} max={20} />
            <ScoreRow label="Document Validity" score={result?.breakdown?.aadhar_score} max={30} />
            <ScoreRow label="DOB Validation" score={result?.breakdown?.dob_score} max={30} />
            <ScoreRow label="Gender Check" score={result?.breakdown?.gender_score} max={30} />
        </div>
      </div>

      {/* Action Button
      <button 
        onClick={handleRetry}
        className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl active:scale-95"
      >
        <RefreshCcw size={18} />
        {isApproved ? 'Verify Another User' : 'Try Again'}
      </button> */}

    </div>
  );
}

// Subcomponent for score progress bars
function ScoreRow({ label, score = 0, max }: { label: string, score: number, max: number }) {
    const percentage = Math.min(100, (score / max) * 100);
    // Dynamic color for the bar
    const colorClass = percentage > 80 ? 'bg-green-500' : percentage > 40 ? 'bg-yellow-500' : 'bg-red-500';
    
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-sm">
                <span className="text-gray-600 font-medium">{label}</span>
                <span className="font-mono font-bold text-gray-900">{score.toFixed(1)} <span className="text-gray-400 font-normal">/ {max}</span></span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div 
                    className={cn("h-full rounded-full transition-all duration-1000 ease-out", colorClass)} 
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}