"use client";

import { SignUp, useAuth } from "@clerk/nextjs";
import Link from "next/link";
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

export function Register() {
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
      title="Crea tu cuenta"
      description="Gratis y en un minuto. No te suscribe a ningún boletín."
      backHref={redirectUrl}
    >
      <ClerkMountGate>
        <SignUp
          path={STOREFRONT_ROUTES.signUp}
          routing="path"
          signInUrl={accountAccessPath(STOREFRONT_ROUTES.signIn, redirectUrl)}
          forceRedirectUrl={redirectUrl}
          signInForceRedirectUrl={redirectUrl}
          appearance={storefrontClerkAppearance}
        />
      </ClerkMountGate>
      <p className="text-center text-xs text-muted-foreground">
        Al crear la cuenta aceptas la{" "}
        <Link
          href={STOREFRONT_ROUTES.dataPolicy}
          className="font-semibold text-blue-yankees underline underline-offset-4"
        >
          política de tratamiento de datos
        </Link>
        .
      </p>
    </AuthPageShell>
  );
}
