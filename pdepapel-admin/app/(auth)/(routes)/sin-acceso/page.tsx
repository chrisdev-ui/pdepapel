import { SignOutButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { ExternalLink, ShieldOff } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { hasAdminAccess } from "@/lib/admin-access";
import { env } from "@/lib/env.mjs";

export const metadata: Metadata = {
  title: "Sin acceso",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Signed-in account that does not own a store and is not allowlisted: a shop
 * customer who reached the panel's domain. Never show the store creator here.
 */
export default async function NoAccessPage() {
  const user = await currentUser();
  if (!user) redirect("/iniciar-sesion");
  if (await hasAdminAccess(user.id)) redirect("/");

  const email = user.primaryEmailAddress?.emailAddress;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <section className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border bg-white p-8 text-center shadow-sm">
        <span
          aria-hidden="true"
          className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-tint-cream text-primary"
        >
          <ShieldOff className="h-6 w-6" />
        </span>
        <h1 className="text-2xl font-semibold text-foreground">Esta cuenta no tiene acceso al panel</h1>
        <p className="text-sm text-muted-foreground">
          {email ? (
            <>
              Iniciaste sesión como <strong className="text-foreground">{email}</strong>. El panel es
              solo para el equipo de la tienda; tu cuenta de cliente sigue funcionando en la tienda en línea.
            </>
          ) : (
            "El panel es solo para el equipo de la tienda; tu cuenta de cliente sigue funcionando en la tienda en línea."
          )}
        </p>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild variant="outline">
            <a href={env.FRONTEND_STORE_URL}>
              <ExternalLink aria-hidden="true" className="mr-2 h-4 w-4" />
              Ir a la tienda
            </a>
          </Button>
          <SignOutButton redirectUrl="/iniciar-sesion">
            <Button type="button">Cerrar sesión</Button>
          </SignOutButton>
        </div>
        <p className="text-xs text-muted-foreground">
          Si eres parte del equipo, pide al dueño de la tienda que agregue tu usuario.
        </p>
      </section>
    </div>
  );
}
