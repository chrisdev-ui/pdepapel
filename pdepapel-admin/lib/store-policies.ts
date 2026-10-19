/**
 * `Store.policies` es una columna JSON que en producción guarda un texto JSON
 * (`"{\"shipping\":…}"`), pero su valor por defecto es un objeto (`{}`): Prisma
 * devuelve a veces un texto y a veces un objeto. Esto acepta los dos y nunca
 * lanza; cualquier otra cosa (texto roto, lista, número) cuenta como sin políticas.
 */
export type StorePolicies = Record<string, unknown>;

const isPlainObject = (value: unknown): value is StorePolicies =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function readStorePolicies(value: unknown): StorePolicies | null {
  if (isPlainObject(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
