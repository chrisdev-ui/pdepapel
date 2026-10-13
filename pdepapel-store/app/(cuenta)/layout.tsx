import { ReactNode } from "react";

import { FullClerkGuard } from "@/components/account/full-clerk-guard";
import { StorefrontExtras } from "@/components/storefront-extras";
import { StorefrontShell } from "@/components/storefront-shell";

/** Iniciar sesión, crear cuenta y Mi cuenta: Clerk completo (sus componentes de interfaz). */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <StorefrontShell clerkVariant="full">
      <FullClerkGuard />
      <StorefrontExtras>{children}</StorefrontExtras>
    </StorefrontShell>
  );
}
