import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { ClerkMountGate } from "@/components/auth/clerk-mount-gate";
import { adminClerkAppearance } from "@/lib/clerk-appearance";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  robots: { index: false, follow: false },
};

/**
 * There is no sign-up page on the panel: the Clerk instance is shared with
 * the storefront, so accounts are created there and access is granted by
 * owning a store or by the allowlist (see lib/admin-access.ts).
 */
export default function SignInPage() {
  return (
    <AuthPageShell
      title="Entrar al panel"
      description="Usa la cuenta con la que administras la tienda."
    >
      <ClerkMountGate>
        <SignIn
          path="/iniciar-sesion"
          routing="path"
          fallbackRedirectUrl="/"
          appearance={adminClerkAppearance}
        />
      </ClerkMountGate>
    </AuthPageShell>
  );
}
