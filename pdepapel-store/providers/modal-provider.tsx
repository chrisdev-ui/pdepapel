"use client";

import { usePresaleCartConflict } from "@/hooks/use-presale-cart-conflict";
import { usePreviewModal } from "@/hooks/use-preview-modal";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const PreviewModal = dynamic(
  () =>
    import("@/components/preview-modal").then((module) => module.PreviewModal),
  { ssr: false },
);

const PresaleCartConflictDialog = dynamic(
  () =>
    import("@/components/presale-cart-conflict-dialog").then(
      (module) => module.PresaleCartConflictDialog,
    ),
  { ssr: false },
);

export const ModalProvider: React.FC<{}> = () => {
  const [isMounted, setIsMounted] = useState(false);
  const isPreviewOpen = usePreviewModal((state) => state.isOpen);
  const hasPresaleConflict = usePresaleCartConflict((state) => state.pending !== null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <>
      {isPreviewOpen ? <PreviewModal /> : null}
      {hasPresaleConflict ? <PresaleCartConflictDialog /> : null}
    </>
  );
};
