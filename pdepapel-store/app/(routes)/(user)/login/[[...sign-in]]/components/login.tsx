"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowBigLeftDashIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { SignIn } from "@clerk/nextjs";

export function Login() {
  const [isMounted, setIsMounted] = useState(false);
  const [open, setOpen] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect_url");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  const handleCloseModal = () => {
    router.push(redirectUrl || "/");
    setOpen(false);
  };

  const handleGoBack = () => {
    router.push("/");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleCloseModal}>
      <DialogPortal>
        <DialogOverlay>
          <DialogPrimitive.Content className="relative flex h-full w-full items-center justify-center">
            <SignIn
              afterSignInUrl={redirectUrl || "/"}
              afterSignUpUrl={redirectUrl || "/"}
              appearance={{
                elements: {
                  headerSubtitle: "hidden",
                  logoBox: "flex items-center mx-auto w-32",
                  headerTitle:
                    "font-serif text-2xl font-bold text-blue-yankees",
                  card: "bg-gradient-to-r from-pink-shell via-transparent to-pink-froly",
                  formFieldLabel: "text-blue-yankees",
                  formButtonPrimary:
                    "bg-blue-yankees text-white font-semibold hover:opacity-75",
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
