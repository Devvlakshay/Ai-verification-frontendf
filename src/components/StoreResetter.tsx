"use client";

import { useVerificationStore } from "./VerificationStore";
import { useEffect } from "react";

export function StoreResetter() {
  const { resetStore } = useVerificationStore();

  useEffect(() => {
    resetStore();
  }, [resetStore]);

  return null;
}
