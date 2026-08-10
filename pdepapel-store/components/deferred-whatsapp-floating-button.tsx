"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const WhatsAppFloatingButton = dynamic(
  () =>
    import("@/components/whatsapp-floating-button").then(
      (module) => module.WhatsAppFloatingButton,
    ),
  { ssr: false },
);

export function DeferredWhatsAppFloatingButton() {
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const load = () => setShouldLoad(true);

    if (typeof window.requestIdleCallback === "function") {
      const idleCallbackId = window.requestIdleCallback(load, {
        timeout: 1500,
      });

      return () => window.cancelIdleCallback(idleCallbackId);
    }

    const timeoutId = globalThis.setTimeout(load, 1000);

    return () => globalThis.clearTimeout(timeoutId);
  }, []);

  return shouldLoad ? <WhatsAppFloatingButton /> : null;
}
