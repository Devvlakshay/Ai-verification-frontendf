'use client';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-deep-violet text-white flex flex-col">
      <main className="flex-1 w-full mx-auto">
        {children}
      </main>
    </div>
  );
}