import { useState, useEffect } from 'react';
import { saveToDB, getFromDB, clearDB } from '@/lib/db';

export type VerificationData = {
  user_id: string;
  name: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other';
  selfie_photo: string | null;
  passport_first: string | null;
  passport_old: string | null;
};

const INITIAL_STATE: VerificationData = {
  user_id: '',
  name: '',
  dob: '',
  gender: 'Male',
  selfie_photo: null,
  passport_first: null,
  passport_old: null,
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
      }, 500); 
      return () => clearTimeout(timer);
    }
  }, [data, isLoaded]);

  const updateField = (field: keyof VerificationData, value: any) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

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
    }));
  };

  return { data, updateField, resetStore, clearImages, isLoaded };
};