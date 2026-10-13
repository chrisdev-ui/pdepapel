"use client";

import { SignIn, useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { ClerkMountGate } from "@/components/auth/clerk-mount-gate";
import { storefrontClerkAppearance } from "@/lib/clerk-appearance";
import {
  accountAccessPath,
  getSafeStorefrontRedirectPath,
  STOREFRONT_ROUTES,
} from "@/lib/routes";

export function Login() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();

  // Only a relative storefront path survives; anything else falls back to home.
  const redirectUrl = useMemo(
    () => getSafeStorefrontRedirectPath(searchParams.get("redirect_url")),
    [searchParams],
  );

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace(redirectUrl);
    }
  }, [isLoaded, isSignedIn, redirectUrl, router]);

  if (isLoaded && isSignedIn) {
    return null;
  }

  return (
    <AuthPageShell
      title="Bienvenida de nuevo"
      description="Entra para ver tus pedidos, guías y direcciones."
      backHref={redirectUrl}
    >
      <ClerkMountGate>
        <SignIn
          path={STOREFRONT_ROUTES.signIn}
          routing="path"
          signUpUrl={accountAccessPath(STOREFRONT_ROUTES.signUp, redirectUrl)}
          forceRedirectUrl={redirectUrl}
          signUpForceRedirectUrl={redirectUrl}
          appearance={storefrontClerkAppearance}
        />
      </ClerkMountGate>
    </AuthPageShell>
  );
}
