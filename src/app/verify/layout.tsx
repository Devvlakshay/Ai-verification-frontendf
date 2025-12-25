'use client';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const STEPS = [
  { path: '/verify/details', label: 'Details' },
  { path: '/verify/selfie', label: 'Selfie' },
  { path: '/verify/front', label: 'Front' },
  { path: '/verify/back', label: 'Back' },
  { path: '/verify/result', label: 'Result' },
];

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const currentStepIndex = STEPS.findIndex(s => pathname.includes(s.path));

  return (
    <div className="min-h-screen bg-deep-violet text-white flex flex-col">
      <div className="bg-deep-violet shadow-sm border-b border-royal-purple/50 p-4">
        <div className="max-w-xl mx-auto">
          <h1 className="text-xl font-bold text-white mb-4">AI Verification</h1>
          
          {/* Progress Bar */}
          <div className="flex justify-between items-center relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-royal-purple/30 -z-10" />
            <div 
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-lavender -z-10 transition-all duration-500"
              style={{ width: `${(currentStepIndex / (STEPS.length - 1)) * 100}%` }}
            />
            
            {STEPS.map((step, idx) => {
              const isActive = idx <= currentStepIndex;
              return (
                <div key={step.path} className="flex flex-col items-center bg-deep-violet px-2">
                  <div className={cn(
                    "w-3 h-3 rounded-full transition-colors duration-300",
                    isActive ? "bg-lavender scale-125" : "bg-royal-purple"
                  )} />
                  <span className={cn(
                    "text-xs mt-1 font-medium",
                    isActive ? "text-lavender" : "text-white/50"
                  )}>{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      <main className="flex-1 max-w-xl w-full mx-auto p-4">
        {children}
      </main>
    </div>
  );
}