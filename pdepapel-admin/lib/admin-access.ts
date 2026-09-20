import prismadb from "@/lib/prismadb";

/**
 * A Clerk session only proves who the visitor is: the storefront and the
 * panel share one Clerk instance, so every shop customer has one. Panel
 * access belongs to users who own a store, plus the user ids listed in
 * `ADMIN_ALLOWED_USER_IDS` (comma separated, optional) so a new owner can
 * create the first store.
 */
export function getAllowedAdminUserIds(): string[] {
  return (process.env.ADMIN_ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Cuentas que el dueño autorizó a mano en `ADMIN_ALLOWED_USER_IDS`. Es la
 * única fuente de la autorización explícita: quién puede crear tiendas y
 * quién puede invitar a otras personas.
 */
export function isAllowlistedOwner(userId: string | null | undefined): boolean {
  return Boolean(userId) && getAllowedAdminUserIds().includes(userId as string);
}

/**
 * Crear tiendas exige estar en la lista explícita. **Tener una tienda no
 * basta**: antes cualquier dueña podía crear tiendas nuevas sin que nadie lo
 * autorizara, y la única barrera real era que la lista estuviera vacía.
 * Separado a propósito de `hasAdminAccess`, para que cerrar la creación no
 * pueda dejar a nadie fuera del panel.
 */
export function canCreateStore(userId: string | null | undefined): boolean {
  return isAllowlistedOwner(userId);
}

export async function ownsAnyStore(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const count = await prismadb.store.count({ where: { userId } });
  return count > 0;
}

/**
 * Whether this session may use the panel at all (any store, or allowlisted).
 * Deliberately unchanged by the store-creation lockdown: la dueña conserva el
 * panel aunque `ADMIN_ALLOWED_USER_IDS` esté sin configurar.
 */
export async function hasAdminAccess(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  if (isAllowlistedOwner(userId)) return true;
  return ownsAnyStore(userId);
}
