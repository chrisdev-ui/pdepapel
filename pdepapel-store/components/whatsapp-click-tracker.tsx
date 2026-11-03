"use client";

import { useEffect, useRef } from "react";

import { useStorefrontPathname } from "@/hooks/use-storefront-pathname";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import { whatsAppClickEvent } from "@/lib/whatsapp-click-tracking";

/** Sends `whatsapp_click` for any WhatsApp link (see lib/whatsapp-click-tracking.ts). Renders nothing. */
export function WhatsAppClickTracker() {
  const pathname = useStorefrontPathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const params = whatsAppClickEvent(event.target, pathRef.current);
      if (params) trackCustomerEvent("whatsapp_click", params);
    };
    // Capture: the link opens a new tab, and a component may stop propagation.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
