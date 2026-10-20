import { describe, expect, it } from "vitest";

import { parsePackOptions } from "@/lib/capsule-pack-options";
import { CAPSULE_PACK_PRICES } from "@/lib/pricing/capsules";

const all = (row: (size: number) => Record<string, unknown> = () => ({})) => CAPSULE_PACK_PRICES.map((price) => ({ packSize: price.packSize, giftMaxCost: 0, giftMaxItems: 0, boxReserveCost: 500, ...row(price.packSize) }));

describe("parsePackOptions", () => {
  it("exige una fila por cada pack de la escalera, sin repetir", () => {
    expect(parsePackOptions(all())).toHaveLength(CAPSULE_PACK_PRICES.length);
    expect(() => parsePackOptions(all().slice(1))).toThrow(/Falta configurar el pack de 5/);
    expect(() => parsePackOptions([...all(), all()[0]])).toThrow(/aparece dos veces/);
    expect(() => parsePackOptions([...all(), { packSize: 7 }])).toThrow(/No hay pack de 7/);
  });

  it("un regalo lleva tope y cantidad, o ninguno; los valores no son negativos", () => {
    expect(() => parsePackOptions(all((size) => (size === 10 ? { giftMaxCost: 1000 } : {})))).toThrow(/tope y cantidad/);
    expect(() => parsePackOptions(all((size) => (size === 10 ? { giftMaxItems: 1 } : {})))).toThrow(/tope y cantidad/);
    expect(() => parsePackOptions(all((size) => (size === 5 ? { boxReserveCost: -1 } : {})))).toThrow(/de 0 en adelante/);
    const parsed = parsePackOptions(all((size) => (size === 10 ? { giftMaxCost: 1000.4, giftMaxItems: 1, giftLabel: "  Un regalo  " } : {})));
    expect(parsed.find((row) => row.packSize === 10)).toEqual({ packSize: 10, giftMaxCost: 1000, giftMaxItems: 1, boxReserveCost: 500, giftLabel: "Un regalo" });
  });
});
