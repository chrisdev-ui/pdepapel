import { describe, expect, it } from "vitest";

import { socialAriaLabel, STORE_FACEBOOK_URL, STORE_SOCIAL_LINKS, STORE_YOUTUBE_URL } from "@/lib/social-links";

describe("redes de la tienda", () => {
  it("son las cuatro, en el orden de la tienda, con las direcciones exactas", () => {
    expect(STORE_SOCIAL_LINKS.map((link) => [link.label, link.url])).toEqual([
      ["Instagram", "https://instagram.com/papeleria.pdepapel"],
      ["TikTok", "https://tiktok.com/@papeleria.pdepapel"],
      ["Facebook", "https://www.facebook.com/papeleriapdepapel/"],
      ["YouTube", "https://www.youtube.com/@papeleriapdepapel"],
    ]);
    expect(STORE_FACEBOOK_URL.endsWith("/")).toBe(true);
    expect(STORE_YOUTUBE_URL).toBe("https://www.youtube.com/@papeleriapdepapel");
    expect(socialAriaLabel("Facebook")).toBe("Facebook de P de Papel");
  });
});
