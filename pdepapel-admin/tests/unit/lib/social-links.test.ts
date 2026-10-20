import { describe, expect, it } from "vitest";

import { socialLinksLine, STORE_SOCIAL_LINKS } from "@/lib/social-links";

describe("redes de la tienda (panel)", () => {
  it("son las cuatro, en el orden de la tienda, con las direcciones exactas", () => {
    expect(STORE_SOCIAL_LINKS.map((link) => [link.label, link.url])).toEqual([
      ["Instagram", "https://instagram.com/papeleria.pdepapel"],
      ["TikTok", "https://tiktok.com/@papeleria.pdepapel"],
      ["Facebook", "https://www.facebook.com/papeleriapdepapel/"],
      ["YouTube", "https://www.youtube.com/@papeleriapdepapel"],
    ]);
  });

  it("la línea de texto del recibo las nombra todas", () => {
    expect(socialLinksLine()).toBe(
      "Instagram: instagram.com/papeleria.pdepapel · TikTok: tiktok.com/@papeleria.pdepapel · Facebook: facebook.com/papeleriapdepapel · YouTube: youtube.com/@papeleriapdepapel",
    );
  });

  it("es la misma lista que la tienda", async () => {
    const { readFileSync } = await import("node:fs");
    const store = readFileSync(new URL("../../../../pdepapel-store/lib/social-links.ts", import.meta.url), "utf8");
    for (const link of STORE_SOCIAL_LINKS) expect(store).toContain(`url: "${link.url}"`);
  });
});
