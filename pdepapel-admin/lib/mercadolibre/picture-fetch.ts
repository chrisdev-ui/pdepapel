import { checkMercadoLibrePicture, readImageHeader, type PictureCheck } from "./picture-rules";

/**
 * Revisa cada foto tal como la descargará Mercado Libre: formato, peso y
 * medidas, leyendo solo los primeros 64 KB (el tamaño total sale de
 * Content-Range). No crea transformaciones nuevas en Cloudinary: la URL es la
 * misma que se envía. El fondo blanco y el producto entero de la portada no
 * se pueden ver aquí sin descargar la foto completa: los revisa el paquete de
 * fotos de Mercado Libre y la hoja de contacto de cada tanda.
 */
const HEADER_BYTES = 64 * 1024;
const TIMEOUT_MS = 8_000;

export type RemotePictureResult = { url: string; check: PictureCheck } | { url: string; unreachable: string };

function totalBytes(response: Response, read: number): number | null {
  const range = response.headers.get("content-range");
  const fromRange = range ? Number(range.split("/")[1]) : NaN;
  if (Number.isFinite(fromRange) && fromRange > 0) return fromRange;
  if (response.status === 200) {
    const length = Number(response.headers.get("content-length"));
    return Number.isFinite(length) && length > 0 ? length : read;
  }
  return null;
}

async function inspectOne(url: string, request: typeof fetch): Promise<RemotePictureResult> {
  try {
    const response = await request(url, {
      headers: { Range: `bytes=0-${HEADER_BYTES - 1}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { url, unreachable: `la foto respondió ${response.status}` };
    const bytes = new Uint8Array(await response.arrayBuffer()).subarray(0, HEADER_BYTES);
    const header = readImageHeader(bytes);
    return { url, check: checkMercadoLibrePicture({ ...header, bytes: totalBytes(response, bytes.length) }) };
  } catch (error) {
    return { url, unreachable: error instanceof Error ? error.message : "sin respuesta" };
  }
}

export async function inspectRemotePictures(urls: readonly string[], request: typeof fetch = fetch): Promise<RemotePictureResult[]> {
  return Promise.all(urls.map((url) => inspectOne(url, request)));
}
