/* @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import {
  buildProductCanonicalUrl,
  buildProductMetaDescription,
  buildProductMetaTitle,
  syncProductDocumentMetadata,
} from "@/lib/product-metadata";
import type { Product } from "@/types";

const product = (overrides: Partial<Product> = {}) =>
  ({
    id: "p1",
    slug: "llavero-osito-blanco",
    name: "Llavero Osito Blanco",
    price: "9000",
    description: "",
    design: { id: "d1", name: "Osito" },
    color: { id: "c1", name: "Blanco" },
    ...overrides,
  }) as unknown as Product;

const mafalda = product({
  id: "m1",
  slug: "lapices-mafalda-x6",
  name: "Lapices Mafalda x6",
  design: { id: "d-maf", name: "Mafalda" },
  color: { id: "c-mul", name: "Multicolor" },
} as unknown as Partial<Product>);
const snoopy = product({
  id: "m2",
  slug: "lapices-snoopy-x6",
  name: "Lapices x6",
  design: { id: "d-sno", name: "Snoopy" },
  color: { id: "c-mul", name: "Multicolor" },
} as unknown as Partial<Product>);

describe("buildProductMetaTitle", () => {
  it("drops the attribute suffix on a single product and adds the brand when it fits", () => {
    // Antes: «Block iris x35 hojas - Clásico, Multicolor» (286 impresiones, 2 clics).
    const blockIris = product({
      name: "Block iris x35 hojas",
      design: { id: "d", name: "Clásico" },
      color: { id: "c", name: "Multicolor" },
    } as unknown as Partial<Product>);
    expect(buildProductMetaTitle(blockIris)).toBe("Block iris x35 hojas | P de Papel");
  });

  it("names only what distinguishes a variant, and only if the name does not say it already", () => {
    const siblings = [mafalda, snoopy];
    // El diseño ya está en el nombre: no se repite.
    expect(buildProductMetaTitle(mafalda, siblings)).toBe("Lapices Mafalda x6 | P de Papel");
    // Aquí el nombre no lo dice: se añade solo el diseño; el color compartido no.
    expect(buildProductMetaTitle(snoopy, siblings)).toBe("Lapices x6 - Snoopy | P de Papel");
  });

  it("gives every sibling a different title", () => {
    const rosa = product({ id: "r", name: "Carpeta plástica oficio", color: { id: "c1", name: "Rosado" } } as unknown as Partial<Product>);
    const verde = product({ id: "v", name: "Carpeta plástica oficio", color: { id: "c2", name: "Verde pastel" } } as unknown as Partial<Product>);
    const titles = [rosa, verde].map((variant) => buildProductMetaTitle(variant, [rosa, verde]));
    expect(new Set(titles).size).toBe(2);
    expect(titles).toEqual(["Carpeta plástica oficio - Rosado | P de Papel", "Carpeta plástica oficio - Verde pastel | P de Papel"]);
  });

  it("leaves the brand out when the title would pass 60 characters", () => {
    const long = product({ name: "Marcador acrílico punta pincel profesional GIPAO X12" } as unknown as Partial<Product>);
    expect(buildProductMetaTitle(long)).toBe("Marcador acrílico punta pincel profesional GIPAO X12");
  });

  it("ignores the internal shipping size when deciding what varies", () => {
    const small = product({ id: "a", size: { id: "s1", name: "S", value: "S" } } as unknown as Partial<Product>);
    const medium = product({ id: "b", size: { id: "s2", name: "M", value: "M" } } as unknown as Partial<Product>);
    expect(buildProductMetaTitle(small, [small, medium])).toBe("Llavero Osito Blanco | P de Papel");
  });
});

describe("buildProductMetaDescription", () => {
  it("uses real price and shipping instead of the generic fallback when there is no description", () => {
    const description = buildProductMetaDescription(product({ name: "Block iris x35 hojas", price: "6000" } as unknown as Partial<Product>), {
      freeShippingThreshold: 250000,
    });
    expect(description).toMatch(/^Block iris x35 hojas por \$\s?6\.000 en Papelería P de Papel\. Envío a toda Colombia, gratis desde \$\s?250\.000\.$/);
    expect(description).not.toContain("Descubre");
  });

  it("keeps the product's own text and stays within 160 characters", () => {
    const text = `<p>${"Cuaderno argollado de 160 hojas cuadriculadas con diseño variado. ".repeat(4)}</p>`;
    const description = buildProductMetaDescription(product({ description: text } as unknown as Partial<Product>));
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description.startsWith("Cuaderno argollado")).toBe(true);
  });

  it("gives sibling variants different descriptions even when they share the text", () => {
    const shared = "<p>Carpeta plástica tamaño oficio con cierre de botón.</p>";
    const rosa = product({ id: "r", description: shared, color: { id: "c1", name: "Rosado" } } as unknown as Partial<Product>);
    const verde = product({ id: "v", description: shared, color: { id: "c2", name: "Verde pastel" } } as unknown as Partial<Product>);
    const [a, b] = [rosa, verde].map((variant) => buildProductMetaDescription(variant, { siblings: [rosa, verde] }));
    expect(a).not.toBe(b);
    expect(b.startsWith("Verde pastel. Carpeta plástica")).toBe(true);
  });
});

/** La plantilla del layout ya añade « | Papelería P de Papel»: nadie la repite. */
describe("page titles do not repeat the brand", () => {
  const source = (path: string) => readFileSync(join(__dirname, "../../../app/(routes)", path), "utf8");

  it.each([
    // [archivo, título esperado, título prohibido (con la marca que ya pone la plantilla)]
    ["nosotros/page.tsx", /^  title: "Nuestra historia",$/m, /^  title: ".*P de Papel",$/m],
    ["tienda/page.tsx", /^    title,$/m, /^    title: `\$\{title\} \| P de Papel`,$/m],
    ["boletin/[slug]/page.tsx", /title: `\$\{issue\.title\} \| Boletín`,/, /Boletín P de Papel/],
  ])("%s", (path, expected, forbidden) => {
    const file = source(path);
    expect(file).toMatch(expected);
    expect(file).not.toMatch(forbidden);
  });
});

describe("buildProductCanonicalUrl", () => {
  it("is absolute, like the tag the server writes", () => {
    expect(buildProductCanonicalUrl(product())).toBe(
      "https://papeleriapdepapel.com/producto/llavero-osito-blanco",
    );
  });

  it("falls back to the id when a product has no slug", () => {
    expect(buildProductCanonicalUrl(product({ slug: undefined }))).toBe(
      "https://papeleriapdepapel.com/producto/p1",
    );
  });
});

describe("syncProductDocumentMetadata", () => {
  beforeEach(() => {
    document.head.innerHTML = `
      <title>Viejo</title>
      <link rel="canonical" href="https://papeleriapdepapel.com/producto/viejo" />
      <meta property="og:title" content="Viejo" />
      <meta property="og:url" content="https://papeleriapdepapel.com/producto/viejo" />
      <meta name="twitter:title" content="Viejo" />
    `;
  });

  const head = () => ({
    title: document.title,
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute("content"),
    ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute("content"),
    twitterTitle: document.querySelector('meta[name="twitter:title"]')?.getAttribute("content"),
  });

  it("moves every title and url tag onto the variant being shown, with the same title the server renders", () => {
    syncProductDocumentMetadata(snoopy, [mafalda, snoopy]);

    expect(head()).toEqual({
      title: buildProductMetaTitle(snoopy, [mafalda, snoopy]),
      canonical: "https://papeleriapdepapel.com/producto/lapices-snoopy-x6",
      ogTitle: "Lapices x6 - Snoopy | P de Papel",
      ogUrl: "https://papeleriapdepapel.com/producto/lapices-snoopy-x6",
      twitterTitle: "Lapices x6 - Snoopy | P de Papel",
    });
  });

  it("tracks every switch, not just the first one", () => {
    syncProductDocumentMetadata(mafalda, [mafalda, snoopy]);
    syncProductDocumentMetadata(snoopy, [mafalda, snoopy]);
    syncProductDocumentMetadata(mafalda, [mafalda, snoopy]);

    expect(head().title).toBe("Lapices Mafalda x6 | P de Papel");
    expect(head().canonical).toBe("https://papeleriapdepapel.com/producto/lapices-mafalda-x6");
  });

  it("does not blow up when a tag is missing from the head", () => {
    document.head.innerHTML = "<title>Solo el título</title>";

    expect(() => syncProductDocumentMetadata(product())).not.toThrow();
    expect(document.title).toBe("Llavero Osito Blanco | P de Papel");
  });
});
