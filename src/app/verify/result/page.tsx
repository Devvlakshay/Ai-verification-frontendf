'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useVerificationStore } from '@/components/VerificationStore';
import { CheckCircle, XCircle, AlertTriangle, Loader2, RefreshCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ResultPage() {
  const router = useRouter();
  const { data, resetStore } = useVerificationStore();
  const [status, setStatus] = useState<'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [result, setResult] = useState<any>(null);
  // To prevent double submission in React Strict Mode
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;

    if (status === 'IDLE') {
      if (!data.selfie_photo || !data.passport_first) {
        // Data missing, redirect to start
        router.push('/verify/details');
        return;
      }
      processedRef.current = true;
      submitData();
    }
  }, [data]);

  const submitData = async () => {
    setStatus('LOADING');
    try {
      const res = await fetch('/api/submit-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      const json = await res.json();
      
      if (res.ok) {
        setResult(json);
        setStatus('SUCCESS');
      } else {
        console.error(json);
        setResult(json); // Even errors might have details
        setStatus('ERROR');
      }
    } catch (error) {
      console.error(error);
      setStatus('ERROR');
    }
  };

  const handleRetry = () => {
    resetStore();
    router.push('/verify/details');
  };

  if (status === 'LOADING' || status === 'IDLE') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <div className="relative">
          <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-75"></div>
          <div className="relative bg-white p-4 rounded-full shadow-lg">
            <Loader2 className="animate-spin text-blue-600" size={48} />
          </div>
        </div>
        <h2 className="text-xl font-bold text-gray-800">Verifying Identity</h2>
        <p className="text-gray-500 text-sm max-w-xs">
          Analyzing biometric data and validating documents. This may take a few seconds...
        </p>
      </div>
    );
  }

  // Determine visual state based on backend response
  const decision = result?.final_decision; // APPROVED, REJECTED, REVIEW
  const isApproved = decision === 'APPROVED';
  const isReview = decision === 'REVIEW';

  if (status === 'SUCCESS' && result) {
    return (
      <div className="space-y-6 animate-in zoom-in-95 duration-300">
        <div className={cn(
          "text-center p-8 rounded-2xl border-2 flex flex-col items-center",
          isApproved ? "border-green-100 bg-green-50" : 
          isReview ? "border-yellow-100 bg-yellow-50" : 
          "border-red-100 bg-red-50"
        )}>
          {isApproved ? <CheckCircle className="text-green-600 mb-3" size={64} /> : 
           isReview ? <AlertTriangle className="text-yellow-600 mb-3" size={64} /> :
           <XCircle className="text-red-600 mb-3" size={64} />}
          
          <h2 className={cn("text-3xl font-bold mb-1", 
            isApproved ? "text-green-700" : isReview ? "text-yellow-700" : "text-red-700"
          )}>{decision}</h2>
          
          <p className="text-gray-600 font-medium">Trust Score: <span className="text-black font-bold">{result.score}/100</span></p>
        </div>

        {/* Breakdown Card */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b">
                <h3 className="font-semibold text-gray-700">Verification Breakdown</h3>
            </div>
            <div className="p-4 space-y-3">
                <ScoreRow label="Face Similarity" score={result.breakdown?.face_score} max={40} />
                <ScoreRow label="Document Validity" score={result.breakdown?.aadhar_score} max={20} />
                <ScoreRow label="DOB Check" score={result.breakdown?.dob_score} max={20} />
                <ScoreRow label="Gender Match" score={result.breakdown?.gender_score} max={20} />
            </div>
        </div>

        {/* Rejection Reasons */}
        {result.rejection_reasons && result.rejection_reasons.length > 0 && (
           <div className="bg-red-50 p-4 rounded-xl border border-red-100">
              <h4 className="font-bold text-red-800 mb-2">Issues Found:</h4>
              <ul className="list-disc list-inside text-sm text-red-700">
                {result.rejection_reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
           </div>
        )}

        <button onClick={handleRetry} className="w-full py-4 text-gray-500 hover:text-black font-medium text-sm">
            Start New Verification
        </button>
      </div>
    );
  }

  return (
    <div className="text-center space-y-4 pt-10">
      <div className="inline-block p-4 bg-red-100 rounded-full text-red-600 mb-2">
        <XCircle size={48} />
      </div>
      <h2 className="text-xl font-bold">Verification Failed</h2>
      <p className="text-gray-600 max-w-xs mx-auto">
        {result?.error || "We couldn't process your request at this time."}
      </p>
      <button 
        onClick={handleRetry}
        className="mt-6 px-6 py-2 bg-gray-900 text-white rounded-lg flex items-center gap-2 mx-auto"
      >
        <RefreshCcw size={16} /> Try Again
      </button>
    </div>
  );
}

// Subcomponent for score rows
function ScoreRow({ label, score, max }: { label: string, score: number, max: number }) {
    const percentage = (score / max) * 100;
    const colorClass = percentage > 80 ? 'bg-green-500' : percentage > 40 ? 'bg-yellow-500' : 'bg-red-500';
    
    return (
        <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 w-1/3">{label}</span>
            <div className="flex-1 mx-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div 
                    className={cn("h-full rounded-full", colorClass)} 
                    style={{ width: `${percentage}%` }}
                />
            </div>
            <span className="font-mono font-medium text-gray-900 w-12 text-right">{score?.toFixed(1) || 0}</span>
        </div>
    );
}