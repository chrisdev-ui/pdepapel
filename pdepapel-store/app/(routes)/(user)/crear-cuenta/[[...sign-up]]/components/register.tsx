"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowBigLeftDashIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { getSafeStorefrontRedirectPath, STOREFRONT_ROUTES } from "@/lib/routes";
import { SignUp, useAuth } from "@clerk/nextjs";

export function Register() {
  const [isMounted, setIsMounted] = useState(false);
  const [open, setOpen] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();

  const redirectUrl = useMemo(() => {
    return getSafeStorefrontRedirectPath(searchParams.get("redirect_url"));
  }, [searchParams]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace(redirectUrl);
    }
  }, [isLoaded, isSignedIn, redirectUrl, router]);

  if (!isMounted || (isLoaded && isSignedIn)) {
    return null;
  }

  const handleCloseModal = () => {
    router.push(redirectUrl);
    setOpen(false);
  };

  const handleGoBack = () => {
    router.push(STOREFRONT_ROUTES.home);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleCloseModal}>
      <DialogPortal>
        <DialogOverlay>
          <DialogPrimitive.Content className="relative flex h-full w-full min-w-0 items-center justify-center">
            <DialogPrimitive.Title className="sr-only">
              Crear cuenta
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Crea una cuenta para consultar tus pedidos y comprar más rápido.
            </DialogPrimitive.Description>
            <SignUp
              path={STOREFRONT_ROUTES.signUp}
              routing="path"
              signInUrl={STOREFRONT_ROUTES.signIn}
              afterSignUpUrl={redirectUrl}
              afterSignInUrl={redirectUrl}
              appearance={{
                layout: {
                  socialButtonsVariant: "blockButton",
                  socialButtonsPlacement: "top",
                },
                elements: {
                  headerSubtitle:
                    "text-center text-sm font-medium text-muted-foreground",
                  logoBox: "flex items-center mx-auto w-32",
                  headerTitle:
                    "font-serif text-2xl font-bold text-blue-yankees",
                  card: "bg-gradient-to-r from-pink-shell via-transparent to-pink-froly",
                  formFieldLabel: "text-blue-yankees",
                  formButtonPrimary:
                    "bg-blue-yankees text-white font-semibold hover:opacity-75",
                  socialButtons:
                    "mb-5 flex flex-col gap-3 [&_button]:w-full",
                  socialButtonsBlockButton:
                    "min-h-12 border-2 border-purple-200 bg-white font-semibold text-blue-yankees shadow-sm transition hover:border-purple-400 hover:bg-purple-50",
                  socialButtonsBlockButtonText: "font-semibold",
                  socialButtonsProviderIcon: "h-5 w-5",
                },
              }}
            />
            <div className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
              <Button
                className="flex items-center gap-2 bg-blue-yankees p-8"
                onClick={handleGoBack}
              >
                <ArrowBigLeftDashIcon className="h-6 w-6" />
                Volver al sitio
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
