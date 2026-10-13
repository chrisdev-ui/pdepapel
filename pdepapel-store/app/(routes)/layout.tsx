import { ReactNode } from "react";

import { HeadlessClerkGuard } from "@/components/account/headless-clerk-guard";
import { StorefrontExtras } from "@/components/storefront-extras";
import { StorefrontShell } from "@/components/storefront-shell";

export default function StorefrontLayout({ children }: { children: ReactNode }) {
  return (
    <StorefrontShell clerkVariant="headless">
      <HeadlessClerkGuard />
      <StorefrontExtras>{children}</StorefrontExtras>
    </StorefrontShell>
  );
}
