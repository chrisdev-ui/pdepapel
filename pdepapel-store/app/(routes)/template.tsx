"use client";

import { WhatsAppFloatingButton } from "@/components/whatsapp-floating-button";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div>
      {children}
      <WhatsAppFloatingButton />
    </div>
  );
}
