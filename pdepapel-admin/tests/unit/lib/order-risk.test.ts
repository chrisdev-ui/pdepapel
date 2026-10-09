import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GIFT_CARD_REVIEW_AMOUNT,
  assessOrderRisk,
  elapsedSince,
  isEmailVariant,
  isFlagged,
  looksLikeRandomName,
  needsGiftCardReview,
  normalizeEmailForLimits,
  normalizeMobile,
  parseRiskReasons,
  riskColumns,
  tripsBotTrap,
} from "@/lib/order-risk";
import { consumeOrderRateLimits } from "@/lib/order-rate-limit";
import { setRateLimitRedis } from "@/lib/rate-limit";

describe("normalizeMobile", () => {
  it.each([
    ["3001234567", "+573001234567"],
    ["300 123 4567", "+573001234567"],
    ["+57 300 123 4567", "+573001234567"],
    ["57 3001234567", "+573001234567"],
    ["(301) 555-0001", "+573015550001"],
    ["0057 3001112233", "+573001112233"],
  ])("acepta el celular colombiano %s", (input, expected) => {
    expect(normalizeMobile(input)).toBe(expected);
  });

  it.each(["+57 9123456789", "9123456789", "601 2345678", "300123456", "300123456789", "", "abc"])(
    "rechaza %s (fijo, empieza por 9, largo malo o vacío)",
    (input) => {
      expect(normalizeMobile(input)).toBeNull();
    },
  );

  it("acepta un número de otro país con indicativo, porque una tarjeta la puede comprar alguien de fuera", () => {
    expect(normalizeMobile("+1 415 555 2671")).toBe("+14155552671");
    expect(normalizeMobile("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizeMobile("+1 23")).toBeNull();
  });
});

describe("looksLikeRandomName", () => {
  it.each([
    "Daniela",
    "maría josé",
    "Ana María De la Ossa",
    "Juan Pablo Ñáñez Gutiérrez",
    "José O'Neill",
    "Lucía Pérez-Rodríguez",
    "McDonald",
    "Hirschfeld",
    "Lyn",
    "Yhordy Mosquera",
  ])("no marca un nombre real: %s", (name) => {
    expect(looksLikeRandomName(name)).toBe(false);
  });

  it.each(["xKqPzLmWvB", "Bcdfghjk Prz", "QwRtYpLkJh", "Juan123", "zxcvbnmlk", "", "   "])(
    "marca letras al azar o con números: %s",
    (name) => {
      expect(looksLikeRandomName(name)).toBe(true);
    },
  );
});

describe("correos", () => {
  it("normaliza Gmail sin puntos ni etiquetas y deja los demás dominios con sus puntos", () => {
    expect(normalizeEmailForLimits("J.O.H.N.Doe+tienda@Gmail.com")).toBe("johndoe@gmail.com");
    expect(normalizeEmailForLimits("juan.perez@googlemail.com")).toBe("juanperez@gmail.com");
    expect(normalizeEmailForLimits("juan.perez+x@outlook.com")).toBe("juan.perez@outlook.com");
  });

  it("solo el truco de muchos puntos o el «+» cuentan como variante", () => {
    expect(isEmailVariant("maria.jose.perez@gmail.com")).toBe(false);
    expect(isEmailVariant("j.o.h.n.doe@gmail.com")).toBe(true);
    expect(isEmailVariant("ana+promo@gmail.com")).toBe(true);
    expect(isEmailVariant("a.b.c.d@empresa.co")).toBe(false);
  });
});

describe("trampas para bots", () => {
  it("la trampa llena o un envío de menos de 2,5 s rechazan", () => {
    expect(tripsBotTrap({ honeypot: "http://spam" })).toBe(true);
    expect(tripsBotTrap({ elapsedMs: 900 })).toBe(true);
    expect(tripsBotTrap({ honeypot: "", elapsedMs: 9_000 })).toBe(false);
  });

  it("sin tiempo (un cliente viejo) no rechaza", () => {
    expect(tripsBotTrap({ honeypot: undefined, elapsedMs: null })).toBe(false);
  });

  it("elapsedSince ignora valores absurdos o del futuro", () => {
    expect(elapsedSince(1_000, 8_000)).toBe(7_000);
    expect(elapsedSince("no", 8_000)).toBeNull();
    expect(elapsedSince(9_000, 8_000)).toBeNull();
    expect(elapsedSince(0, 8_000)).toBeNull();
  });
});

describe("assessOrderRisk", () => {
  it("el patrón del bot (siete segundos) queda marcado", () => {
    const risk = assessOrderRisk({ email: "cliente@gmail.com", elapsedMs: 7_000 });
    expect(risk.reasons).toEqual(["envio-rapido"]);
    expect(isFlagged({ riskScore: risk.score })).toBe(true);
  });

  it("una persona normal no suma nada", () => {
    expect(assessOrderRisk({ email: "maria.jose@gmail.com", elapsedMs: 95_000 })).toEqual({ score: 0, reasons: [] });
  });

  it("un correo variante solo no basta para marcar", () => {
    const risk = assessOrderRisk({ email: "a.b.c.d@gmail.com", elapsedMs: 60_000 });
    expect(isFlagged({ riskScore: risk.score })).toBe(false);
    expect(riskColumns(risk)).toEqual({ riskScore: 1, riskReasons: "correo-variante" });
  });

  it("pedidos repetidos marcan y los motivos se leen de vuelta", () => {
    const risk = assessOrderRisk({ email: "x@y.co", elapsedMs: 60_000, repeated: true });
    expect(isFlagged({ riskScore: risk.score })).toBe(true);
    expect(parseRiskReasons(riskColumns(risk).riskReasons)).toEqual(["pedidos-repetidos"]);
    expect(parseRiskReasons("otra-cosa,envio-rapido")).toEqual(["envio-rapido"]);
  });
});

describe("needsGiftCardReview", () => {
  it("un pedido marcado siempre espera aprobación", () => {
    expect(needsGiftCardReview({ riskScore: 2, total: 50_000, isFirstPurchase: false })).toBe(true);
  });

  it("la primera compra desde el umbral espera; una clienta conocida o un valor menor no", () => {
    expect(needsGiftCardReview({ riskScore: 0, total: GIFT_CARD_REVIEW_AMOUNT, isFirstPurchase: true })).toBe(true);
    expect(needsGiftCardReview({ riskScore: 0, total: GIFT_CARD_REVIEW_AMOUNT, isFirstPurchase: false })).toBe(false);
    expect(needsGiftCardReview({ riskScore: 0, total: 50_000, isFirstPurchase: true })).toBe(false);
  });
});

describe("consumeOrderRateLimits", () => {
  afterEach(() => setRateLimitRedis(null));

  function fakeRedis() {
    const counts = new Map<string, number>();
    return {
      counts,
      client: {
        incr: vi.fn(async (key: string) => {
          counts.set(key, (counts.get(key) ?? 0) + 1);
          return counts.get(key)!;
        }),
        expire: vi.fn(async () => 1),
      },
    };
  }

  it("cuenta el mismo buzón de Gmail con puntos como uno y nunca guarda la IP ni el correo legibles", async () => {
    const redis = fakeRedis();
    setRateLimitRedis(redis.client as never);
    const base = { scope: "gift-card", storeId: "s-1", clientKey: "203.0.113.9" };
    await consumeOrderRateLimits({ ...base, email: "juan.perez@gmail.com" });
    const second = await consumeOrderRateLimits({ ...base, email: "j.u.a.n.perez@gmail.com" });
    expect(second.repeated).toBe(true);
    const keys = Array.from(redis.counts.keys()).join(" ");
    expect(keys).not.toContain("203.0.113.9");
    expect(keys).not.toContain("juan");
    expect(redis.counts.size).toBe(2);
  });

  it("corta al pasar el límite por correo", async () => {
    const redis = fakeRedis();
    setRateLimitRedis(redis.client as never);
    let last = { allowed: true, repeated: false };
    for (let index = 0; index < 5; index += 1) {
      last = await consumeOrderRateLimits({ scope: "checkout", storeId: "s-1", clientKey: `ip-${index}`, email: "ana@correo.co" });
    }
    expect(last.allowed).toBe(false);
  });

  it("si Redis falla deja pasar sin marcar", async () => {
    setRateLimitRedis({ incr: vi.fn().mockRejectedValue(new Error("caído")), expire: vi.fn() } as never);
    await expect(consumeOrderRateLimits({ scope: "checkout", storeId: "s-1", clientKey: "x", email: "a@b.co" })).resolves.toEqual({ allowed: true, repeated: false });
  });
});

describe("fraude confirmado", () => {
  it("cancelar como fraude suma el motivo sin borrar los anteriores y deja el pedido marcado", async () => {
    const { withRiskReason, isFraudCancelled } = await import("@/lib/order-risk");
    const marked = withRiskReason({ riskScore: 2, riskReasons: "envio-rapido" }, "fraude-confirmado");
    expect(marked).toEqual({ riskScore: 12, riskReasons: "envio-rapido,fraude-confirmado" });
    expect(isFraudCancelled(marked)).toBe(true);
    expect(isFlagged(marked)).toBe(true);
    expect(withRiskReason(marked, "fraude-confirmado")).toEqual(marked);
    expect(isFraudCancelled({ riskReasons: "envio-rapido" })).toBe(false);
  });

  it("un pedido anterior cancelado como fraude con el mismo correo o celular marca el nuevo", () => {
    const risk = assessOrderRisk({ email: "x@y.co", elapsedMs: 90_000, priorFraud: true });
    expect(risk.reasons).toEqual(["fraude-previo"]);
    expect(isFlagged({ riskScore: risk.score })).toBe(true);
  });

  it("un pago recibido en un pedido cancelado tiene su propio motivo legible", () => {
    expect(parseRiskReasons("pago-en-cancelado")).toEqual(["pago-en-cancelado"]);
  });
});
