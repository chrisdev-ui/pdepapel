import { describe, expect, it } from "vitest";

import { EARLY_MIN_HISTORY, earlyAlertCopy, earlyAlertLine, earlyAlertStatus, earlyHistoryCount, earlyVerdict, viewsNear } from "@/lib/social/early-alert-rules";

const at = (hoursSincePost: number, views: number | null) => ({ hoursSincePost, views });
const history = (count: number, views = 100, hours = 3) => Array.from({ length: count }, () => [at(hours, views)]);

describe("alerta temprana: reglas", () => {
  it("la lectura más cercana dentro de ± 1 h; fuera de eso, nada", () => {
    expect(viewsNear([at(1.5, 10), at(3.4, 30), at(5, 50)], 3)).toBe(30);
    expect(viewsNear([at(1.9, 10), at(4.2, 30)], 3)).toBeNull();
  });

  it("≥ 1,5× va despegando, ≤ 0,5× va lenta, en medio nada", () => {
    expect(earlyVerdict(at(3, 150), history(10))).toEqual({ kind: "DESPEGANDO", ratio: 1.5, hours: 3, history: 10 });
    expect(earlyVerdict(at(3, 50), history(10))).toMatchObject({ kind: "LENTA", ratio: 0.5 });
    expect(earlyVerdict(at(3, 149), history(10))).toMatchObject({ kind: null, ratio: 1.5 });
    expect(earlyVerdict(at(3, 51), history(10))).toMatchObject({ kind: null, ratio: 0.5 });
  });

  it(`con menos de ${EARLY_MIN_HISTORY} publicaciones con lectura a esa edad no dice nada`, () => {
    expect(earlyVerdict(at(3, 900), history(9))).toEqual({ kind: null, ratio: null, hours: 3, history: 9 });
    // Lecturas de otra edad no cuentan como historia.
    expect(earlyVerdict(at(3, 900), [...history(9), ...history(5, 100, 24)])).toMatchObject({ kind: null, history: 9 });
  });

  it("solo entre 2 y 6 h; sin vistas, nada", () => {
    expect(earlyVerdict(at(1.5, 900), history(10, 100, 1.5))).toBeNull();
    expect(earlyVerdict(at(7, 900), history(10, 100, 7))).toBeNull();
    expect(earlyVerdict(at(3, null), history(10))).toBeNull();
  });

  it("la historia cuenta publicaciones con alguna lectura entre 2 y 6 h", () => {
    expect(earlyHistoryCount([[at(1, 5), at(3, 9)], [at(24, 9)], [at(6, 1)], [at(4, null)]])).toBe(2);
  });

  it("el texto dice qué pasa y qué hacer, sin números raros", () => {
    expect(earlyAlertCopy({ kind: "DESPEGANDO", ratio: 1.8, hoursSincePost: 3.4, platform: "INSTAGRAM" })).toEqual({
      title: "Va despegando en Instagram",
      summary: "A las 3 h lleva 1,8× lo normal para esa edad.",
      action: "Respóndele a los comentarios ya y súbelo a historias.",
    });
    expect(earlyAlertCopy({ kind: "LENTA", ratio: 0.4, hoursSincePost: 5.6, platform: "TIKTOK" })).toMatchObject({
      title: "Va lenta en TikTok",
      summary: "A las 6 h lleva 0,4× lo normal para esa edad.",
      action: "Revisa la portada y el primer segundo; prueba otra hora para la próxima.",
    });
  });

  it("cada red se enciende sola con 10 de historia; el interruptor de la tienda apaga todas", () => {
    expect(earlyAlertStatus(true, { INSTAGRAM: 12, TIKTOK: 4 })).toEqual({ switchOn: true, needed: 10, networks: { INSTAGRAM: { history: 12, on: true }, TIKTOK: { history: 4, on: false } } });
    expect(earlyAlertStatus(false, { INSTAGRAM: 12 }).networks.INSTAGRAM).toEqual({ history: 12, on: false });
    expect(earlyAlertStatus(true, { TIKTOK: 10 }).networks.TIKTOK?.on).toBe(true);
  });

  it("la línea por red: «encendida» o «apagada, N de 10»; pausada desde el panel; sin redes conectadas", () => {
    expect(earlyAlertLine(earlyAlertStatus(true, { TIKTOK: 4, INSTAGRAM: 15 }))).toBe(
      "Alerta temprana — Instagram: encendida · TikTok: apagada, 4 de 10. Cada red se enciende sola al juntar 10 publicaciones con lectura a las 2–6 h.",
    );
    expect(earlyAlertLine(earlyAlertStatus(true, { INSTAGRAM: 0, TIKTOK: 0 }))).toContain("Instagram: apagada, 0 de 10 · TikTok: apagada, 0 de 10");
    expect(earlyAlertLine(earlyAlertStatus(false, { INSTAGRAM: 15 }))).toBe("Alerta temprana: pausada desde el panel. No avisa en ninguna red hasta reanudarla.");
    expect(earlyAlertLine(earlyAlertStatus(true, {}))).toBe("Alerta temprana: se enciende sola en cada red al juntar 10 publicaciones con lectura a las 2–6 h.");
  });
});
