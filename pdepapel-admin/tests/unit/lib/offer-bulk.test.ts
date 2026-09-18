import { describe, expect, it } from "vitest";

import { offersToCsv, partitionForEnd } from "@/lib/offer-bulk";

const now = new Date("2026-09-18T12:00:00.000Z");
const base = { isActive: true, startDate: new Date("2026-09-01T05:00:00.000Z"), endDate: new Date("2026-10-01T04:59:59.999Z") };
const vigente = { ...base, id: "a", name: "Hasta agotar" };
const programada = { ...base, id: "b", name: "Fin de semana", startDate: new Date("2026-09-26T05:00:00.000Z"), endDate: new Date("2026-09-28T04:59:59.999Z") };
const vencida = { ...base, id: "c", name: "Regreso a clases", endDate: new Date("2026-08-31T04:59:59.999Z") };
const apagada = { ...base, id: "d", name: "Día sin IVA", isActive: false };

describe("partitionForEnd", () => {
  it("ends running and scheduled offers and explains the rest", () => {
    const { eligible, skipped } = partitionForEnd([vigente, programada, vencida, apagada], now);
    expect(eligible.map((row) => row.id)).toEqual(["a", "b"]);
    expect(skipped.map((entry) => [entry.row.id, entry.reason])).toEqual([
      ["c", "Ya venció"],
      ["d", "Ya estaba terminada"],
    ]);
  });
});

describe("offersToCsv", () => {
  it("writes one row per offer with the panel's labels", () => {
    const csv = offersToCsv(
      [
        { ...vigente, label: "Hasta agotar existencias", type: "FIXED", amount: 9000, scope: "6 productos" },
        { ...apagada, label: null, type: "PERCENTAGE", amount: 19, scope: "4 subcategorías, 1 grupo" },
      ],
      (value) => `$ ${value}`,
      now,
    );
    expect(csv.split("\n")).toEqual([
      "nombre,etiqueta,descuento,aplica_a,estado,inicio,fin",
      "Hasta agotar,Hasta agotar existencias,$ 9000,6 productos,Vigente,2026-09-01,2026-10-01",
      'Día sin IVA,,19 %,"4 subcategorías, 1 grupo",Desactivada,2026-09-01,2026-10-01',
      "",
    ]);
  });
});
