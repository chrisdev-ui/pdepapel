import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CLOUDINARY_DELIVERY_WIDTHS, CLOUDINARY_MAX_WIDTH, cloudinaryLoader, getCloudinaryImageUrl, isCloudinaryUrl, snapCloudinaryWidth } from "@/lib/cloudinary-loader";

const IMAGE_URL = "https://res.cloudinary.com/demo/image/upload/v1785967604/product.jpg";
const widthOf = (url: string) => Number(url.match(/w_(\d+)\//)?.[1]);

describe("cloudinaryLoader", () => {
  it("builds one delivery transformation with automatic format and quality", () => {
    expect(cloudinaryLoader({ src: IMAGE_URL, width: 640 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_640/v1785967604/product.jpg",
    );
  });

  it("ignores the numeric quality so every view shares the same derived copy", () => {
    expect(cloudinaryLoader({ src: IMAGE_URL, width: 640, quality: 75 })).toBe(cloudinaryLoader({ src: IMAGE_URL, width: 640 }));
  });

  it("caps the requested width so oversized srcset entries reuse one copy", () => {
    expect(cloudinaryLoader({ src: IMAGE_URL, width: 3840 })).toBe(
      `https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_${CLOUDINARY_MAX_WIDTH}/v1785967604/product.jpg`,
    );
  });

  /** Nueve anchos por foto fueron el incidente de 2026-09: la lista corta es la única salida posible. */
  it("only ever requests one of the allowed widths, whatever width next/image asks for", () => {
    const allowed = new Set<number>(CLOUDINARY_DELIVERY_WIDTHS);
    for (let width = 1; width <= 4000; width += 7) {
      expect(allowed.has(widthOf(getCloudinaryImageUrl(IMAGE_URL, width))), `width ${width}`).toBe(true);
    }
    expect(snapCloudinaryWidth(56)).toBe(128);
    expect(snapCloudinaryWidth(500)).toBe(640);
    expect(snapCloudinaryWidth(720)).toBe(1080);
    expect(CLOUDINARY_DELIVERY_WIDTHS).toEqual([128, 384, 640, 1080, 1600]);
  });

  it("keeps next.config inside the allowed widths", () => {
    const config = readFileSync(new URL("../../../next.config.mjs", import.meta.url), "utf8");
    const configured = Array.from(config.matchAll(/(?:deviceSizes|imageSizes):\s*\[([^\]]+)\]/g)).flatMap((match) =>
      match[1].split(",").map((value: string) => Number(value.trim())),
    );
    expect(configured.length).toBeGreaterThan(0);
    for (const width of configured) expect(CLOUDINARY_DELIVERY_WIDTHS).toContain(width);
  });

  it("keeps folders after the version segment", () => {
    expect(cloudinaryLoader({ src: "https://res.cloudinary.com/demo/image/upload/v1/category-covers/pic.jpg", width: 384 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_384/v1/category-covers/pic.jpg",
    );
  });

  it("replaces previous transformations and query strings instead of chaining them", () => {
    expect(
      cloudinaryLoader({
        src: "https://res.cloudinary.com/demo/image/upload/c_limit,w_384/c_limit,w_384/f_auto/q_auto/v1785967604/product.jpg?_a=old",
        width: 512,
      }),
    ).toBe("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_640/v1785967604/product.jpg");
  });

  /**
   * Informe de entrega de 2026-09: `c_limit,w_3840/c_limit,w_3840/f_auto/q_auto`
   * era el cuarto consumidor de ancho de banda. Sin versión en la URL, la
   * transformación previa se quedaba y la nuestra se encadenaba encima.
   */
  it("drops a previous transformation even when the url has no version segment", () => {
    const base = "https://res.cloudinary.com/demo/image/upload/";
    for (const legacy of [
      "c_limit,w_3840/c_limit,w_3840/f_auto/q_auto/product.jpg",
      "f_auto,q_auto:eco,c_limit,w_3840/product.jpg",
      "c_limit,w_640/product.jpg",
      "e_blur:300,q_auto/t_named/category-covers/pic.jpg",
    ]) {
      const url = getCloudinaryImageUrl(base + legacy, 640);
      expect(url, legacy).toBe(`${base}f_auto,q_auto,c_limit,w_640/${legacy.split("/").slice(-1 - (legacy.includes("category-covers") ? 1 : 0)).join("/")}`);
      expect(url.match(/c_limit/g)?.length).toBe(1);
      expect(url.match(/w_\d+/g)?.length).toBe(1);
    }
    // Una carpeta con guion bajo no es una transformación.
    expect(getCloudinaryImageUrl(`${base}ml_fotos/foto.png`, 640)).toBe(`${base}f_auto,q_auto,c_limit,w_640/ml_fotos/foto.png`);
  });

  it("inserts the transformation when the url has no version segment", () => {
    expect(cloudinaryLoader({ src: "https://res.cloudinary.com/demo/image/upload/product.jpg", width: 256 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_384/product.jpg",
    );
  });

  it("leaves local and third-party images untouched", () => {
    expect(cloudinaryLoader({ src: "/images/logo.webp", width: 120 })).toBe("/images/logo.webp");
    expect(cloudinaryLoader({ src: "https://example.com/product.jpg", width: 768 })).toBe("https://example.com/product.jpg");
    expect(cloudinaryLoader({ src: "https://res.cloudinary.com/demo/video/upload/v1/clip.mp4", width: 768 })).toBe(
      "https://res.cloudinary.com/demo/video/upload/v1/clip.mp4",
    );
  });

  it("exposes the url helper and the host check", () => {
    expect(isCloudinaryUrl(IMAGE_URL)).toBe(true);
    expect(isCloudinaryUrl("not a url")).toBe(false);
    expect(getCloudinaryImageUrl(IMAGE_URL, 128)).toContain("w_128/");
  });
});
