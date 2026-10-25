import { notFound } from "next/navigation";

/**
 * Forma de un id de tienda: UUID en producción, `e2e-admin-store` en pruebas.
 * Nunca lleva punto, así que `/wp-login.php` o `/x.env` no son una tienda.
 */
const STORE_ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

export function looksLikeStoreId(value: string | null | undefined): value is string {
  return typeof value === "string" && STORE_ID_SHAPE.test(value);
}

/**
 * El matcher del middleware salta las rutas con extensión, así que un bot que
 * pide `/algo.php` llega a `[storeId]` sin que Clerk haya corrido y `auth()`
 * revienta con 500. Se corta con 404 antes de tocar Clerk.
 */
export function assertStoreIdShape(value: string): void {
  if (!looksLikeStoreId(value)) notFound();
}
