"use client";

import { useVerificationStore } from "./VerificationStore";
import { useEffect } from "react";
import { unloadAadhaarModel } from "@/lib/aadhaar-model-manager";

export function StoreResetter() {
  const { resetStore } = useVerificationStore();

  useEffect(() => {
    resetStore();
    // Also unload the ML model to free memory
    unloadAadhaarModel();
  }, [resetStore]);

  return null;
}

/**
 * Component to clean up ML models when leaving verification flow
 * Use this on pages outside the verification flow (e.g., home page, result page)
 */
export function MemoryCleanup() {
  useEffect(() => {
    // Unload models when this component mounts (leaving verification flow)
    return () => {
      unloadAadhaarModel();
    };
  }, []);

  return null;
}