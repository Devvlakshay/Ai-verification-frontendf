'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useVerificationStore } from '@/components/VerificationStore';
import { CheckCircle, XCircle, AlertTriangle, Loader2, RefreshCcw, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ResultPage() {
  const router = useRouter();
  const { data, clearImages, isLoaded } = useVerificationStore();
  
  const [status, setStatus] = useState<'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [result, setResult] = useState<any>(null);
  
  // Prevent double-firing in React Strict Mode
  const hasSubmitted = useRef(false);

  useEffect(() => {
    // 1. Wait for IndexedDB to load
    if (!isLoaded) return;

    // 2. Check if we have data to submit
    if (!data.selfie_photo || !data.passport_first) {
      // No data found? Redirect to start of capture flow
      router.replace('/verify/selfie');
      return;
    }

    // 3. Submit only once
    if (!hasSubmitted.current) {
      hasSubmitted.current = true;
      submitVerification();
    }
  }, [isLoaded, data, router]);

  const submitVerification = async () => {
    setStatus('LOADING');

    // 1. RETRIEVE DATA FROM STORAGE
    const storedData = sessionStorage.getItem("verification_user");
    
    if (!storedData) {
      console.error("User data lost! Please restart.");
      setResult({ error: "Session expired. Please open the app again." });
      setStatus('ERROR');
      return;
    }

    const userData = JSON.parse(storedData);

    // 2. CREATE THE PAYLOAD
    const payload = {
      ...data, // Contains images
      user_id: userData.user_id,
      name: userData.name,
      dob: userData.dob,
      gender: userData.gender,
    };
    
    try {
      const response = await fetch('/api/submit-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await response.json();

      if (response.ok) {
        setResult(json);
        setStatus('SUCCESS');
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
    clearImages();
    router.push('/verify/selfie');
  };

  // --- 1. LOADING UI ---
  if (status === 'LOADING' || status === 'IDLE') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
        <div className="relative">
          {/* Pulsing Effect */}
          <div className="absolute inset-0 bg-lavender/30 rounded-full animate-ping opacity-75"></div>
          <div className="relative bg-royal-purple/50 p-6 rounded-full shadow-xl border border-lavender/30">
            <Loader2 className="animate-spin text-lavender" size={48} />
          </div>
        </div>
        
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-white">Verifying Identity</h2>
          <p className="text-white/70 text-sm">
            AI is analyzing your documents...<br/>
            <span className="text-xs text-white/50">(Checking Face Match, OCR, and Liveness)</span>
          </p>
        </div>
      </div>
    );
  }

  // --- 2. ERROR UI (Network/Server Crash) ---
  if (status === 'ERROR' && !result?.final_decision) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6">
        <div className="p-4 bg-red-500/20 text-red-400 rounded-full mb-4">
          <XCircle size={48} />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
        <p className="text-white/70 max-w-xs mb-6">
          {result?.error || result?.details || "We couldn't connect to the verification server."}
        </p>
        <button 
          onClick={handleRetry}
          className="px-6 py-2 bg-lavender text-deep-violet rounded-lg hover:bg-opacity-80 transition-colors"
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
      color: 'text-green-400',
      bg: 'bg-green-500/10',
      border: 'border-green-500/20',
      icon: <CheckCircle size={64} className="text-green-400" />,
      text: 'Verification Successful'
    },
    REVIEW: {
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/20',
      icon: <AlertTriangle size={64} className="text-yellow-400" />,
      text: 'Manual Review Required'
    },
    REJECTED: {
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      icon: <XCircle size={64} className="text-red-400" />,
      text: 'Verification Failed'
    }
  };

  const ui = statusConfig[decision as keyof typeof statusConfig] || statusConfig.REJECTED;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      
      {/* Main Status Card */}
      <div className={cn("text-center p-8 rounded-3xl border-2 flex flex-col items-center shadow-sm", ui.bg, ui.border)}>
        <div className="mb-4 bg-white/10 p-4 rounded-full shadow-sm">
          {ui.icon}
        </div>
        <h2 className={cn("text-3xl font-bold mb-2", ui.color)}>{decision}</h2>
        <p className="text-white/80 font-medium">{ui.text}</p>
        
        <div className="mt-4 px-4 py-1 bg-white/10 rounded-full border border-white/20 text-sm font-mono text-white/80">
            Trust Score: <span className="font-bold text-white">{result?.score?.toFixed(1) || 0}/100</span>
        </div>
      </div>

      {/* Failure Reasons (Only show if Rejected/Review) */}
      {(isRejected || isReview) && result?.reason && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5">
            <h3 className="text-red-300 font-semibold mb-2 flex items-center gap-2">
                <AlertTriangle size={16} /> Issues Found:
            </h3>
            <ul className="space-y-2">
                <li className="text-sm text-red-300 flex items-start gap-2">
                    <span className="mt-1.5 w-1.5 h-1.5 bg-red-400 rounded-full flex-shrink-0" />
                    {result.reason}
                </li>
            </ul>
        </div>
      )}



      {/* Action Button */}
      <button 
        onClick={handleRetry}
        className="w-full py-4 bg-lavender hover:bg-opacity-80 text-deep-violet rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl active:scale-95"
      >
        <RefreshCcw size={18} />
        {isApproved ? 'Verify Another User' : 'Try Again'}
      </button>

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
                <span className="text-white/70 font-medium">{label}</span>
                <span className="font-mono font-bold text-white">{score.toFixed(1)} <span className="text-white/50 font-normal">/ {max}</span></span>
            </div>
            <div className="h-2.5 bg-deep-violet rounded-full overflow-hidden">
                <div 
                    className={cn("h-full rounded-full transition-all duration-1000 ease-out", colorClass)} 
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}