import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GIFT_CARD_IMAGE_PATH, buildGiftCardJsonLd } from "@/lib/gift-card-schema";

const file = readFileSync(join(__dirname, "../../../public", GIFT_CARD_IMAGE_PATH));

/** Ancho y alto de un WebP con cabecera VP8X (la que lleva metadatos XMP). */
const webpSize = (buffer: Buffer) => {
  expect(buffer.subarray(0, 4).toString("latin1")).toBe("RIFF");
  expect(buffer.subarray(8, 12).toString("latin1")).toBe("WEBP");
  expect(buffer.subarray(12, 16).toString("latin1")).toBe("VP8X");
  return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
};

describe("gift card structured data", () => {
  it("declares the gift card photo as an absolute image URL", () => {
    const jsonLd = buildGiftCardJsonLd([50000, 100000], "Tarjeta de regalo") as Record<string, any>;
    expect(jsonLd.image).toEqual([`https://papeleriapdepapel.com${GIFT_CARD_IMAGE_PATH}`]);
    expect(jsonLd.offers.map((offer: { price: number }) => offer.price)).toEqual([50000, 100000]);
    expect(jsonLd.url).toBe("https://papeleriapdepapel.com/tarjeta-regalo");
  });

  it("ships a 1200x1200 WebP that keeps its AI-generated provenance tag", () => {
    expect(webpSize(file)).toEqual({ width: 1200, height: 1200 });
    // Google Merchant: las imágenes generadas con IA deben conservar
    // IPTC DigitalSourceType = trainedAlgorithmicMedia.
    const xmp = file.toString("latin1");
    expect(xmp).toContain("Iptc4xmpExt:DigitalSourceType");
    expect(xmp).toContain("http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia");
  });
});
