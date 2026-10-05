import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_SHARE_IMAGE } from "@/constants";

const root = join(__dirname, "../../..");

/** Ancho y alto de un JPEG leídos de su marcador SOF, sin dependencias. */
function jpegSize(file: string) {
  const bytes = readFileSync(file);
  for (let offset = 2; offset < bytes.length; ) {
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error(`${file} no es un JPEG legible`);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

/**
 * Inicio y /tienda anunciaban `/opengraph-image.png`, que no existe: las vistas
 * previas de WhatsApp, Facebook e Instagram recibían un 404 (2026-10-05).
 */
describe("share images", () => {
  it("serves the default share image as a small 1200×630 file", () => {
    const file = join(root, "public", DEFAULT_SHARE_IMAGE.url);

    expect(jpegSize(file)).toEqual({ width: 1200, height: 630 });
    expect(statSync(file).size).toBeLessThan(100 * 1024);
  });

  it("only points page metadata at local images that exist", () => {
    const missing = sourceFiles(join(root, "app"))
      .flatMap((file) =>
        Array.from(readFileSync(file, "utf8").matchAll(/["'](\/(?:images\/)?[\w./-]+\.(?:png|jpe?g|webp))["']/g)).map(
          ([, url]) => ({ file: file.replace(root, ""), url }),
        ),
      )
      .filter(({ url }) => !existsSync(join(root, "public", url)) && !existsSync(join(root, "app", url)));

    expect(missing).toEqual([]);
  });
});
