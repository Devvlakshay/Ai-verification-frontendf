// src/components/VerificationStore.ts
import { useState, useEffect } from 'react';
import { saveToDB, getFromDB, clearDB } from '@/lib/db';

export type VerificationData = {
  user_id: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other';
  selfie_photo: string | null;
  passport_first: string | null;
  passport_old: string | null;
};

const INITIAL_STATE: VerificationData = {
  user_id: '',
  dob: '',
  gender: 'Male',
  selfie_photo: null,
  passport_first: null,
  passport_old: null,
};

export const useVerificationStore = () => {
  const [data, setData] = useState<VerificationData>(INITIAL_STATE);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from IndexedDB on mount
  useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      try {
        const saved = await getFromDB('user_data');
        if (saved && mounted) {
          setData(saved);
        }
      } catch (err) {
        console.error("Failed to load from DB", err);
      } finally {
        if (mounted) setIsLoaded(true);
      }
    };
    loadData();
    return () => { mounted = false; };
  }, []);

  // Save to IndexedDB whenever data changes
  useEffect(() => {
    if (isLoaded) {
      // Debounce saving to prevent freezing UI on every keystroke
      const timeoutId = setTimeout(() => {
        saveToDB('user_data', data).catch(console.error);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [data, isLoaded]);

  const updateField = (field: keyof VerificationData, value: any) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  const resetStore = async () => {
    setData(INITIAL_STATE);
    await clearDB();
  };

  return { data, updateField, resetStore, isLoaded };
};