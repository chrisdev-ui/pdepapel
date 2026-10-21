import Link from "next/link";

import { STOREFRONT_ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

const linkClassName = "font-semibold text-blue-yankees underline underline-offset-4";

/**
 * La autorización de Ley 1581 y la aceptación de los términos antes de la
 * acción que entrega los datos (pagar, crear la cuenta). Los enlaces abren en
 * otra pestaña para no perder lo que ya se llenó.
 */
export function LegalConsent({ action, className }: { action: "checkout" | "signUp"; className?: string }) {
  return (
    <p className={cn("text-xs leading-relaxed text-muted-foreground", className)} data-testid="legal-consent">
      {action === "checkout" ? "Al finalizar tu compra" : "Al crear tu cuenta"} aceptas los{" "}
      <Link href={STOREFRONT_ROUTES.termsPolicy} target="_blank" rel="noopener noreferrer" className={linkClassName}>
        Términos y condiciones
      </Link>{" "}
      y autorizas el tratamiento de tus datos según la{" "}
      <Link href={STOREFRONT_ROUTES.dataPolicy} target="_blank" rel="noopener noreferrer" className={linkClassName}>
        Política de privacidad
      </Link>
      .
    </p>
  );
}
