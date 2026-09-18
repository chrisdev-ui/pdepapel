import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import cloudinaryImageLoader, {
  CLOUDINARY_DELIVERY_WIDTHS,
  CLOUDINARY_MAX_WIDTH,
  getCloudinaryImageUrl,
  isCloudinaryUrl,
  snapCloudinaryWidth,
} from "@/lib/cloudinary-image-loader";

const IMAGE_URL = "https://res.cloudinary.com/demo/image/upload/v1785967604/product.jpg";
const widthOf = (url: string) => Number(url.match(/w_(\d+)\//)?.[1]);

describe("cloudinaryImageLoader", () => {
  it("delivers catalog photos through one automatic transformation at an allowed width", () => {
    expect(cloudinaryImageLoader({ src: IMAGE_URL, width: 128 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_128/v1785967604/product.jpg",
    );
  });

  it("ignores the numeric quality and caps the width", () => {
    expect(cloudinaryImageLoader({ src: IMAGE_URL, width: 256, quality: 75 })).toBe(
      cloudinaryImageLoader({ src: IMAGE_URL, width: 256 }),
    );
    expect(cloudinaryImageLoader({ src: IMAGE_URL, width: 4000 })).toContain(`w_${CLOUDINARY_MAX_WIDTH}/`);
  });

  /**
   * El incidente de 2026-09: nueve anchos por foto, cada uno una copia y una
   * transformación. Cualquier ancho que pida next/image (o un srcset raro) se
   * redondea a la lista corta; ninguna URL puede salirse de ella.
   */
  it("only ever requests one of the allowed widths, whatever width next/image asks for", () => {
    const allowed = new Set<number>(CLOUDINARY_DELIVERY_WIDTHS);
    for (let width = 1; width <= 4000; width += 7) {
      const url = getCloudinaryImageUrl(IMAGE_URL, width);
      expect(allowed.has(widthOf(url)), `width ${width} → ${url}`).toBe(true);
    }
    expect(snapCloudinaryWidth(64)).toBe(128);
    expect(snapCloudinaryWidth(129)).toBe(384);
    expect(snapCloudinaryWidth(750)).toBe(1080);
    expect(snapCloudinaryWidth(1601)).toBe(1600);
  });

  it("keeps next.config inside the allowed widths", () => {
    const config = readFileSync(new URL("../../../next.config.mjs", import.meta.url), "utf8");
    const configured = Array.from(config.matchAll(/(?:deviceSizes|imageSizes):\s*\[([^\]]+)\]/g)).flatMap((match) =>
      match[1].split(",").map((value: string) => Number(value.trim())),
    );
    expect(configured.length).toBeGreaterThan(0);
    for (const width of configured) expect(CLOUDINARY_DELIVERY_WIDTHS).toContain(width);
  });

  it("replaces previous transformations instead of chaining them", () => {
    expect(
      getCloudinaryImageUrl(
        "https://res.cloudinary.com/demo/image/upload/c_limit,w_384/f_auto/q_auto/v1785967604/product.jpg?x=1",
        128,
      ),
    ).toBe("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_128/v1785967604/product.jpg");
  });

  it("leaves placeholders, carrier logos, data urls and videos untouched", () => {
    for (const src of [
      "/placeholder.png",
      "/images/placeholder_1.png",
      "https://www.envioclickpro.com.co/img/register/logo_solo.svg",
      "data:image/png;base64,AAAA",
      "https://res.cloudinary.com/demo/video/upload/v1/clip.mp4",
    ]) {
      expect(cloudinaryImageLoader({ src, width: 64 })).toBe(src);
    }
    expect(isCloudinaryUrl(IMAGE_URL)).toBe(true);
    expect(isCloudinaryUrl("/placeholder.png")).toBe(false);
  });
});
