import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ORGANIZATION_ID, organizationSchema } from "@/lib/organization-schema";
import { buildProductJsonLd } from "@/lib/product-schema";
import type { Product } from "@/types";

const page = (path: string) => readFileSync(join(__dirname, "../../../app/(routes)", path), "utf8");

/** Una sola organización: antes inicio, nosotros y contacto declaraban datos distintos. */
describe("organization structured data", () => {
  it("carries the published contact data, the Medellín address and the social profiles", () => {
    expect(organizationSchema).toMatchObject({
      "@id": ORGANIZATION_ID,
      name: "Papelería P de Papel",
      address: { addressLocality: "Medellín", addressRegion: "Antioquia", addressCountry: "CO" },
      contactPoint: { telephone: "+57-313-258-2293", email: "papeleria.pdepapel@gmail.com" },
    });
    expect(organizationSchema.sameAs).toHaveLength(2);
  });

  it("uses the same email the contact page publishes", () => {
    expect(page("contacto/page.tsx")).toContain(organizationSchema.email);
  });

  it.each(["page.tsx", "nosotros/page.tsx", "contacto/page.tsx"])("%s uses the shared organization", (path) => {
    const source = page(path);
    expect(source).toContain("organizationSchema");
    expect(source).not.toMatch(/"@type": "Organization"/);
  });
});

describe("ProductGroup brand", () => {
  const base = { description: "", price: "8000", stock: 3, images: [], reviews: [], productGroupId: "g" } as unknown as Product;
  const variant = (id: string, color: string, brand?: string) =>
    ({ ...base, id, slug: id, name: `Carpeta ${color}`, sku: id, brand, color: { id: color, name: color, value: "#000" } }) as unknown as Product;

  it("names the brand only when every variant shares it", () => {
    const shared = [variant("a", "Verde", "Klipp"), variant("b", "Azul", "Klipp")];
    expect(buildProductJsonLd(shared[0], shared)).toMatchObject({ "@type": "ProductGroup", brand: { "@type": "Brand", name: "Klipp" } });

    const mixed = [variant("a", "Verde", "Klipp"), variant("b", "Azul", "Norma")];
    expect((buildProductJsonLd(mixed[0], mixed) as Record<string, unknown>).brand).toBeUndefined();
  });
});
