import { DeferredWhatsAppFloatingButton } from "@/components/deferred-whatsapp-floating-button";
import { ReactNode } from "react";

export default function StorefrontLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Block wrapper that grows inside <main>: pages keep normal document flow
  // (centered containers stay full width) while the footer stays below the
  // fold on short pages and loading states.
  return (
    <div className="flex-1">
      {children}
      <DeferredWhatsAppFloatingButton />
    </div>
  );
}
