/**
 * Duración de un reel de Instagram leyendo solo el encabezado del MP4: la
 * Graph API no la da. Se busca la caja `mvhd` (dentro de `moov`) en los
 * primeros 64 KB y, si no está (moov al final), en los últimos 512 KB. Nunca
 * se baja el video entero; cualquier fallo devuelve null.
 */
export const MP4_HEAD_BYTES = 64 * 1024;
export const MP4_TAIL_BYTES = 512 * 1024;
/** Tope del lado de aquí por si el servidor ignora el Range y manda el archivo entero. */
export const MP4_MAX_READ_BYTES = 600 * 1024;
export const MP4_TIMEOUT_MS = 3000;
const MAX_REASONABLE_SECONDS = 3 * 3600;

const readUint32 = (bytes: Uint8Array, offset: number) => ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
const readUint64 = (bytes: Uint8Array, offset: number) => readUint32(bytes, offset) * 2 ** 32 + readUint32(bytes, offset + 4);

/**
 * La duración en segundos de la primera `mvhd` válida del pedazo, o null. Una
 * `mvhd` real mide 108 (versión 0) o 120 bytes (versión 1): así no se toma por
 * caja una coincidencia dentro de los datos del video. Un MP4 fragmentado trae
 * duración 0: null.
 */
export function parseMvhdDuration(bytes: Uint8Array): number | null {
  for (let index = 4; index + 4 <= bytes.length; index += 1) {
    if (bytes[index] !== 0x6d || bytes[index + 1] !== 0x76 || bytes[index + 2] !== 0x68 || bytes[index + 3] !== 0x64) continue;
    const boxStart = index - 4;
    const size = readUint32(bytes, boxStart);
    const body = index + 4;
    if (body >= bytes.length) return null;
    const version = bytes[body];
    if (!((version === 0 && size === 108) || (version === 1 && size === 120))) continue;
    const timescaleAt = version === 0 ? body + 12 : body + 20;
    const durationAt = timescaleAt + 4;
    if (durationAt + (version === 0 ? 4 : 8) > bytes.length) return null;
    const timescale = readUint32(bytes, timescaleAt);
    const duration = version === 0 ? readUint32(bytes, durationAt) : readUint64(bytes, durationAt);
    if (!timescale || !duration) return null;
    const seconds = duration / timescale;
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_REASONABLE_SECONDS) return null;
    return Math.round(seconds * 10) / 10;
  }
  return null;
}

type FetchImpl = typeof fetch;

/** Lee hasta `limit` bytes de la respuesta y corta el resto. */
async function readUpTo(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array(await response.arrayBuffer()).slice(0, limit);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(Math.min(total, limit));
  let offset = 0;
  for (const chunk of chunks) {
    const piece = chunk.subarray(0, bytes.length - offset);
    bytes.set(piece, offset);
    offset += piece.length;
    if (offset >= bytes.length) break;
  }
  return bytes;
}

async function fetchRange(url: string, range: string, fetchImpl: FetchImpl, limit: number): Promise<Uint8Array | null> {
  try {
    const response = await fetchImpl(url, { headers: { Range: range }, signal: AbortSignal.timeout(MP4_TIMEOUT_MS), cache: "no-store" });
    if (!response.ok) return null;
    return await readUpTo(response, limit);
  } catch {
    return null;
  }
}

/** Duración del video en `mediaUrl`, en segundos, o null. Nunca lanza. */
export async function probeMp4Duration(mediaUrl: string, fetchImpl: FetchImpl = fetch): Promise<number | null> {
  const head = await fetchRange(mediaUrl, `bytes=0-${MP4_HEAD_BYTES - 1}`, fetchImpl, MP4_MAX_READ_BYTES);
  if (!head) return null;
  const fromHead = parseMvhdDuration(head);
  if (fromHead !== null) return fromHead;
  const tail = await fetchRange(mediaUrl, `bytes=-${MP4_TAIL_BYTES}`, fetchImpl, MP4_MAX_READ_BYTES);
  return tail ? parseMvhdDuration(tail) : null;
}
