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

export function isAllowlistedAdmin(userId: string | null | undefined): boolean {
  return Boolean(userId) && getAllowedAdminUserIds().includes(userId as string);
}

export async function ownsAnyStore(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const count = await prismadb.store.count({ where: { userId } });
  return count > 0;
}

/** Whether this session may use the panel at all (any store, or allowlisted). */
export async function hasAdminAccess(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  if (isAllowlistedAdmin(userId)) return true;
  return ownsAnyStore(userId);
}
