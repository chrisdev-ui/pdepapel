import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkMercadoLibrePicture,
  inspectCoverPixels,
  readImageHeader,
} from "@/lib/mercadolibre/picture-rules";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((part) => (typeof part === "string" ? Array.from(part, (c) => c.charCodeAt(0)) : part)));
const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];

function png(width: number, height: number) {
  return bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a], be32(13), "IHDR", be32(width), be32(height), [8, 6, 0, 0, 0]);
}

function jpeg(width: number, height: number, sof = 0xc0) {
  const app0 = [0xff, 0xe0, ...be16(16), ...Array.from("JFIF\0", (c) => c.charCodeAt(0)), 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const dqt = [0xff, 0xdb, ...be16(67), ...new Array(65).fill(1)];
  const frame = [0xff, 0xff, sof, ...be16(17), 8, ...be16(height), ...be16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return bytes([0xff, 0xd8], app0, dqt, frame, [0xff, 0xda, 0, 12]);
}

describe("readImageHeader", () => {
  it("lee las medidas de un PNG", () => {
    expect(readImageHeader(png(1200, 800))).toEqual({ format: "png", width: 1200, height: 800 });
  });

  it("recorre los marcadores JPEG con relleno 0xFF hasta SOF0 y SOF2", () => {
    expect(readImageHeader(jpeg(640, 480))).toEqual({ format: "jpeg", width: 640, height: 480 });
    expect(readImageHeader(jpeg(1600, 1200, 0xc2))).toEqual({ format: "jpeg", width: 1600, height: 1200 });
    expect(readImageHeader(jpeg(300, 500, 0xc1))).toEqual({ format: "jpeg", width: 300, height: 500 });
  });

  it("devuelve medidas nulas si el SOF no cabe en el búfer", () => {
    const full = jpeg(640, 480);
    expect(readImageHeader(full.subarray(0, 30))).toEqual({ format: "jpeg", width: null, height: null });
    expect(readImageHeader(bytes([0xff, 0xd8, 0xff, 0xda, 0, 12]))).toEqual({ format: "jpeg", width: null, height: null });
  });

  it("reconoce GIF, WEBP y AVIF por su firma", () => {
    expect(readImageHeader(bytes("GIF89a", le16(320), le16(200)))).toEqual({ format: "gif", width: 320, height: 200 });
    expect(readImageHeader(bytes("RIFF", be32(100), "WEBP", "VP8X", be32(10), [0, 0, 0, 0], [0xff, 0x01, 0], [0xe7, 0x03, 0])))
      .toEqual({ format: "webp", width: 512, height: 1000 });
    expect(readImageHeader(bytes("RIFF", be32(100), "WEBPVP8 ")).format).toBe("webp");
    expect(readImageHeader(bytes(be32(24), "ftyp", "avif", be32(0), "mif1", "miaf"))).toEqual({
      format: "avif",
      width: null,
      height: null,
    });
  });

  it("marca como desconocido lo que no es imagen", () => {
    expect(readImageHeader(bytes("hola mundo, esto no es una foto"))).toEqual({ format: "unknown", width: null, height: null });
    expect(readImageHeader(new Uint8Array())).toEqual({ format: "unknown", width: null, height: null });
  });
});

describe("checkMercadoLibrePicture", () => {
  it("acepta un JPG de 1200 × 1200", () => {
    expect(checkMercadoLibrePicture({ format: "jpeg", width: 1200, height: 1200, bytes: 300_000 })).toEqual({
      ok: true,
      problems: [],
      belowRecommended: false,
    });
  });

  it("rechaza formatos que no son JPG ni PNG", () => {
    const result = checkMercadoLibrePicture({ format: "webp", width: 1000, height: 1000, bytes: 1000 });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([{ code: "format", message: "La foto debe ser JPG o PNG (llegó WEBP)." }]);
  });

  it("rechaza fotos con un lado menor a 500 px", () => {
    const result = checkMercadoLibrePicture({ format: "jpeg", width: 225, height: 225, bytes: 1000 });
    expect(result.problems).toEqual([
      { code: "too-small", message: "La foto mide 225 × 225 px; Mercado Libre pide al menos 500 px por lado." },
    ]);
    expect(result.belowRecommended).toBe(true);
    expect(checkMercadoLibrePicture({ format: "png", width: 500, height: 2000, bytes: 1000 }).ok).toBe(true);
  });

  it("rechaza fotos de más de 10 MB", () => {
    const result = checkMercadoLibrePicture({ format: "png", width: 2000, height: 2000, bytes: Math.round(12.4 * 1024 * 1024) });
    expect(result.problems).toEqual([{ code: "too-heavy", message: "La foto pesa 12,4 MB; el máximo es 10 MB." }]);
    expect(checkMercadoLibrePicture({ format: "png", width: 2000, height: 2000, bytes: 10 * 1024 * 1024 }).ok).toBe(true);
  });

  it("marca como ilegible lo desconocido o sin medidas", () => {
    expect(checkMercadoLibrePicture({ format: "unknown", width: null, height: null, bytes: 10 }).problems[0]?.code).toBe("unreadable");
    expect(checkMercadoLibrePicture({ format: "jpeg", width: null, height: null, bytes: 10 }).problems[0]?.code).toBe("unreadable");
  });

  it("avisa por debajo de lo recomendado sin fallar", () => {
    const below = checkMercadoLibrePicture({ format: "jpeg", width: 1199, height: 1600, bytes: null });
    expect(below.ok).toBe(true);
    expect(below.belowRecommended).toBe(true);
    expect(checkMercadoLibrePicture({ format: "jpeg", width: 1200, height: 1600, bytes: null }).belowRecommended).toBe(false);
  });
});

type Rgb = [number, number, number];

function canvas(width: number, height: number, background: Rgb, paint?: (x: number, y: number) => Rgb | null) {
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = paint?.(x, y) ?? background;
      data.set(color, (y * width + x) * 3);
    }
  }
  return { width, height, channels: 3 as const, data };
}

const WHITE: Rgb = [255, 255, 255];
const PINK: Rgb = [230, 90, 150];

describe("inspectCoverPixels", () => {
  it("da por buena una portada con el producto centrado sobre blanco", () => {
    const result = inspectCoverPixels(canvas(200, 200, WHITE, (x, y) => (x > 40 && x < 160 && y > 40 && y < 160 ? PINK : null)));
    expect(result).toEqual({ whiteBorderShare: 1, touchesEdge: false, compliant: true, reasons: [] });
  });

  it("detecta el producto cortado en el borde", () => {
    const result = inspectCoverPixels(canvas(200, 200, WHITE, (x, y) => (x > 80 && x < 120 && y < 120 ? PINK : null)));
    expect(result.touchesEdge).toBe(true);
    expect(result.compliant).toBe(false);
    expect(result.reasons).toEqual(["El producto toca el borde: parece cortado."]);
  });

  it("tolera un roce mínimo del borde (≤ 2 %)", () => {
    const result = inspectCoverPixels(canvas(200, 200, WHITE, (x, y) => (x >= 100 && x < 104 && y < 100 ? PINK : null)));
    expect(result.touchesEdge).toBe(false);
    expect(result.compliant).toBe(true);
  });

  it("rechaza fondos de color sin decir que el producto está cortado", () => {
    const result = inspectCoverPixels(canvas(200, 200, [200, 200, 200]));
    expect(result.whiteBorderShare).toBe(0);
    expect(result.touchesEdge).toBe(true);
    expect(result.compliant).toBe(false);
    expect(result.reasons).toEqual(["El fondo de la portada no es blanco."]);
  });

  it("no cuenta como blanco un crema con tinte", () => {
    expect(inspectCoverPixels(canvas(100, 100, [255, 245, 225])).whiteBorderShare).toBe(0);
    expect(inspectCoverPixels(canvas(100, 100, [244, 242, 246])).whiteBorderShare).toBe(1);
  });

  it("trata como blanco lo transparente", () => {
    const width = 100;
    const height = 100;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const inside = x > 20 && x < 80 && y > 20 && y < 80;
        data.set(inside ? [...PINK, 255] : [0, 0, 0, 0], (y * width + x) * 4);
      }
    }
    expect(inspectCoverPixels({ width, height, channels: 4, data }).compliant).toBe(true);
  });

  it("no revienta con datos incompletos", () => {
    expect(inspectCoverPixels({ width: 10, height: 10, channels: 3, data: new Uint8Array(5) }).compliant).toBe(false);
  });
});

const PACK_DIR = path.resolve(process.cwd(), "../output/audits/ml-image-pack-muestra-2026-10-30");
const ORIGINALS_DIR = "/Users/christiantorres/.claude/jobs/d9699aed/tmp/mlimg/originals";

type Sharp = (input: string) => {
  toColourspace(space: string): { raw(): { toBuffer(options: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number; channels: number } }> } };
  metadata(): Promise<{ width?: number; height?: number }>;
};

async function loadSharp(): Promise<Sharp | null> {
  try {
    const mod = (await import("sharp")) as unknown as { default: Sharp };
    return mod.default;
  } catch {
    return null;
  }
}

async function decode(sharp: Sharp, file: string) {
  const { data, info } = await sharp(file).toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 3 && info.channels !== 4) throw new Error(`canales inesperados: ${info.channels}`);
  return inspectCoverPixels({ width: info.width, height: info.height, channels: info.channels, data: new Uint8Array(data) });
}

describe.skipIf(!existsSync(PACK_DIR))("muestras reales del paquete de fotos", () => {
  it("separa la portada corregida de la que tiene la tapa cortada", async () => {
    const sharp = await loadSharp();
    if (!sharp) return;
    const fixed = await decode(sharp, path.join(PACK_DIR, "RES-CLS-MUL-M-P-3170/01b-main-bgremoval-fixed-lpad.jpg"));
    expect(fixed.compliant).toBe(true);
    const cut = await decode(sharp, path.join(PACK_DIR, "MAR-CLS-MUL-M-P-9594/01-main-bgremoval.jpg"));
    expect(cut.whiteBorderShare).toBeGreaterThanOrEqual(0.9);
    expect(cut.touchesEdge).toBe(true);
    expect(cut.compliant).toBe(false);
  });

  it("lee las medidas de la cabecera igual que sharp", async () => {
    const sharp = await loadSharp();
    if (!sharp) return;
    const file = path.join(PACK_DIR, "MAR-CLS-MUL-M-P-9594/01-main-bgremoval.jpg");
    const header = readImageHeader(new Uint8Array(readFileSync(file).subarray(0, 64 * 1024)));
    const meta = await sharp(file).metadata();
    expect(header).toEqual({ format: "jpeg", width: meta.width, height: meta.height });
  });
});

describe.skipIf(!existsSync(ORIGINALS_DIR))("fotos originales de la tienda", () => {
  it("las de fondo de color no pasan como portada y su cabecera coincide con sharp", async () => {
    const sharp = await loadSharp();
    if (!sharp) return;
    const files = readdirSync(ORIGINALS_DIR)
      .filter((name) => /\.jpe?g$/i.test(name))
      .sort()
      .slice(0, 3);
    for (const name of files) {
      const file = path.join(ORIGINALS_DIR, name);
      const header = readImageHeader(new Uint8Array(readFileSync(file).subarray(0, 64 * 1024)));
      const meta = await sharp(file).metadata();
      expect(header).toEqual({ format: "jpeg", width: meta.width, height: meta.height });
      const result = await decode(sharp, file);
      expect(result.whiteBorderShare).toBeLessThan(0.9);
      expect(result.reasons).toEqual(["El fondo de la portada no es blanco."]);
    }
  });
});
