import { useState, useEffect, useCallback } from 'react';
import { saveToDB, getFromDB, clearDB } from '@/lib/db';

export type VerificationData = {
  user_id: string;
  name: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other';
  selfie_photo: string | null;
  passport_first: string | null;
  passport_old: string | null;
  // ONNX detection results
  front_detection: object | null;
  back_detection: object | null;
  // Verification status
  verification_status: 'pending' | 'approved' | 'rejected' | 'pending_review';
};

const INITIAL_STATE: VerificationData = {
  user_id: '',
  name: '',
  dob: '',
  gender: 'Male',
  selfie_photo: null,
  passport_first: null,
  passport_old: null,
  front_detection: null,
  back_detection: null,
  verification_status: 'pending',
};

export const useVerificationStore = () => {
  const [data, setData] = useState<VerificationData>(INITIAL_STATE);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from IndexedDB
  useEffect(() => {
    const load = async () => {
        const saved = await getFromDB('user_data');
        if (saved) setData(saved);
        setIsLoaded(true);
    };
    load();
  }, []);

  // Save to IndexedDB (Debounced)
  useEffect(() => {
    if (isLoaded) {
      const timer = setTimeout(() => {
        saveToDB('user_data', data);
        console.log('💾 Saved to IndexedDB:', { 
          selfie: !!data.selfie_photo, 
          front: !!data.passport_first, 
          back: !!data.passport_old 
        });
      }, 100); // Reduced from 500ms to 100ms for faster save
      return () => clearTimeout(timer);
    }
  }, [data, isLoaded]);

  const updateField = useCallback((field: keyof VerificationData, value: any) => {
    setData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const resetStore = async () => {
    setData(INITIAL_STATE);
    await clearDB();
  };

  const clearImages = () => {
    setData((prev) => ({
      ...prev,
      selfie_photo: null,
      passport_first: null,
      passport_old: null,
      front_detection: null,
      back_detection: null,
    }));
  };

  return { 
    data, 
    updateField, 
    resetStore, 
    clearImages, 
    isLoaded,
  };
};