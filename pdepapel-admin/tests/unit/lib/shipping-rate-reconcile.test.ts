import { describe, expect, it } from "vitest";

import type { RequotedRate } from "@/lib/shipping-helpers";
import {
  RATE_TOLERANCE_ABSOLUTE_COP,
  isMateriallySameCost,
  readCachedRates,
  reconcileShippingRate,
} from "@/lib/shipping-rate-reconcile";

const tarifa = (over: Partial<RequotedRate> = {}): RequotedRate => ({
  idRate: 26341730,
  idCarrier: 1,
  idProduct: 2,
  carrier: "ENVIA",
  product: "Normal",
  flete: 13997,
  minimumInsurance: 0,
  totalCost: 13997,
  deliveryDays: 2,
  isCOD: false,
  ...over,
});

describe("leer la caché venga como venga", () => {
  it("acepta el ARRAY que escribe /shipment/quote", () => {
    // Este es el fallo que dejaba la caché inservible: se guarda un array y el
    // checkout leía `.rates`, que en un array es undefined.
    const guardado = [tarifa()];
    expect(readCachedRates(guardado)).toHaveLength(1);
    expect((guardado as unknown as { rates?: unknown }).rates).toBeUndefined();
  });

  it("acepta también la forma { rates: [...] }", () => {
    expect(readCachedRates({ rates: [tarifa()] })).toHaveLength(1);
  });

  it("cualquier otra cosa da una lista vacía, sin reventar", () => {
    expect(readCachedRates(null)).toEqual([]);
    expect(readCachedRates(undefined)).toEqual([]);
    expect(readCachedRates("vaya")).toEqual([]);
    expect(readCachedRates({ rates: "no es lista" })).toEqual([]);
  });
});

describe("¿es el mismo precio?", () => {
  it("una diferencia de monedas no interrumpe una compra", () => {
    expect(isMateriallySameCost(13997, 13997)).toBe(true);
    expect(isMateriallySameCost(13997, 14500)).toBe(true);
    expect(isMateriallySameCost(13997, 13997 + RATE_TOLERANCE_ABSOLUTE_COP)).toBe(true);
  });

  it("una subida de verdad sí", () => {
    expect(isMateriallySameCost(13997, 18028)).toBe(false);
    expect(isMateriallySameCost(13997, 25000)).toBe(false);
  });

  it("una BAJADA también cuenta como cambio y se confirma", () => {
    // No se le cobra de menos a escondidas: lo que ve la clienta manda.
    expect(isMateriallySameCost(18028, 9000)).toBe(false);
  });
});

describe("reconciliar la tarifa tras re-cotizar", () => {
  it("si el número coincide, no hay nada que pensar", () => {
    const r = reconcileShippingRate({
      rateId: 26341730,
      previousCost: 13997,
      freshRates: [tarifa(), tarifa({ idRate: 26341722, carrier: "COORDINADORA" })],
    });
    expect(r.outcome).toBe("same");
    expect(r.outcome === "same" && r.rate.idRate).toBe(26341730);
  });

  it("EL CASO DEL INCIDENTE: cambia el idRate pero es el mismo servicio y precio", () => {
    // Medido contra EnvioClick: 1,0 kg → 26341730 y 1,5 kg → 26341752. La
    // re-cotización recalcula el peso, así que el número baila. Antes esto era
    // un 400 sin salida; ahora la compra sigue y la clienta no se entera.
    const r = reconcileShippingRate({
      rateId: 26341730,
      previousCost: 13997,
      previousCarrier: "ENVIA",
      previousProduct: "Normal",
      freshRates: [tarifa({ idRate: 26341752, flete: 13997, totalCost: 13997 })],
    });
    expect(r.outcome).toBe("same");
    expect(r.outcome === "same" && r.rate.idRate).toBe(26341752);
  });

  it("compara sin tildes ni mayúsculas", () => {
    const r = reconcileShippingRate({
      rateId: 1,
      previousCost: 13997,
      previousCarrier: "envía",
      previousProduct: "normal",
      freshRates: [tarifa({ idRate: 99, carrier: "ENVIA", product: "Normal" })],
    });
    expect(r.outcome).toBe("same");
  });

  it("si el precio cambió de verdad, lo tiene que confirmar la clienta", () => {
    const r = reconcileShippingRate({
      rateId: 26341730,
      previousCost: 13997,
      previousCarrier: "ENVIA",
      freshRates: [tarifa({ idRate: 26341752, flete: 21000, totalCost: 21000 })],
    });
    expect(r.outcome).toBe("price_changed");
    expect(r.outcome === "price_changed" && r.rate.totalCost).toBe(21000);
    expect(r.outcome === "price_changed" && r.previousCost).toBe(13997);
  });

  it("entre varias del mismo servicio, la más barata", () => {
    const r = reconcileShippingRate({
      rateId: 1,
      previousCost: 13997,
      previousCarrier: "ENVIA",
      freshRates: [
        tarifa({ idRate: 10, totalCost: 15000 }),
        tarifa({ idRate: 11, totalCost: 13500 }),
      ],
    });
    expect(r.outcome === "same" && r.rate.idRate).toBe(11);
  });

  it("si esa transportadora ya no cubre, se ofrecen las que sí", () => {
    const r = reconcileShippingRate({
      rateId: 26341730,
      previousCost: 13997,
      previousCarrier: "ENVIA",
      freshRates: [
        tarifa({ idRate: 5, carrier: "COORDINADORA", totalCost: 18028 }),
        tarifa({ idRate: 6, carrier: "TCC", totalCost: 15000 }),
      ],
    });
    expect(r.outcome).toBe("unavailable");
    // Ordenadas de más barata a más cara, para poder enseñarlas tal cual.
    expect(r.outcome === "unavailable" && r.alternatives.map((a) => a.carrier)).toEqual(["TCC", "COORDINADORA"]);
  });

  it("sin transportadora previa no se adivina: se ofrecen alternativas", () => {
    const r = reconcileShippingRate({
      rateId: 26341730,
      previousCost: 13997,
      previousCarrier: null,
      freshRates: [tarifa({ idRate: 5 })],
    });
    expect(r.outcome).toBe("unavailable");
  });

  it("sin precio previo se confirma igual, en vez de colar una subida", () => {
    const r = reconcileShippingRate({
      rateId: 26341730,
      previousCost: null,
      previousCarrier: "ENVIA",
      freshRates: [tarifa({ idRate: 26341752 })],
    });
    expect(r.outcome).toBe("price_changed");
  });

  it("sin ninguna tarifa fresca, no hay nada que ofrecer", () => {
    const r = reconcileShippingRate({
      rateId: 26341730,
      previousCost: 13997,
      previousCarrier: "ENVIA",
      freshRates: [],
    });
    expect(r.outcome).toBe("unavailable");
    expect(r.outcome === "unavailable" && r.alternatives).toEqual([]);
  });
});

/**
 * «Recotizar y crear guía»: la única pregunta es la plata. Estos casos fijan
 * cuándo sigue sola y cuándo se para a preguntar.
 */
describe("recuperar una tarifa vencida en un solo paso", () => {
  const rate = (over: Partial<RequotedRate> = {}): RequotedRate =>
    ({
      idRate: 999, idCarrier: 1, idProduct: 1,
      carrier: "TCC", product: "Estándar",
      flete: 14000, minimumInsurance: 1000, totalCost: 15000,
      deliveryDays: 2, isCOD: false, ...over,
    }) as RequotedRate;

  it("mismo precio: sigue sola, sin preguntar", () => {
    const r = reconcileShippingRate({
      rateId: 111, previousCost: 15000, previousCarrier: "TCC",
      freshRates: [rate()],
    });
    expect(r.outcome).toBe("same");
  });

  it("sube menos del 5 %: sigue sola", () => {
    const r = reconcileShippingRate({
      rateId: 111, previousCost: 15000, previousCarrier: "TCC",
      freshRates: [rate({ totalCost: 15600 })],
    });
    expect(r.outcome).toBe("same");
  });

  it("sube poco en plata aunque sea mucho en porcentaje: sigue sola", () => {
    // $2.000 sobre $5.000 es un 40 %, pero son monedas: el tope absoluto manda.
    const r = reconcileShippingRate({
      rateId: 111, previousCost: 5000, previousCarrier: "TCC",
      freshRates: [rate({ totalCost: 7000 })],
    });
    expect(r.outcome).toBe("same");
  });

  it("sube de verdad: se para y lo confirma quien mira el pedido", () => {
    const r = reconcileShippingRate({
      rateId: 111, previousCost: 15000, previousCarrier: "TCC",
      freshRates: [rate({ totalCost: 22000 })],
    });
    expect(r.outcome).toBe("price_changed");
    if (r.outcome === "price_changed") {
      expect(r.previousCost).toBe(15000);
      expect(r.rate.totalCost).toBe(22000);
    }
  });

  it("la transportadora ya no cubre el destino: no se elige por nadie", () => {
    const r = reconcileShippingRate({
      rateId: 111, previousCost: 15000, previousCarrier: "TCC",
      freshRates: [rate({ carrier: "Servientrega", totalCost: 16000 })],
    });
    expect(r.outcome).toBe("unavailable");
  });

  it("sin precio anterior no se adivina: se pregunta", () => {
    const r = reconcileShippingRate({
      rateId: 111, previousCost: null, previousCarrier: "TCC",
      freshRates: [rate()],
    });
    expect(r.outcome).toBe("price_changed");
  });
});
