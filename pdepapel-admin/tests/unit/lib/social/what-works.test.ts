import { describe, expect, it } from "vitest";

import { autoTags, cleanTagLabel, tagKey, tagOptions, uniqueTags } from "@/lib/social/tags";
import { whatWorks, whatWorksHeadline, type WhatWorksPost } from "@/lib/social/what-works";

describe("etiquetas", () => {
  it("limpia espacios, rechaza vacías o de más de 60 y no repite por mayúsculas o tildes", () => {
    expect(cleanTagLabel("  pedido   con nombre ")).toBe("pedido con nombre");
    expect(cleanTagLabel("   ")).toBeNull();
    expect(cleanTagLabel("x".repeat(61))).toBeNull();
    expect(tagKey("Antes/Después")).toBe(tagKey("antes/despues"));
    expect(uniqueTags(["POV", "pov", " Pov ", "kit"])).toEqual(["POV", "kit"]);
  });

  it("las opciones traen las de fábrica primero y luego las de la tienda en orden alfabético, sin duplicar", () => {
    const options = tagOptions([
      { kind: "GANCHO", label: "pov" },
      { kind: "GANCHO", label: "Unboxing" },
      { kind: "GANCHO", label: "Detrás de cámaras" },
      { kind: "FORMATO", label: "Tutorial" },
    ]);
    expect(options.GANCHO).toEqual(["pregunta", "producto en mano", "texto grande", "antes/después", "POV", "plano quieto sin texto", "Detrás de cámaras", "Unboxing"]);
    expect(options.FORMATO.at(-1)).toBe("Tutorial");
  });

  it("«plano quieto sin texto» es de fábrica: la etiqueta ya guardada por la tienda no sale dos veces", () => {
    const options = tagOptions([{ kind: "GANCHO", label: "Plano quieto sin texto" }]);
    expect(options.GANCHO.filter((label) => tagKey(label) === tagKey("plano quieto sin texto"))).toEqual(["plano quieto sin texto"]);
  });

  it("las automáticas usan la hora de Bogotá: tipo, duración, día y franja", () => {
    // 2026-11-21 04:30 UTC = viernes 20 a las 23:30 en Bogotá.
    expect(autoTags({ productType: "REELS", durationSec: 22, postedAt: new Date("2026-11-21T04:30:00Z") })).toEqual([
      { group: "TIPO", label: "Reel" },
      { group: "DURACION", label: "15 a 30 s" },
      { group: "DIA", label: "viernes" },
      { group: "FRANJA", label: "noche" },
    ]);
    // 2026-11-21 11:00 UTC = sábado 06:00 en Bogotá: ya es mañana, no madrugada.
    expect(autoTags({ productType: "CAROUSEL", durationSec: null, postedAt: new Date("2026-11-21T11:00:00Z") })).toEqual([
      { group: "TIPO", label: "Carrusel" },
      { group: "DIA", label: "sábado" },
      { group: "FRANJA", label: "mañana" },
    ]);
    expect(autoTags({ productType: "VIDEO", durationSec: 15, postedAt: new Date("2026-11-21T17:00:00Z") }).slice(0, 2)).toEqual([
      { group: "TIPO", label: "Video" },
      { group: "DURACION", label: "15 a 30 s" },
    ]);
    expect(autoTags({ productType: null, durationSec: 150, postedAt: new Date("2026-11-21T17:00:00Z") })[0]).toEqual({ group: "DURACION", label: "más de 2 min" });
  });
});

const base = (overrides: Partial<WhatWorksPost>): WhatWorksPost => ({
  platform: "INSTAGRAM",
  multiplier: 1,
  multiplierApprox: false,
  watchedPct: null,
  skipRate: null,
  tags: { FORMATO: [], GANCHO: [] },
  autoTags: [],
  ...overrides,
});
const carousel = (multiplier: number | null, extra: Partial<WhatWorksPost> = {}) => base({ multiplier, autoTags: [{ group: "TIPO", label: "Carrusel" }], ...extra });
const reel = (multiplier: number | null, extra: Partial<WhatWorksPost> = {}) => base({ multiplier, autoTags: [{ group: "TIPO", label: "Reel" }], ...extra });

describe("«Qué funciona»", () => {
  it("una fila por etiqueta con 2 o más publicaciones, ordenada de mejor a peor; el titular sale de una con 5 o más", () => {
    const posts = [
      ...[1.4, 1.6, 1.8, 1.5, 2].map((value) => carousel(value)),
      ...[0.6, 0.9].map((value) => reel(value, { tags: { FORMATO: ["ASMR"], GANCHO: [] }, watchedPct: 12, skipRate: 70 })),
      reel(3, { tags: { FORMATO: ["kit"], GANCHO: [] } }),
    ];
    const [instagram] = whatWorks(posts);
    expect(instagram.posts).toBe(8);
    expect(instagram.rows.map((row) => [row.group, row.label, row.medianMultiplier, row.count, row.fewData])).toEqual([
      ["TIPO", "Carrusel", 1.6, 5, false],
      ["TIPO", "Reel", 0.9, 3, true],
      ["FORMATO", "ASMR", 0.8, 2, true],
    ]);
    expect(instagram.rows[2]).toMatchObject({ medianWatchedPct: 12, medianSkipRate: 70 });
    expect(instagram.headline).toBe("En Instagram los carruseles van 1,6× la mediana.");
  });

  it("sin una fila de 5 o más que le gane a la mediana no hay titular; las filas sin «× mediana» van al final", () => {
    const [few] = whatWorks([carousel(3), carousel(2.5), reel(null), reel(null)]);
    expect(few.headline).toBeNull();
    expect(few.rows.map((row) => row.label)).toEqual(["Carrusel", "Reel"]);
    expect(few.rows[1].medianMultiplier).toBeNull();
    const [flat] = whatWorks([1, 1, 1, 1, 1].map((value) => carousel(value)));
    expect(flat.headline).toBeNull();
  });

  it("con valores «aprox.» el titular es una pista; con lecturas reales de 7 días deja de serlo", () => {
    const tentative = whatWorks([1.4, 1.6, 1.8, 1.5, 2].map((value, index) => carousel(value, { multiplierApprox: index === 0 })));
    expect(tentative[0]).toMatchObject({ headline: "En Instagram los carruseles van 1,6× la mediana (aprox.).", headlineTentative: true });
    const confirmed = whatWorks([1.4, 1.6, 1.8, 1.5, 2].map((value) => carousel(value)));
    expect(confirmed[0]).toMatchObject({ headline: "En Instagram los carruseles van 1,6× la mediana.", headlineTentative: false });
    expect(whatWorks([carousel(3), carousel(2)])[0]).toMatchObject({ headline: null, headlineTentative: false });
  });

  it("separa las redes, marca «aprox.» y arma la frase según el tipo de etiqueta", () => {
    const networks = whatWorks([carousel(1.2, { multiplierApprox: true }), carousel(1.4), base({ platform: "TIKTOK" })]);
    expect(networks.map((network) => network.platform)).toEqual(["INSTAGRAM", "TIKTOK"]);
    expect(networks[0].rows[0]).toMatchObject({ approx: true });
    const row = { count: 6, fewData: false, medianMultiplier: 1.5, approx: false, medianWatchedPct: null, medianSkipRate: null };
    expect(whatWorksHeadline("TIKTOK", { ...row, group: "FRANJA", label: "noche" })).toBe("En TikTok lo publicado en la noche va 1,5× la mediana.");
    expect(whatWorksHeadline("INSTAGRAM", { ...row, group: "DIA", label: "martes" })).toBe("En Instagram lo publicado el martes va 1,5× la mediana.");
    expect(whatWorksHeadline("INSTAGRAM", { ...row, group: "GANCHO", label: "POV", approx: true })).toBe("En Instagram las publicaciones «POV» van 1,5× la mediana (aprox.).");
    expect(whatWorksHeadline("INSTAGRAM", { ...row, group: "DURACION", label: "15 a 30 s" })).toBe("En Instagram los videos de 15 a 30 s van 1,5× la mediana.");
  });
});
