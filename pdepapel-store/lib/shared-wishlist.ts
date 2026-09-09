/** Lista de favoritos compartida por enlace: solo ids de producto, sin datos personales. */
export const SHARED_LIST_PARAM = "lista";
export const SHARED_LIST_MAX = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toBase64Url(value: string): string {
  const base64 = typeof window === "undefined" ? Buffer.from(value, "utf8").toString("base64") : window.btoa(value);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  try {
    return typeof window === "undefined" ? Buffer.from(base64, "base64").toString("utf8") : window.atob(base64);
  } catch {
    return "";
  }
}

export function encodeSharedList(productIds: string[]): string {
  return toBase64Url(productIds.filter((id) => UUID.test(id)).slice(0, SHARED_LIST_MAX).join(","));
}

export function decodeSharedList(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return [];
  return Array.from(new Set(fromBase64Url(raw).split(",").filter((id) => UUID.test(id)))).slice(0, SHARED_LIST_MAX);
}
