import { describe, expect, it } from "vitest";

import { summaryCaption, weeklySummaryText, type WeeklySummaryInput } from "@/lib/social/weekly-summary";

// Jueves 23 de oct. 2026, 10:00 en Bogotá: la semana va del 17 al 23.
const now = new Date("2026-10-23T15:00:00Z");
const post = (overrides: Partial<WeeklySummaryInput["posts"][number]>): WeeklySummaryInput["posts"][number] => ({
  platform: "INSTAGRAM",
  postedAt: "2026-10-21T22:00:00Z",
  caption: "Reel",
  productType: "REELS",
  multiplier: null,
  multiplierApprox: false,
  retentionWarning: false,
  ...overrides,
});
const accounts: WeeklySummaryInput["accounts"] = [
  { platform: "INSTAGRAM", followersDaily: { delta7: 12 } },
  { platform: "TIKTOK", followersDaily: { delta7: null } },
];

describe("resumen semanal para WhatsApp", () => {
  it("texto exacto: publicaciones por red, mejor y más floja, «Qué funciona», seguidores y una recomendación", () => {
    const text = weeklySummaryText(
      {
        accounts,
        posts: [
          post({ caption: "Kit de capibara para el colegio 🦫 ¡ya llegó! Escríbenos al 300 123 4567 o a hola@pdepapel.com https://wa.me/57300", multiplier: 2.4 }),
          post({ caption: "@cliente_feliz Gracias por tu pedido", multiplier: 0.6, multiplierApprox: true }),
          post({ caption: null, productType: "CAROUSEL", multiplier: null, postedAt: "2026-10-17T05:30:00Z" }),
          post({ caption: "Fuera de la semana", multiplier: 9, postedAt: "2026-10-17T04:00:00Z" }),
          post({ platform: "TIKTOK", caption: "Unboxing de stickers", multiplier: null }),
        ],
        whatWorks: [
          { platform: "INSTAGRAM", headline: "En Instagram lo publicado en la tarde va 1,6× la mediana (aprox.).", headlineTentative: true },
          { platform: "TIKTOK", headline: null, headlineTentative: false },
        ],
      },
      now,
    );
    expect(text).toBe(
      [
        "📊 *Resumen de redes · 17 de oct. al 23 de oct.*",
        "",
        "*Instagram* · 3 publicaciones · seguidores +12",
        // Sin teléfono, correo ni enlace, y recortado a 60.
        "⭐ Mejor: «Kit de capibara para el colegio 🦫 ¡ya llegó! Escríbenos al…» · 2,4× la mediana",
        "🐢 Más floja: «Gracias por tu pedido» · 0,6× la mediana (aprox.)",
        "",
        "*TikTok* · 1 publicación · seguidores pocos datos",
        "Todavía sin «× mediana» para comparar (pocos datos).",
        "",
        "💡 *Qué funciona:*",
        "En Instagram lo publicado en la tarde va 1,6× la mediana (aprox.). Todavía es una pista.",
        "",
        "👉 *Para esta semana:* La mejor fue 2,4× la mediana: haz otra parecida esta semana.",
      ].join("\n"),
    );
    // Nada que lleve a un enlace o identifique a alguien.
    expect(text).not.toMatch(/https?:|www\.|@|\d{3}\s?\d{3}\s?\d{4}|token/i);
  });

  it("recorta a 60 caracteres y nombra lo que no tiene texto", () => {
    expect(summaryCaption("a".repeat(80), "REELS")).toBe(`«${"a".repeat(59)}…»`);
    expect(summaryCaption("  ", "CAROUSEL")).toBe("un carrusel");
    expect(summaryCaption("https://x.co @alguien", "FEED")).toBe("una foto");
  });

  it("la recomendación sigue reglas fijas en orden", () => {
    const base = { accounts, whatWorks: [] };
    expect(weeklySummaryText({ ...base, posts: [] }, now)).toMatch(/Para esta semana:\* Esta semana no hubo publicaciones/);
    expect(weeklySummaryText({ ...base, posts: [post({ multiplier: 3 })] }, now)).toMatch(/no se publicó en TikTok: súbele la mejor de Instagram\.$/);
    const both = [post({ multiplier: 1.2, retentionWarning: true }), post({ platform: "TIKTOK", multiplier: 0.9 })];
    expect(weeklySummaryText({ ...base, posts: both }, now)).toMatch(/Una publicación se deja de ver muy pronto/);
    expect(weeklySummaryText({ ...base, posts: [post({ multiplier: 1.2 }), post({ platform: "TIKTOK", multiplier: 0.9 })] }, now)).toMatch(/Etiqueta las publicaciones de la semana/);
  });

  it("una red sin cuenta conectada no aparece", () => {
    const text = weeklySummaryText({ accounts: [accounts[0]], posts: [post({ multiplier: 1.1 })], whatWorks: [] }, now);
    expect(text).not.toContain("TikTok");
  });
});
