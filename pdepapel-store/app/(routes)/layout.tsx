import { DeferredWhatsAppFloatingButton } from "@/components/deferred-whatsapp-floating-button";
import { ReactNode } from "react";

export default function StorefrontLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div>
      {children}
      <DeferredWhatsAppFloatingButton />
    </div>
  );
}
