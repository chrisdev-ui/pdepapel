export type PictureFormat = "jpeg" | "png" | "webp" | "avif" | "gif" | "unknown";

export interface ImageHeader {
  format: PictureFormat;
  width: number | null;
  height: number | null;
}

export type PictureProblemCode = "format" | "too-small" | "too-heavy" | "unreadable";

export interface PictureCheck {
  ok: boolean;
  problems: { code: PictureProblemCode; message: string }[];
  belowRecommended: boolean;
}

export interface CoverInspection {
  whiteBorderShare: number;
  touchesEdge: boolean;
  compliant: boolean;
  reasons: string[];
}

export const MERCADOLIBRE_PICTURE_MIN_SIDE = 500;
export const MERCADOLIBRE_PICTURE_RECOMMENDED_SIDE = 1200;
export const MERCADOLIBRE_PICTURE_MAX_BYTES = 10 * 1024 * 1024;

export const COVER_BAND_SHARE = 0.04;
export const COVER_NEAR_WHITE_MIN = 240;
export const COVER_NEAR_WHITE_SPREAD = 15;
export const COVER_MIN_WHITE_SHARE = 0.9;
export const COVER_EDGE_TOUCH_SHARE = 0.02;

const NO_DIMENSIONS = { width: null, height: null };

function ascii(bytes: Uint8Array, start: number, length: number): string {
  if (bytes.length < start + length) return "";
  let text = "";
  for (let i = start; i < start + length; i += 1) text += String.fromCharCode(bytes[i]);
  return text;
}

function u16be(bytes: Uint8Array, at: number): number {
  return (bytes[at] << 8) | bytes[at + 1];
}

function u32be(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) >>> 0) + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3];
}

function positive(value: number): number | null {
  return value > 0 ? value : null;
}

function readPng(bytes: Uint8Array): ImageHeader {
  if (bytes.length < 24 || ascii(bytes, 12, 4) !== "IHDR") return { format: "png", ...NO_DIMENSIONS };
  return { format: "png", width: positive(u32be(bytes, 16)), height: positive(u32be(bytes, 20)) };
}

function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function readJpeg(bytes: Uint8Array): ImageHeader {
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return { format: "jpeg", ...NO_DIMENSIONS };
    while (i < bytes.length && bytes[i] === 0xff) i += 1;
    if (i >= bytes.length) break;
    const marker = bytes[i];
    i += 1;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda) break;
    if (i + 1 >= bytes.length) break;
    const length = u16be(bytes, i);
    if (length < 2) break;
    if (isStartOfFrame(marker)) {
      if (i + 7 > bytes.length) break;
      return { format: "jpeg", height: positive(u16be(bytes, i + 3)), width: positive(u16be(bytes, i + 5)) };
    }
    i += length;
  }
  return { format: "jpeg", ...NO_DIMENSIONS };
}

function readWebp(bytes: Uint8Array): ImageHeader {
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X" && bytes.length >= 30) {
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    return { format: "webp", width, height };
  }
  if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      format: "webp",
      width: positive((bytes[26] | (bytes[27] << 8)) & 0x3fff),
      height: positive((bytes[28] | (bytes[29] << 8)) & 0x3fff),
    };
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return { format: "webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return { format: "webp", ...NO_DIMENSIONS };
}

/** Formato y medidas leídos de la cabecera; basta con los primeros 64 KB del archivo. */
export function readImageHeader(bytes: Uint8Array): ImageHeader {
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a) {
    return readPng(bytes);
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return readJpeg(bytes);
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return readWebp(bytes);
  const gif = ascii(bytes, 0, 6);
  if (gif === "GIF87a" || gif === "GIF89a") {
    if (bytes.length < 10) return { format: "gif", ...NO_DIMENSIONS };
    return { format: "gif", width: positive(bytes[6] | (bytes[7] << 8)), height: positive(bytes[8] | (bytes[9] << 8)) };
  }
  if (ascii(bytes, 4, 4) === "ftyp") {
    const boxSize = Math.min(u32be(bytes, 0), bytes.length);
    for (let at = 8; at + 4 <= boxSize; at += 4) {
      const brand = ascii(bytes, at, 4);
      if (brand === "avif" || brand === "avis") return { format: "avif", ...NO_DIMENSIONS };
    }
  }
  return { format: "unknown", ...NO_DIMENSIONS };
}

function formatMegabytes(bytes: number): string {
  const value = Math.round((bytes / (1024 * 1024)) * 10) / 10;
  return (Number.isInteger(value) ? String(value) : value.toFixed(1)).replace(".", ",");
}

/** Reglas duras de Mercado Libre: JPG o PNG, hasta 10 MB y al menos 500 px por lado (causa 509). */
export function checkMercadoLibrePicture(input: {
  format: PictureFormat;
  width: number | null;
  height: number | null;
  bytes: number | null;
}): PictureCheck {
  const problems: PictureCheck["problems"] = [];
  const supported = input.format === "jpeg" || input.format === "png";
  const hasDimensions = input.width !== null && input.height !== null;

  if (input.format === "unknown") {
    problems.push({ code: "unreadable", message: "No se pudo leer la foto: el archivo no parece una imagen." });
  } else if (!supported) {
    problems.push({ code: "format", message: `La foto debe ser JPG o PNG (llegó ${input.format.toUpperCase()}).` });
  } else if (!hasDimensions) {
    problems.push({ code: "unreadable", message: "No se pudieron leer las medidas de la foto." });
  }

  if (input.width !== null && input.height !== null) {
    if (Math.min(input.width, input.height) < MERCADOLIBRE_PICTURE_MIN_SIDE) {
      problems.push({
        code: "too-small",
        message: `La foto mide ${input.width} × ${input.height} px; Mercado Libre pide al menos ${MERCADOLIBRE_PICTURE_MIN_SIDE} px por lado.`,
      });
    }
  }

  if (input.bytes !== null && input.bytes > MERCADOLIBRE_PICTURE_MAX_BYTES) {
    problems.push({
      code: "too-heavy",
      message: `La foto pesa ${formatMegabytes(input.bytes)} MB; el máximo es 10 MB.`,
    });
  }

  const belowRecommended =
    input.width !== null &&
    input.height !== null &&
    Math.min(input.width, input.height) < MERCADOLIBRE_PICTURE_RECOMMENDED_SIDE;

  return { ok: problems.length === 0, problems, belowRecommended };
}

/**
 * Heurística de portada: fondo blanco en la franja exterior y producto sin
 * tocar los bordes. Con canal alfa, lo transparente cuenta como blanco.
 */
export function inspectCoverPixels(input: {
  width: number;
  height: number;
  channels: 3 | 4;
  data: Uint8Array;
}): CoverInspection {
  const { width, height, channels, data } = input;
  if (width <= 0 || height <= 0 || data.length < width * height * channels) {
    return { whiteBorderShare: 0, touchesEdge: false, compliant: false, reasons: ["No se pudo leer la portada."] };
  }

  const isWhite = (x: number, y: number): boolean => {
    const at = (y * width + x) * channels;
    if (channels === 4 && data[at + 3] < 128) return true;
    const r = data[at];
    const g = data[at + 1];
    const b = data[at + 2];
    const min = Math.min(r, g, b);
    return min >= COVER_NEAR_WHITE_MIN && Math.max(r, g, b) - min <= COVER_NEAR_WHITE_SPREAD;
  };

  const band = Math.min(
    Math.max(2, Math.round(Math.min(width, height) * COVER_BAND_SHARE)),
    Math.floor(Math.min(width, height) / 2) || 1,
  );

  let bandPixels = 0;
  let whitePixels = 0;
  for (let y = 0; y < height; y += 1) {
    const inRowBand = y < band || y >= height - band;
    for (let x = 0; x < width; x += 1) {
      if (!inRowBand && x >= band && x < width - band) continue;
      bandPixels += 1;
      if (isWhite(x, y)) whitePixels += 1;
    }
  }
  const whiteBorderShare = bandPixels > 0 ? whitePixels / bandPixels : 0;

  const edgeTouched = (length: number, at: (i: number) => [number, number]): boolean => {
    let dark = 0;
    for (let i = 0; i < length; i += 1) {
      const [x, y] = at(i);
      if (!isWhite(x, y)) dark += 1;
    }
    return dark / length > COVER_EDGE_TOUCH_SHARE;
  };
  const touchesEdge =
    edgeTouched(width, (i) => [i, 0]) ||
    edgeTouched(width, (i) => [i, height - 1]) ||
    edgeTouched(height, (i) => [0, i]) ||
    edgeTouched(height, (i) => [width - 1, i]);

  const whiteBackground = whiteBorderShare >= COVER_MIN_WHITE_SHARE;
  const reasons: string[] = [];
  if (!whiteBackground) reasons.push("El fondo de la portada no es blanco.");
  // Con fondo de color el borde siempre «se toca»; decir que está cortado sería falso.
  else if (touchesEdge) reasons.push("El producto toca el borde: parece cortado.");

  return { whiteBorderShare, touchesEdge, compliant: whiteBackground && !touchesEdge, reasons };
}
