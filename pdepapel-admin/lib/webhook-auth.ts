import crypto from "crypto";

/**
 * Comparación en tiempo constante de dos secretos en texto plano.
 * Devuelve false si falta alguno o si el esperado está vacío: un secreto sin
 * configurar nunca debe dejar pasar una petición.
 */
export function safeSecretEquals(
  received: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Compara dos hashes hexadecimales (checksums de proveedor) en tiempo
 * constante, sin distinguir mayúsculas.
 */
export function safeHexEquals(
  received: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!received || !expected) return false;
  return safeSecretEquals(received.trim().toLowerCase(), expected.trim().toLowerCase());
}

export const WEBHOOK_TOKEN_HEADER = "x-webhook-token";

/**
 * EnvioClick no firma sus webhooks: la única credencial posible es un secreto
 * compartido que viaja en la URL configurada en su panel o en una cabecera.
 * Se aceptan ambos para no atarse a lo que su panel permita configurar.
 */
export function readWebhookToken(req: Request): string | null {
  const header = req.headers.get(WEBHOOK_TOKEN_HEADER);
  if (header) return header.trim();
  const url = new URL(req.url);
  return url.searchParams.get("token")?.trim() || null;
}

/** Tienda a la que se limita el webhook, si la URL configurada la incluye. */
export function readWebhookStoreId(req: Request): string | null {
  const url = new URL(req.url);
  return url.searchParams.get("store")?.trim() || null;
}

/**
 * Fecha del proveedor: `undefined` cuando no viene, y un error explícito
 * cuando viene pero no se puede leer. Antes una fecha corrupta llegaba a
 * Prisma como `Invalid Date` y tumbaba la petición con un 500.
 */
export function parseProviderDate(
  value: unknown,
  field: string,
): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) {
    throw new InvalidWebhookPayloadError(`La fecha «${field}» no es válida`);
  }
  return date;
}

/** Cuerpo mal formado: se responde 400 para que el proveedor deje de reintentar. */
export class InvalidWebhookPayloadError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "InvalidWebhookPayloadError";
  }
}
