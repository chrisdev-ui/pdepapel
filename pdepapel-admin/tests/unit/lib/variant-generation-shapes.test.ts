import { describe, expect, it } from "vitest";

import { describeGeneration, filterAgainstStandalone, planGeneratedVariants } from "@/lib/product-group-form-state";
import { generateVariants, type VariantOption } from "@/lib/variant-generator";

const category = { id: "cat", name: "Folders" };
const colors = (n: number): VariantOption[] => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `Color ${i}` }));
const designs = (n: number): VariantOption[] => Array.from({ length: n }, (_, i) => ({ id: `d${i}`, name: `Diseño ${i}` }));
const oneSize: VariantOption[] = [{ id: "s0", name: "Único", value: "U" }];

const generate = (c: number, d: number, sizes = oneSize) =>
  generateVariants({ baseName: "Folder tarjetero", category, colors: colors(c), designs: designs(d), sizes });

const row = (id: string | undefined, colorId: string, designId = "d0", sizeId = "s0") => ({
  id,
  name: `fila ${colorId}`,
  size: { id: sizeId },
  color: { id: colorId },
  design: { id: designId },
});

describe("combinaciones con un solo valor en algún atributo", () => {
  it("N colores × 1 diseño × 1 tamaño da N variantes", () => {
    expect(generate(7, 1)).toHaveLength(7);
  });

  it("1 color × N diseños da N variantes", () => {
    expect(generate(1, 5)).toHaveLength(5);
  });

  it("N × M da N·M variantes", () => {
    expect(generate(4, 3)).toHaveLength(12);
  });

  it("sin tamaños no hay combinaciones (el formulario lo avisa antes)", () => {
    expect(generate(7, 1, [])).toHaveLength(0);
  });

  it("el producto adoptado cuenta solo como su propia combinación", () => {
    const plan = planGeneratedVariants([row("base", "c0")], generate(7, 1), "strict");
    expect(plan.kept.map((variant) => variant.id)).toEqual(["base"]);
    expect(plan.toCreate).toHaveLength(6);
  });

  it("si todas ya están en el grupo no se crea ninguna", () => {
    const existing = colors(3).map((color, i) => row(`p${i}`, color.id));
    const plan = planGeneratedVariants(existing, generate(3, 1), "strict");
    expect(plan.toCreate).toHaveLength(0);
    expect(plan.kept).toHaveLength(3);
  });

  it("si ya hay algunas, crea solo las que faltan", () => {
    const plan = planGeneratedVariants([row("p0", "c0"), row("p1", "c1")], generate(5, 1), "strict");
    expect(plan.toCreate.map((combo) => combo.colorId)).toEqual(["c2", "c3", "c4"]);
  });
});

describe("productos sueltos que ya existen", () => {
  const toCreate = generate(4, 1);

  it("no toma como duplicado al producto que ya está en el formulario (el que se adopta)", () => {
    const base = { id: "base", name: "Folder tarjetero kawaii", reason: "images" as const };
    const result = filterAgainstStandalone(toCreate, toCreate.map(() => base), new Set(["base"]));
    expect(result.create).toHaveLength(4);
    expect(result.skipped).toHaveLength(0);
  });

  it("sí omite las que coinciden con otro producto suelto", () => {
    const other = { id: "otro", name: "Folder suelto", reason: "name" as const };
    const result = filterAgainstStandalone(toCreate, [other, null, null, other], new Set(["base"]));
    expect(result.create.map((combo) => combo.colorId)).toEqual(["c1", "c2"]);
    expect(result.skipped.map((skip) => skip.match.name)).toEqual(["Folder suelto", "Folder suelto"]);
  });
});

describe("aviso al generar", () => {
  it("con variantes nuevas es un éxito y dice cuántas", () => {
    expect(describeGeneration({ requested: 7, created: 7, alreadyInGroup: 0, skippedStandalone: 0 })).toEqual({
      title: "Variantes listas para guardar",
      description: "7 variantes nuevas se crean al guardar, con 0 unidades.",
      variant: "success",
    });
  });

  it("si se omitieron algunas, dice cuántas y por qué", () => {
    const toast = describeGeneration({ requested: 7, created: 4, alreadyInGroup: 1, skippedStandalone: 2 });
    expect(toast.variant).toBe("success");
    expect(toast.description).toBe(
      "4 variantes nuevas se crean al guardar, con 0 unidades. Se omitieron 3: 1 ya estaba en el grupo y 2 ya existen como productos sueltos (agrégalos con «Traer existentes»).",
    );
  });

  it("nunca es un éxito con 0: todas ya existían", () => {
    expect(describeGeneration({ requested: 3, created: 0, alreadyInGroup: 3, skippedStandalone: 0 })).toEqual({
      title: "Todas las combinaciones ya existen",
      description: "Las 3 combinaciones elegidas ya están en el grupo. No se creó ninguna variante.",
      variant: "warning",
    });
  });

  it("nunca es un éxito con 0: ya existen como productos sueltos", () => {
    const toast = describeGeneration({ requested: 2, created: 0, alreadyInGroup: 0, skippedStandalone: 2 });
    expect(toast.variant).toBe("warning");
    expect(toast.title).toBe("No se creó ninguna variante");
    expect(toast.description).toBe("2 ya existen como productos sueltos (agrégalos con «Traer existentes»).");
  });

  it("sin combinaciones pide elegir valores", () => {
    expect(describeGeneration({ requested: 0, created: 0, alreadyInGroup: 0, skippedStandalone: 0 })).toEqual({
      title: "No hay combinaciones para crear",
      description: "Elige al menos un color, un diseño y un tamaño en «Datos del grupo».",
      variant: "warning",
    });
  });
});
