/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Hero } from "@/components/home/hero";
import { CLOUDINARY_DELIVERY_WIDTHS, CLOUDINARY_MAX_WIDTH } from "@/lib/cloudinary-loader";
import type { HomeContent } from "@/types";

const PHOTO = "https://res.cloudinary.com/demo/image/upload/v1768606944/portada.webp";

const content = (imageUrl: string): HomeContent => ({
  id: "hero-1",
  placement: "HERO" as HomeContent["placement"],
  campaignType: null,
  eyebrow: null,
  title: "Papelería bonita",
  subtitle: null,
  primaryLabel: "Ver la tienda",
  primaryUrl: "/tienda",
  secondaryLabel: null,
  secondaryUrl: null,
  imageUrl,
  imageAlt: "Portada",
  startsAt: "2026-09-01T00:00:00.000Z",
  endsAt: null,
  products: [],
});

/** Las URL llevan comas: el srcset se separa por candidato, no por coma. */
function candidates(element: HTMLElement) {
  return Array.from((element.getAttribute("srcset") ?? "").matchAll(/(\S+) (\d+[xw])/g)).map(([, url]) => url);
}

afterEach(cleanup);

/**
 * La portada era `c_limit,w_3840/c_limit,w_3840/…` en el informe de entrega
 * de Cloudinary de 2026-09: la foto más pesada del sitio, pedida a 3840 px y
 * con el recorte encadenado dos veces. Ahora solo puede salir de la lista de
 * anchos permitidos y con una única transformación.
 */
describe("Hero image", () => {
  it("requests the hero only at approved widths, never above the cap, with one transformation", () => {
    render(<Hero content={content(PHOTO)} freeShippingThreshold={null} />);

    const image = screen.getByAltText("Portada");
    const urls = [image.getAttribute("src") ?? "", ...candidates(image)];

    expect(urls.length).toBeGreaterThan(1);
    for (const url of urls) {
      const width = Number(url.match(/w_(\d+)\//)?.[1]);
      expect(CLOUDINARY_DELIVERY_WIDTHS, url).toContain(width);
      expect(width).toBeLessThanOrEqual(CLOUDINARY_MAX_WIDTH);
      expect(url.match(/c_limit/g)?.length, url).toBe(1);
      expect(url.match(/w_\d+/g)?.length, url).toBe(1);
      expect(url).toContain("/v1768606944/portada.webp");
    }
    expect(image.getAttribute("fetchpriority")).toBe("high");
  });

  it("cleans a stored url that already carried a transformation instead of chaining it", () => {
    render(
      <Hero
        content={content("https://res.cloudinary.com/demo/image/upload/c_limit,w_3840/c_limit,w_3840/f_auto/q_auto/portada.webp")}
        freeShippingThreshold={null}
      />,
    );

    for (const url of candidates(screen.getByAltText("Portada"))) {
      expect(url.match(/c_limit/g)?.length, url).toBe(1);
      expect(Number(url.match(/w_(\d+)\//)?.[1])).toBeLessThanOrEqual(CLOUDINARY_MAX_WIDTH);
      expect(url.endsWith("/portada.webp")).toBe(true);
    }
  });

  it("renders the pastel placeholder box when there is no hero photo", () => {
    render(<Hero content={content("")} freeShippingThreshold={null} />);
    expect(screen.queryByAltText("Portada")).toBeNull();
  });
});
