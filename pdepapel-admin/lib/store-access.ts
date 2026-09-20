import { auth, clerkClient } from "@clerk/nextjs/server";

import { hasAdminAccess } from "@/lib/admin-access";
import { ErrorFactory } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";

/**
 * Acceso a una tienda del panel.
 *
 * - **Dueña**: `Store.userId` (la base decide; es la única que puede escribir).
 * - **Solo lectura** («viewer»): una cuenta de Clerk cuyo `publicMetadata`
 *   trae `{ role: "viewer", allowedStoreIds: ["<storeId>"] }`. Solo puede
 *   leer, y solo las tiendas listadas. Se configura a mano en el panel de
 *   Clerk (Users → la cuenta → Metadata → Public); ver docs/acceso-solo-lectura.md.
 *
 * El metadato se lee de los claims de la sesión cuando la plantilla del token
 * de sesión de Clerk copia `public_metadata` en `metadata`; si la plantilla
 * no existe, se consulta la API de Clerk. Cualquier forma inesperada del
 * metadato se trata como «sin acceso» (fail closed). Un `role: "owner"` en el
 * metadato no otorga nada: la propiedad sigue viniendo de la base.
 */
export type StoreRole = "owner" | "viewer";

export interface PanelMetadata {
  role: StoreRole;
  allowedStoreIds: string[];
}

export interface StoreAccess {
  userId: string;
  role: StoreRole;
}

/** Valida la forma del metadato; cualquier desviación devuelve `null`. */
export function parsePanelMetadata(raw: unknown): PanelMetadata | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { role, allowedStoreIds } = raw as Record<string, unknown>;
  if (role !== "owner" && role !== "viewer") return null;
  if (!Array.isArray(allowedStoreIds)) return null;
  const ids = allowedStoreIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim());
  if (ids.length !== allowedStoreIds.length) return null;
  return { role, allowedStoreIds: ids };
}

async function isStoreOwner(userId: string, storeId: string): Promise<boolean> {
  if (!storeId) return false;
  const store = await prismadb.store.findFirst({ where: { id: storeId, userId }, select: { id: true } });
  return Boolean(store);
}

async function readPanelMetadata(userId: string, sessionClaims: unknown): Promise<PanelMetadata | null> {
  const claims = sessionClaims as { metadata?: unknown } | null | undefined;
  if (claims && claims.metadata !== undefined) return parsePanelMetadata(claims.metadata);
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return parsePanelMetadata(user?.publicMetadata);
  } catch {
    return null;
  }
}

async function resolveAccess(userId: string, sessionClaims: unknown, storeId: string): Promise<StoreAccess | null> {
  if (await isStoreOwner(userId, storeId)) return { userId, role: "owner" };
  const metadata = await readPanelMetadata(userId, sessionClaims);
  if (metadata?.role === "viewer" && metadata.allowedStoreIds.includes(storeId)) return { userId, role: "viewer" };
  return null;
}

/** Quién es y qué puede en esta tienda; `null` sin sesión o sin acceso. */
export async function getStoreAccess(storeId: string): Promise<StoreAccess | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;
  return resolveAccess(userId, sessionClaims, storeId);
}

/** Lectura: dueña o cuenta de solo lectura con la tienda permitida. 401 sin sesión, 403 sin acceso. */
export async function requireStoreRead(storeId: string): Promise<StoreAccess> {
  const { userId, sessionClaims } = await auth();
  if (!userId) throw ErrorFactory.Unauthenticated();
  const access = await resolveAccess(userId, sessionClaims, storeId);
  if (!access) throw ErrorFactory.Unauthorized();
  return access;
}

/**
 * Tiendas que puede leer la cuenta de solo lectura de esta sesión, o lista
 * vacía. Lo usa la raíz del panel para llevarla a su tienda: no es dueña de
 * ninguna, así que sin esto acabaría en «sin acceso».
 */
export async function getViewerStoreIds(): Promise<string[]> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return [];
  const metadata = await readPanelMetadata(userId, sessionClaims);
  return metadata?.role === "viewer" ? metadata.allowedStoreIds : [];
}

/** Escritura y lecturas sensibles: solo la dueña de la tienda. Devuelve el userId. */
export async function requireStoreOwner(storeId: string): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw ErrorFactory.Unauthenticated();
  if (!(await isStoreOwner(userId, storeId))) throw ErrorFactory.Unauthorized();
  return userId;
}

/** Datos del panel que no pertenecen a una tienda (p. ej. municipios DANE): cualquier sesión con acceso al panel. */
export async function requireAdminSession(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw ErrorFactory.Unauthenticated();
  if (!(await hasAdminAccess(userId))) throw ErrorFactory.Unauthorized();
  return userId;
}
