import type { ReactNode } from "react";

import { CartReminderStrip } from "@/components/cart-reminder-strip";
import { DeferredWhatsAppFloatingButton } from "@/components/deferred-whatsapp-floating-button";
import { MobileCartBar } from "@/components/mobile-cart-bar";
import { UnavailableProductNotice } from "@/components/unavailable-product-notice";

/** Lo que acompaña a cada página de la tienda dentro de <main>. */
export function StorefrontExtras({ children }: { children: ReactNode }) {
  // Block wrapper that grows inside <main>: pages keep normal document flow
  // (centered containers stay full width) while the footer stays below the
  // fold on short pages and loading states.
  return (
    <div className="flex-1">
      <CartReminderStrip />
      {children}
      <MobileCartBar />
      <DeferredWhatsAppFloatingButton />
      <UnavailableProductNotice />
    </div>
  );
}
