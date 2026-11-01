"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { trackGoogleEvent } from "@/lib/customer-analytics";

export interface CampaignPromotion {
  promotion_id: string;
  promotion_name: string;
  creative_slot: string;
  items?: { item_id: string; item_name: string; price: number }[];
}

/**
 * GA4 `view_promotion` (una vez, cuando la mitad del banner se ve) y
 * `select_promotion` (al tocar un enlace). `trackGoogleEvent` ya respeta el
 * consentimiento: sin él no sale nada.
 */
export function CampaignPromotionTracking({ promotion, children }: { promotion: CampaignPromotion; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (seen.current || !entries.some((entry) => entry.isIntersecting)) return;
        seen.current = true;
        trackGoogleEvent("view_promotion", { ...promotion });
        observer.disconnect();
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [promotion]);

  return (
    <div
      ref={ref}
      onClickCapture={(event) => {
        if ((event.target as HTMLElement).closest("a")) trackGoogleEvent("select_promotion", { ...promotion });
      }}
    >
      {children}
    </div>
  );
}
