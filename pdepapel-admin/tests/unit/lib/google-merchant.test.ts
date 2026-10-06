import {
  GOOGLE_MERCHANT_EXCLUDED_DESTINATIONS,
  GOOGLE_MERCHANT_STRIPPED_DISCLAIMERS,
  getGoogleMerchantColor,
  getGoogleMerchantDescription,
  getGoogleMerchantPattern,
  getGoogleMerchantProductLink,
  getGoogleMerchantSize,
  toGoogleMerchantImageUrl,
} from "@/lib/google-merchant";
import { describe, expect, it } from "vitest";

describe("Google Merchant product attributes", () => {
  it("does not export internal logistics codes as a product size", () => {
    expect(
      getGoogleMerchantSize("Manualidades", { name: "M+", value: "M-P" }),
    ).toBe("");
  });

  it("exports a real customer-facing measurement using the display name", () => {
    expect(
      getGoogleMerchantSize("Cuadernos", { name: "A5", value: "A5" }),
    ).toBe("A5");
  });

  it("uses the human-readable letter size for a category where size matters", () => {
    expect(getGoogleMerchantSize("Ropa", { name: "M", value: "M-P" })).toBe(
      "M",
    );
  });

  it("omits operational color and design values that the public title does not confirm", () => {
    const title = "Troqueles de figuras en maletín x8 de 1 cm";

    expect(getGoogleMerchantColor(title, { name: "Pastel" })).toBe("");
    expect(getGoogleMerchantPattern(title, { name: "Clásico" })).toBe("");
  });

  it("exports color and design when the public title confirms them", () => {
    const title = "Agenda Hello Kitty rosa";

    expect(getGoogleMerchantColor(title, { name: "Rosa" })).toBe("Rosa");
    expect(getGoogleMerchantPattern(title, { name: "Hello Kitty" })).toBe(
      "Hello Kitty",
    );
  });
});

describe("Google Merchant feed links and images", () => {
  it("links to the Spanish canonical product page by slug, falling back to the id", () => {
    expect(getGoogleMerchantProductLink({ id: "p1", slug: "agenda-a5" })).toBe(
      "https://papeleriapdepapel.com/producto/agenda-a5",
    );
    expect(getGoogleMerchantProductLink({ id: "p1", slug: null })).toBe(
      "https://papeleriapdepapel.com/producto/p1",
    );
  });

  /** Los rastreadores de catálogo (sin Referer) bajaban el original completo de cada foto. */
  it("serves supported Cloudinary formats as the sized copy, format kept", () => {
    const base = "https://res.cloudinary.com/pdepapel/image/upload/";
    expect(toGoogleMerchantImageUrl(`${base}v1/products/agenda.jpg`)).toBe(`${base}c_limit%2Cw_1600%2Cq_auto/v1/products/agenda.jpg`);
    expect(toGoogleMerchantImageUrl(`${base}v1/products/agenda.PNG`)).toBe(`${base}c_limit%2Cw_1600%2Cq_auto/v1/products/agenda.PNG`);
    // Una transformación previa se reemplaza, nunca se encadena.
    expect(toGoogleMerchantImageUrl(`${base}f_auto,q_auto,c_limit,w_640/v1/products/agenda.jpg?x=1`)).toBe(
      `${base}c_limit%2Cw_1600%2Cq_auto/v1/products/agenda.jpg`,
    );
    expect(toGoogleMerchantImageUrl(`${base}c_limit,w_640/agenda.jpg`)).toBe(`${base}c_limit%2Cw_1600%2Cq_auto/agenda.jpg`);
    // `additional_image_link` separa URL con coma: ninguna coma literal dentro de la URL.
    expect(toGoogleMerchantImageUrl(`${base}v1/products/agenda.jpg`)).not.toContain(",");
  });

  it("re-requests unsupported Cloudinary formats as PNG", () => {
    expect(
      toGoogleMerchantImageUrl(
        "https://res.cloudinary.com/pdepapel/image/upload/v1/products/agenda.webp",
      ),
    ).toBe(
      "https://res.cloudinary.com/pdepapel/image/upload/c_limit%2Cw_1600%2Cq_auto/v1/products/agenda.png",
    );
    expect(
      toGoogleMerchantImageUrl(
        "https://res.cloudinary.com/pdepapel/image/upload/v1/products/agenda.avif",
      ),
    ).toBe(
      "https://res.cloudinary.com/pdepapel/image/upload/c_limit%2Cw_1600%2Cq_auto/v1/products/agenda.png",
    );
    expect(
      toGoogleMerchantImageUrl(
        "https://res.cloudinary.com/pdepapel/image/upload/v1/products/agenda",
      ),
    ).toBe(
      "https://res.cloudinary.com/pdepapel/image/upload/c_limit%2Cw_1600%2Cq_auto/v1/products/agenda.png",
    );
  });

  it("leaves non-Cloudinary and empty URLs alone", () => {
    expect(toGoogleMerchantImageUrl("https://cdn.example.com/foto.webp")).toBe(
      "https://cdn.example.com/foto.webp",
    );
    expect(toGoogleMerchantImageUrl("")).toBe("");
    expect(toGoogleMerchantImageUrl(null)).toBe("");
  });

  it("excludes only the local destinations for an online-only store", () => {
    expect([...GOOGLE_MERCHANT_EXCLUDED_DESTINATIONS]).toEqual([
      "Local_inventory_ads",
      "Free_local_listings",
    ]);
  });
});

describe("Google Merchant description", () => {
  it("flattens the stored rich-text HTML into plain text", () => {
    expect(
      getGoogleMerchantDescription(
        "<p>Agenda <strong>A5</strong> con portada acolchada.</p><ul><li>Hojas decoradas</li><li>Cinta &amp; separador</li></ul>",
        "Agenda A5",
      ),
    ).toBe(
      "Agenda A5 con portada acolchada. Hojas decoradas Cinta & separador",
    );
  });

  it("falls back to the product name and respects the length cap", () => {
    expect(getGoogleMerchantDescription(null, "  Agenda A5 ")).toBe(
      "Agenda A5",
    );
    expect(
      getGoogleMerchantDescription("<p>" + "a".repeat(6000) + "</p>", "x"),
    ).toHaveLength(5000);
  });
});

describe("los avisos de marca no llegan al feed", () => {
  const PLURAL = "Son bloques de construcción estilo Lego. No son productos de LEGO ni están afiliados a LEGO Group.";
  const TAJALAPIZ = "Es un tajalápiz estilo Lego. No es un producto de LEGO ni está afiliado a LEGO Group.";
  const FIGURA = "La figura de bloques es estilo Lego. No es un producto de LEGO ni está afiliada a LEGO Group.";

  it("son las tres frases exactas que usa el guion de renombrado", () => {
    expect([...GOOGLE_MERCHANT_STRIPPED_DISCLAIMERS]).toEqual([PLURAL, TAJALAPIZ, FIGURA]);
  });

  it("quita el aviso plural de la categoría y deja el resto del texto", () => {
    expect(
      getGoogleMerchantDescription(
        `<p>Set de bloques de construcción para armar una figura de Batman. Una vez armada, queda lista para exhibir en el escritorio, en la repisa o junto a tu colección.</p><p>${PLURAL}</p>`,
        "Bloques de construcción Batman",
      ),
    ).toBe(
      "Set de bloques de construcción para armar una figura de Batman. Una vez armada, queda lista para exhibir en el escritorio, en la repisa o junto a tu colección.",
    );
    expect(
      getGoogleMerchantDescription(
        `Juego de fichas en forma de Garfield. ${PLURAL}`,
        "Bloques de construcción Garfield",
      ),
    ).toBe("Juego de fichas en forma de Garfield.");
  });

  it("quita las variantes en singular (tajalápiz y figura de bloques)", () => {
    expect(
      getGoogleMerchantDescription(
        `Tajalápiz de bloques en forma de animalitos: Tucán y Jirafa. ${TAJALAPIZ}`,
        "Tajalápiz de bloques",
      ),
    ).toBe("Tajalápiz de bloques en forma de animalitos: Tucán y Jirafa.");
    expect(
      getGoogleMerchantDescription(
        `Nuestro Kit Stitch incluye:\n🧩 Figura de bloques de colección\n${FIGURA}`,
        "Kit Stitch 3",
      ),
    ).toBe("Nuestro Kit Stitch incluye: 🧩 Figura de bloques de colección");
  });

  it("si la descripción es solo el aviso, el feed usa el nombre y no el aviso", () => {
    for (const description of [PLURAL, `<p>${PLURAL}</p>`, `  ${TAJALAPIZ}  `]) {
      const text = getGoogleMerchantDescription(description, " Bloques de construcción Nezuko ");
      expect(text).toBe("Bloques de construcción Nezuko");
      expect(text).not.toMatch(/lego/i);
    }
  });

  it("una descripción sin aviso queda igual, aunque mencione la marca de otra forma", () => {
    expect(
      getGoogleMerchantDescription("<p>Agenda <strong>A5</strong>  con portada.</p>", "Agenda"),
    ).toBe("Agenda A5 con portada.");
    expect(getGoogleMerchantDescription("Compatible con piezas estilo Lego.", "x")).toBe(
      "Compatible con piezas estilo Lego.",
    );
  });
});
