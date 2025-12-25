'use client';
import { useRouter } from 'next/navigation';
import { useVerificationStore } from '@/components/VerificationStore';
import { ArrowRight } from 'lucide-react';

export default function DetailsPage() {
  const router = useRouter();
  const { data, updateField, isLoaded } = useVerificationStore();

  const handleNext = () => {
    if (!data.user_id || !data.dob) {
      alert("Please fill in all required fields.");
      return;
    }
    router.push('/verify/selfie');
  };

  if (!isLoaded) return null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">Your Details</h2>
        <p className="text-white/70 text-sm">Please provide your basic information.</p>
      </div>
      
      <div className="bg-royal-purple/30 p-6 rounded-xl shadow-sm border border-royal-purple/50 space-y-4">
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">User ID / Reference</label>
          <input 
            type="text" 
            value={data.user_id} 
            onChange={(e) => updateField('user_id', e.target.value)}
            className="w-full p-3 border border-lavender/30 bg-deep-violet rounded-lg focus:ring-2 focus:ring-lavender outline-none text-white"
            placeholder="e.g., USR-1001"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Date of Birth (DD-MM-YYYY)</label>
          <input 
            type="text" 
            value={data.dob} 
            onChange={(e) => updateField('dob', e.target.value)}
            className="w-full p-3 border border-lavender/30 bg-deep-violet rounded-lg focus:ring-2 focus:ring-lavender outline-none text-white"
            placeholder="15-08-1995"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Gender</label>
          <select 
            value={data.gender} 
            onChange={(e) => updateField('gender', e.target.value)}
            className="w-full p-3 border border-lavender/30 bg-deep-violet rounded-lg focus:ring-2 focus:ring-lavender outline-none text-white"
          >
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      <button 
        onClick={handleNext}
        className="w-full bg-lavender text-deep-violet py-3.5 rounded-xl font-semibold hover:bg-opacity-80 flex items-center justify-center gap-2"
      >
        Continue <ArrowRight size={18} />
      </button>
    </div>
  );
}