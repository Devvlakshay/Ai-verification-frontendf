'use client';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen min-h-dvh bg-deep-violet text-white flex flex-col">
      {/* Responsive container with max-width for larger screens */}
      <main className="flex-1 w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}