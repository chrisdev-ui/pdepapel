import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { ClerkMountGate } from "@/components/auth/clerk-mount-gate";
import { adminClerkAppearance } from "@/lib/clerk-appearance";
import { hasUsableTicket } from "@/lib/invitation-ticket";

export const metadata: Metadata = {
  title: "Aceptar invitación",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Aceptar una invitación al panel.
 *
 * La instancia de Clerk es la misma de la tienda y su registro es público, así
 * que esta ruta **no** puede ser un registro abierto en el dominio del panel:
 * sin un billete de invitación con forma válida y sin caducar, no se muestra
 * nada y la visita sale a iniciar sesión. Con billete, se registra aquí mismo
 * y nunca pasa por la página de registro de la tienda.
 */
export default function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: { __clerk_ticket?: string };
}) {
  if (!hasUsableTicket(searchParams?.__clerk_ticket)) {
    redirect("/iniciar-sesion");
  }

  return (
    <AuthPageShell
      title="Aceptar la invitación"
      description="Crea tu cuenta con este enlace y entrarás al panel con permiso de solo lectura."
    >
      <ClerkMountGate>
        <SignUp
          path="/aceptar-invitacion"
          routing="path"
          signInUrl="/iniciar-sesion"
          fallbackRedirectUrl="/"
          appearance={adminClerkAppearance}
        />
      </ClerkMountGate>
    </AuthPageShell>
  );
}
