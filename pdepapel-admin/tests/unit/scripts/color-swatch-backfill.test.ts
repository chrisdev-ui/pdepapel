import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { COLOR_SWATCH_TYPES as SHARED_TYPES } from "@/lib/color-swatch";

import {
  backfillSwatchTypeFor,
  COLOR_SWATCH_BACKFILL,
  COLOR_SWATCH_TYPES,
  planColorSwatchBackfill,
} from "../../../scripts/lib/color-swatch-backfill.mjs";

/** Los 36 colores de producción al 2026-10-06 (auditoría #3, §1), todos aún en SOLID. */
const PRODUCTION_COLORS = [
  "Blanco", "Azul pastel", "Verde pastel", "Amarillo pastel", "Amarillo", "Crema", "Verde aguamarina",
  "Metalizado", "Plateado", "Dorado", "Multicolor", "Pastel",
  "Verde fluorescente", "Fluorescente", "Rosado fluorescente", "Naranja fluorescente", "Neón", "Azul fluorescente", "Morado fluorescente",
  "Azul", "Lila", "Rosa pastel", "Café", "Negro", "Rosado", "Verde", "Rojo", "Naranja", "Palo de rosa", "Morado", "Gris",
  "Azul aguamarina", "Curuba", "Fucsia", "Rosa blanquecino", "Transparente",
].map((name, index) => ({ id: `c${index}`, name, swatchType: "SOLID" }));

type Change = { id: string; name: string; from: string; to: string };

describe("color swatch backfill map (#3)", () => {
  it("uses the same enum as the schema and the shared swatch file", () => {
    expect([...COLOR_SWATCH_TYPES]).toEqual([...SHARED_TYPES]);
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const block = /enum ColorSwatchType \{([^}]*)\}/.exec(schema)?.[1] ?? "";
    expect(block.split(/\s+/).filter(Boolean)).toEqual([...SHARED_TYPES]);
  });

  it("maps exactly the 13 non-solid colours of the audit", () => {
    expect(COLOR_SWATCH_BACKFILL).toEqual({
      Multicolor: "MULTICOLOR",
      Pastel: "MULTICOLOR_PASTEL",
      Transparente: "TRANSPARENT",
      Metalizado: "METALLIC",
      Plateado: "METALLIC",
      Dorado: "METALLIC",
      Fluorescente: "NEON",
      "Neón": "NEON",
      "Verde fluorescente": "NEON",
      "Rosado fluorescente": "NEON",
      "Naranja fluorescente": "NEON",
      "Azul fluorescente": "NEON",
      "Morado fluorescente": "NEON",
    });
  });

  it("matches stored names regardless of case, edge spaces or accent encoding, and nothing by pattern", () => {
    expect(backfillSwatchTypeFor(" multicolor ")).toBe("MULTICOLOR");
    expect(backfillSwatchTypeFor("Neón")).toBe("NEON"); // «Neón» en NFD
    expect(backfillSwatchTypeFor("Blanco")).toBeNull();
    expect(backfillSwatchTypeFor("Rosa pastel")).toBeNull();
    // Lista cerrada: un color nuevo con «neón» en el nombre lo decide Paula en el panel.
    expect(backfillSwatchTypeFor("Rosa neón")).toBeNull();
  });

  it("plans 13 changes over the production colours and leaves the other 23 in SOLID", () => {
    const plan = planColorSwatchBackfill(PRODUCTION_COLORS);
    expect(plan.changes).toHaveLength(13);
    expect(plan.missing).toEqual([]);
    expect(plan.alreadySet).toEqual([]);
    expect(plan.changes.every((change: Change) => change.from === "SOLID")).toBe(true);
    expect(Object.fromEntries(plan.changes.map((change: Change) => [change.name, change.to]))).toEqual(COLOR_SWATCH_BACKFILL);
  });

  it("is idempotent: a second run finds everything already set", () => {
    const after = PRODUCTION_COLORS.map((color) => ({ ...color, swatchType: backfillSwatchTypeFor(color.name) ?? "SOLID" }));
    const plan = planColorSwatchBackfill(after);
    expect(plan.changes).toEqual([]);
    expect(plan.alreadySet).toHaveLength(13);
  });

  it("never touches colours outside the map and reports map names the store lacks", () => {
    const plan = planColorSwatchBackfill([
      { id: "x", name: "Rayas azules", swatchType: "PATTERN" },
      { id: "y", name: "Dorado", swatchType: "SOLID" },
    ]);
    expect(plan.changes).toEqual([{ id: "y", name: "Dorado", from: "SOLID", to: "METALLIC" }]);
    expect(plan.missing).toHaveLength(12);
  });
});
