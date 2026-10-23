/**
 * Lee el cuerpo JSON de un pedido. Si no se puede (vacío, cortado, ya leído o
 * mal formado) no lo esconde: deja en el registro el error, el content-length
 * y el content-type, sin nada del contenido, para saber si el navegador no
 * mandó nada o el cuerpo se rompió en el camino.
 */
export async function readJsonBody(request: Request, tag: string): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await request.json() };
  } catch (error) {
    console.warn(`[${tag}] cuerpo ilegible`, {
      error: error instanceof Error ? error.message : String(error),
      method: request.method,
      contentLength: request.headers.get("content-length"),
      contentType: request.headers.get("content-type"),
    });
    return { ok: false };
  }
}
