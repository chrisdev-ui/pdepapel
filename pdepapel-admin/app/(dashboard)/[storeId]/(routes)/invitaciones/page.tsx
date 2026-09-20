import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { isAllowlistedOwner } from "@/lib/admin-access";
import { listPendingInvitations, ownedStores } from "@/lib/invitations";

import { InvitationsClient } from "./components/client";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Invitaciones | PdePapel Admin",
  description: "Invitar cuentas de solo lectura al panel",
  robots: { index: false, follow: false },
};

/**
 * Invitar cuentas de solo lectura. Solo para quien está en
 * `ADMIN_ALLOWED_USER_IDS`: cualquier otra sesión, incluida una dueña que no
 * esté en esa lista, sale de aquí.
 *
 * Sale a la raíz, no a «sin acceso»: la raíz ya sabe llevar a cada sesión a
 * donde le toca (su tienda, la tienda permitida de una cuenta de solo
 * lectura, o «sin acceso» si de verdad no tiene nada). Mandar aquí a
 * «sin acceso» encadenaba dos redirecciones —y esa cadena reventaba con un
 * 500 al navegar dentro del panel, sin recargar la página.
 */
export default async function InvitationsPage({ params }: { params: { storeId: string } }) {
  const { userId } = await auth();
  if (!userId) redirect("/iniciar-sesion");
  if (!isAllowlistedOwner(userId)) redirect("/");

  const stores = await ownedStores(userId);
  if (!stores.some((store) => store.id === params.storeId)) redirect("/");

  const invitations = await listPendingInvitations(userId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <InvitationsClient storeId={params.storeId} stores={stores} invitations={invitations} />
      </div>
    </div>
  );
}
