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
  const { updateField } = useVerificationStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
      const decoded = decodeJwt(token);
      
      // Verify password field
      if (!decoded || decoded.password !== '123569') {
        setError('Invalid token or password. Access denied.');
        return;
      }
      
      // Check required fields
      if (decoded.user_id && decoded.name && decoded.dob && decoded.gender) {
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
  }, [router, updateField]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-deep-violet text-white p-6 text-center">
       <div
        className="absolute inset-0 z-0"
        style={{
          background: 'radial-gradient(circle at center, #3E1875 0%, #140030 70%)',
        }}
      />
      <div className="relative z-10 flex flex-col items-center">
        {error ? (
          <div className="bg-red-500/20 p-4 rounded-lg shadow-lg text-white">
            <h1 className="text-2xl font-bold">{error}</h1>
          </div>
        ) : (
          <div className="text-white/80">
            <h1 className="text-2xl font-bold">Verifying...</h1>
          </div>
        )}
      </div>
    </div>
  );
}
