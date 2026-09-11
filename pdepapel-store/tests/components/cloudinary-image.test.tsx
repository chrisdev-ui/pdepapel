/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CloudinaryImage } from "@/components/ui/cloudinary-image";

const PHOTO = "https://res.cloudinary.com/demo/image/upload/v1785967604/product.jpg";

/** Las URL llevan comas, así que el srcset se separa por candidato y no por coma. */
function parseSrcSet(element: HTMLElement) {
  return Array.from((element.getAttribute("srcset") ?? "").matchAll(/(\S+) (\d+[xw])/g)).map(([, url, descriptor]) => ({
    url,
    descriptor,
    width: Number(url.match(/w_(\d+)\//)?.[1]),
  }));
}

afterEach(cleanup);

describe("CloudinaryImage", () => {
  it("serves fixed thumbnails straight from Cloudinary with only 1x and 2x candidates", () => {
    render(<CloudinaryImage src={PHOTO} alt="Miniatura" width={64} height={64} />);

    const image = screen.getByAltText("Miniatura");

    expect(parseSrcSet(image)).toEqual([
      { url: "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_64/v1785967604/product.jpg", descriptor: "1x", width: 64 },
      { url: "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_128/v1785967604/product.jpg", descriptor: "2x", width: 128 },
    ]);
    expect(image.getAttribute("src")).toContain("/image/upload/f_auto,q_auto,c_limit,w_128/");
    expect(image.getAttribute("src")).not.toContain("/_next/image");
  });

  it("never asks Cloudinary for more than the capped width", () => {
    render(<CloudinaryImage src={PHOTO} alt="Portada" fill sizes="100vw" />);

    const widths = parseSrcSet(screen.getByAltText("Portada")).map((candidate) => candidate.width);

    expect(widths.length).toBeGreaterThan(1);
    expect(Math.max(...widths)).toBe(1600);
  });

  it("leaves local images to Next as they are", () => {
    render(<CloudinaryImage src="/images/logo.webp" alt="Logo" width={64} height={64} />);

    expect(screen.getByAltText("Logo").getAttribute("src")).toBe("/images/logo.webp");
  });
});
