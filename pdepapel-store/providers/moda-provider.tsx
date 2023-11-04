"use client";

import { CheckoutModal } from "@/components/checkout-modal";
import { PreviewModal } from "@/components/preview-modal";
import { useEffect, useState } from "react";

export const ModalProvider: React.FC<{}> = () => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <>
      <CheckoutModal />
      <PreviewModal />
    </>
  );
};
