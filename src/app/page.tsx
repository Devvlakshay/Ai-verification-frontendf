"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useVerificationStore } from '@/components/VerificationStore';

// Basic JWT decoding function
function decodeJwt(token: string) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("Failed to decode JWT:", error);
    return null;
  }
}

export default function Home() {
  const router = useRouter();
  const { data, updateField, clearImages, isLoaded } = useVerificationStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Wait for store to load before processing
    if (!isLoaded) return;
    
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
      const decoded = decodeJwt(token);
      
      // Verify password field
      if (!decoded || decoded.password !== process.env.NEXT_PUBLIC_JWT_PASSWORD) {
        setError('Invalid token or password. Access denied.');
        return;
      }
      
      // Check required fields
      if (decoded.user_id && decoded.name && decoded.dob && decoded.gender) {
        // Check if this is a different user - clear old images
        if (data.user_id && data.user_id !== decoded.user_id) {
          console.log(`🔄 New user detected (${decoded.user_id}), clearing old images from user ${data.user_id}`);
          clearImages();
        }
        
        updateField('user_id', decoded.user_id);
        updateField('name', decoded.name);
        updateField('dob', decoded.dob);
        updateField('gender', decoded.gender);

        // Save to session storage
        sessionStorage.setItem("verification_user", JSON.stringify(decoded));
        
        // Save to JSON file via API
        fetch('/api/save-jwt-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: decoded.user_id,
            name: decoded.name,
            dob: decoded.dob,
            gender: decoded.gender,
            timestamp: new Date().toISOString()
          })
        }).catch(err => console.error('Failed to save JWT data:', err));
        
        router.push('/verify/selfie');
      } else {
        setError('Invalid token. Missing required fields.');
      }
    } else {
      setError('Please open this link from the App');
    }
  }, [router, updateField, clearImages, data.user_id, isLoaded]);

  return (
    <div className="min-h-screen min-h-dvh flex flex-col items-center justify-center bg-deep-violet text-white p-4 sm:p-6 md:p-8 text-center">
       <div
        className="absolute inset-0 z-0"
        style={{
          background: 'radial-gradient(circle at center, #3E1875 0%, #140030 70%)',
        }}
      />
      <div className="relative z-10 flex flex-col items-center w-full max-w-sm sm:max-w-md md:max-w-lg px-4">
        {error ? (
          <div className="bg-red-500/20 p-4 sm:p-6 rounded-lg sm:rounded-xl shadow-lg text-white w-full">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold leading-tight">{error}</h1>
          </div>
        ) : (
          <div className="text-white/80">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">Verifying...</h1>
          </div>
        )}
      </div>
    </div>
  );
}
