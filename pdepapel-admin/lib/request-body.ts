import { ErrorFactory } from "@/lib/api-errors";

export const UNREADABLE_BODY_MESSAGE = "El cuerpo de la solicitud no es JSON válido";

type ReadResult = { ok: true; body: unknown } | { ok: false };

/**
 * Lee el cuerpo JSON de un pedido. Si no se puede (vacío, cortado, ya leído o
 * mal formado) no lo esconde: deja en el registro el error, el content-length
 * y el content-type, sin nada del contenido, para saber si el navegador no
 * mandó nada o el cuerpo se rompió en el camino.
 *
 * Con `optional`, un cuerpo vacío no es un error: devuelve el `fallback` sin
 * registrar nada (para rutas cuyo cliente hace POST sin cuerpo). Un cuerpo con
 * texto que no es JSON sigue siendo ilegible.
 */
export async function readJsonBody(request: Request, tag: string, options: { optional?: { fallback: unknown } } = {}): Promise<ReadResult> {
  let text: string;
  try {
    text = await request.text();
  } catch (error) {
    logUnreadable(request, tag, error, false);
    return { ok: false };
  }
  if (text.trim() === "") {
    if (options.optional) return { ok: true, body: options.optional.fallback };
    logUnreadable(request, tag, new Error("cuerpo vacío"), true);
    return { ok: false };
  }
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch (error) {
    logUnreadable(request, tag, error, false);
    return { ok: false };
  }
}

/**
 * Como `readJsonBody`, pero un cuerpo ilegible corta con un 400 en español.
 * Devuelve `any` por defecto, igual que `request.json()`, para reemplazarlo sin cambiar los tipos de cada ruta.
 */
export async function requireJsonBody<T = any>(request: Request, tag: string, message = UNREADABLE_BODY_MESSAGE): Promise<T> {
  const read = await readJsonBody(request, tag);
  if (!read.ok) throw ErrorFactory.InvalidRequest(message);
  return read.body as T;
}

/** Cuerpo opcional: vacío → `fallback`; con texto que no es JSON → 400. */
export async function readOptionalJsonBody<T = any>(request: Request, tag: string, fallback: unknown, message = UNREADABLE_BODY_MESSAGE): Promise<T> {
  const read = await readJsonBody(request, tag, { optional: { fallback } });
  if (!read.ok) throw ErrorFactory.InvalidRequest(message);
  return read.body as T;
}

function logUnreadable(request: Request, tag: string, error: unknown, empty: boolean) {
  console.warn(`[${tag}] cuerpo ilegible`, {
    error: error instanceof Error ? error.message : String(error),
    empty,
    method: request.method,
    contentLength: request.headers.get("content-length"),
    contentType: request.headers.get("content-type"),
  });
}
