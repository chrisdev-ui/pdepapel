"use client";

import { useEffect } from "react";

import { useStoreModal } from "@/hooks/use-store-modal";

/** Abre el creador de tiendas al entrar, para quien está autorizado a crearlas. */
export function OpenStoreCreator() {
  const onOpen = useStoreModal((state) => state.onOpen);
  const isOpen = useStoreModal((state) => state.isOpen);

  useEffect(() => {
    if (!isOpen) {
      onOpen();
    }
  }, [isOpen, onOpen]);

  return null;
}
