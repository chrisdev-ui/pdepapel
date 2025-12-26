"use client";

import { useStoreSettings } from "@/hooks/use-store-settings";
import { useEffect } from "react";

interface StoreInitializerProps {
  logoUrl: string | null;
}

export const StoreInitializer: React.FC<StoreInitializerProps> = ({
  logoUrl,
}) => {
  const { setLogoUrl } = useStoreSettings();

  useEffect(() => {
    setLogoUrl(logoUrl);
  }, [logoUrl, setLogoUrl]);

  return null;
};
