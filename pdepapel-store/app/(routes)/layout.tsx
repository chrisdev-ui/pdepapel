import { WhatsAppFloatingButton } from "@/components/whatsapp-floating-button";
import { ReactNode } from "react";

export default function StorefrontLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div>
      {children}
      <WhatsAppFloatingButton />
    </div>
  );
}
