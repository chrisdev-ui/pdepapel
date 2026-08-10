"use client";

import { usePreviewModal } from "@/hooks/use-preview-modal";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const PreviewModal = dynamic(
  () =>
    import("@/components/preview-modal").then((module) => module.PreviewModal),
  { ssr: false },
);

export const ModalProvider: React.FC<{}> = () => {
  const [isMounted, setIsMounted] = useState(false);
  const isPreviewOpen = usePreviewModal((state) => state.isOpen);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted || !isPreviewOpen) {
    return null;
  }

  return <PreviewModal />;
};
