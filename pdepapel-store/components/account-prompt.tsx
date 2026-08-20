"use client";

import { SignedOut } from "@clerk/nextjs";
import { ArrowRight, LogIn, MapPinned, UserPlus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import { accountAccessPath, STOREFRONT_ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

type AccountPromptSource = "cart_drawer" | "cart_page" | "checkout";

interface AccountPromptProps {
  redirectPath: string;
  source: AccountPromptSource;
  variant?: "compact" | "standard";
  className?: string;
}

export function AccountPrompt({
  redirectPath,
  source,
  variant = "standard",
  className,
}: AccountPromptProps) {
  const isCompact = variant === "compact";
  const signUpHref = accountAccessPath(STOREFRONT_ROUTES.signUp, redirectPath);
  const signInHref = accountAccessPath(STOREFRONT_ROUTES.signIn, redirectPath);

  return (
    <SignedOut>
      <aside
        aria-label="Opciones para crear cuenta o iniciar sesión"
        className={cn(
          "rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50 to-pink-50 text-blue-yankees",
          isCompact ? "p-3" : "p-4 sm:p-5",
          className,
        )}
      >
        <div className={cn("flex gap-3", isCompact && "items-start")}>
          <UserPlus
            aria-hidden="true"
            className={cn(
              "shrink-0 text-purple-600",
              isCompact ? "mt-0.5 h-5 w-5" : "mt-0.5 h-6 w-6",
            )}
          />
          <div className="min-w-0">
            <p className={cn("font-semibold", !isCompact && "text-lg")}>
              {isCompact
                ? "¿Quieres volver a comprar más fácil?"
                : "Guarda favoritos, pedidos y tus direcciones"}
            </p>
            <p
              className={cn(
                "mt-1 text-muted-foreground",
                isCompact ? "text-xs leading-5" : "text-sm leading-6",
              )}
            >
              Crea una cuenta gratis en segundos con Google o con tu correo
              para conservar tus favoritos y consultar tus pedidos. Cuando
              guardes una dirección durante tu compra, podrás elegirla en
              pedidos futuros. Puedes seguir comprando como invitado cuando
              prefieras.
            </p>
            {!isCompact && (
              <p className="mt-3 flex items-start gap-2 text-sm font-medium text-blue-yankees">
                <MapPinned
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0 text-purple-600"
                />
                Tu dirección se guarda solo si tú lo decides durante el
                checkout.
              </p>
            )}
            <div
              className={cn(
                "mt-3 flex flex-wrap items-center gap-x-3 gap-y-2",
                isCompact && "mt-2",
              )}
            >
              <Button asChild size={isCompact ? "sm" : "default"}>
                <Link
                  href={signUpHref}
                  onClick={() =>
                    trackCustomerEvent("account_registration_cta_clicked", {
                      source,
                    })
                  }
                >
                  Crear cuenta gratis
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <Link
                href={signInHref}
                className="inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-4 transition-colors hover:text-purple-700"
                onClick={() =>
                  trackCustomerEvent("account_sign_in_cta_clicked", { source })
                }
              >
                <LogIn className="h-4 w-4" />
                Iniciar sesión
              </Link>
            </div>
          </div>
        </div>
      </aside>
    </SignedOut>
  );
}
