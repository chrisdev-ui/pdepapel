import { auth, clerkClient } from "@clerk/nextjs/server";

import { isAllowlistedOwner } from "@/lib/admin-access";
import { ErrorFactory } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { parsePanelMetadata, requireStoreOwner, type StoreRole } from "@/lib/store-access";

/**
 * Invitaciones de solo lectura, respaldadas por Clerk (no hay tabla propia).
 *
 * El metadato público de la invitación pasa a la persona cuando acepta y se
 * registra, así que `requireStoreRead` la reconoce sin más cableado. Solo
 * invita quien está en `ADMIN_ALLOWED_USER_IDS`, y solo a tiendas suyas.
 */
export const INVITATION_ROLE: StoreRole = "viewer";

export interface PanelInvitation {
  id: string;
  emailAddress: string;
  status: string;
  createdAt: string;
  role: StoreRole | null;
  allowedStoreIds: string[];
  /** Nombres de las tiendas concedidas, para que la pantalla no muestre ids. */
  storeNames: string[];
  /** El metadato no tiene la forma esperada: la invitación no concedería nada. */
  malformed: boolean;
}

/** Quien invita: sesión, lista explícita del dueño y propiedad de la tienda. */
export async function requireInviter(storeId: string): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw ErrorFactory.Unauthenticated();
  if (!isAllowlistedOwner(userId)) throw ErrorFactory.Unauthorized();
  // Más estricto que el guardia de escritura: además de la lista explícita,
  // exige ser la dueña de esta tienda, con la misma comprobación de siempre.
  await requireStoreOwner(storeId);
  return userId;
}

/** Las tiendas de quien invita: nadie concede acceso a una tienda ajena. */
export async function ownedStores(userId: string) {
  return prismadb.store.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } });
}

function describe(invitation: { id: string; emailAddress: string; status: string; createdAt: number; publicMetadata: Record<string, unknown> | null }, names: Map<string, string>): PanelInvitation {
  const metadata = parsePanelMetadata(invitation.publicMetadata);
  return {
    id: invitation.id,
    emailAddress: invitation.emailAddress,
    status: invitation.status,
    createdAt: new Date(invitation.createdAt).toISOString(),
    role: metadata?.role ?? null,
    allowedStoreIds: metadata?.allowedStoreIds ?? [],
    storeNames: (metadata?.allowedStoreIds ?? []).map((id) => names.get(id) ?? id),
    malformed: metadata === null,
  };
}

/** Invitaciones pendientes de la instancia, con las tiendas que conceden. */
export async function listPendingInvitations(userId: string): Promise<PanelInvitation[]> {
  const client = await clerkClient();
  const [{ data }, stores] = await Promise.all([
    client.invitations.getInvitationList({ status: "pending", limit: 100 }),
    ownedStores(userId),
  ]);
  const names = new Map(stores.map((store) => [store.id, store.name]));
  return data.map((invitation) => describe(invitation as never, names));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Crea la invitación de solo lectura y la manda por correo. */
export async function createViewerInvitation(params: {
  userId: string;
  emailAddress: string;
  allowedStoreIds: string[];
}): Promise<PanelInvitation> {
  const emailAddress = params.emailAddress.trim().toLowerCase();
  if (!EMAIL.test(emailAddress)) {
    throw ErrorFactory.InvalidRequest("Escribe un correo válido para invitar");
  }
  const stores = await ownedStores(params.userId);
  const owned = new Set(stores.map((store) => store.id));
  const allowedStoreIds = Array.from(new Set(params.allowedStoreIds.map((id) => id.trim()).filter(Boolean)));
  if (allowedStoreIds.length === 0) {
    throw ErrorFactory.InvalidRequest("Elige al menos una tienda para conceder");
  }
  if (allowedStoreIds.some((id) => !owned.has(id))) {
    throw ErrorFactory.Unauthorized();
  }

  const client = await clerkClient();
  try {
    const invitation = await client.invitations.createInvitation({
      emailAddress,
      publicMetadata: { role: INVITATION_ROLE, allowedStoreIds },
      redirectUrl: `${env.ADMIN_WEB_URL.replace(/\/$/, "")}/aceptar-invitacion`,
      notify: true,
    });
    const names = new Map(stores.map((store) => [store.id, store.name]));
    return describe(invitation as never, names);
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 400 || status === 422) {
      throw ErrorFactory.Conflict("Ese correo ya tiene una invitación o una cuenta en el panel.");
    }
    throw error;
  }
}

/** Anula una invitación pendiente. */
export async function revokeInvitation(invitationId: string): Promise<void> {
  if (!invitationId) throw ErrorFactory.InvalidRequest("Se requiere el ID de la invitación");
  const client = await clerkClient();
  try {
    await client.invitations.revokeInvitation(invitationId);
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 404) throw ErrorFactory.NotFound("La invitación ya no existe");
    throw error;
  }
}
