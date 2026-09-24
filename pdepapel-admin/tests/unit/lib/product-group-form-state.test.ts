import { describe, expect, it } from "vitest";

import {
  applyPendingImageRemovals,
  archivePayload,
  deriveArchiveMode,
  describeArchiveRows,
  findUnassignedGroupImages,
  planGeneratedVariants,
  shouldBlockForUnassignedImages,
  stripAdoptedRowsFromDraft,
} from "@/lib/product-group-form-state";

/** La casilla «Archivado» leía products[0] y pisaba a todas las variantes al guardar. */
describe("group archive mode", () => {
  it("reads the real state: all live, all archived, or mixed", () => {
    expect(deriveArchiveMode([{ id: "a" }, { id: "b" }])).toBe("all-published");
    expect(deriveArchiveMode([{ id: "a", isArchived: true }, { id: "b", isArchived: true }])).toBe("all-archived");
    expect(deriveArchiveMode([{ id: "a", isArchived: false }, { id: "b", isArchived: true }])).toBe("per-variant");
    // Filas nuevas (sin id) no cuentan; un grupo nuevo empieza a la venta.
    expect(deriveArchiveMode([{ isArchived: true }])).toBe("all-published");
  });

  it("only sends the group flag when «todas» was chosen", () => {
    expect(archivePayload("all-archived")).toEqual({ isArchived: true });
    expect(archivePayload("all-published")).toEqual({ isArchived: false });
    expect(archivePayload("per-variant")).toEqual({});
  });

  it("summarises saved rows", () => {
    expect(describeArchiveRows([{ id: "a" }, { id: "b", isArchived: true }, { isArchived: true }])).toEqual({
      saved: 2,
      archived: 1,
      live: 1,
    });
  });
});

/** El borrador de «Nuevo grupo» readoptaba ids de productos traídos otro día. */
describe("group form draft", () => {
  it("drops adopted rows and keeps generated ones", () => {
    const { draft, dropped } = stripAdoptedRowsFromDraft({
      name: "Grupo",
      variants: [{ id: "adoptado" }, { isArchived: false }, { id: "otro" }],
    });
    expect(dropped).toBe(2);
    expect(draft.variants).toEqual([{ isArchived: false }]);
    expect(draft.name).toBe("Grupo");
  });
});

describe("pending image removals", () => {
  it("removes only the marked photos at save time", () => {
    const images = [{ url: "a" }, { url: "b" }, { url: "c" }];
    expect(applyPendingImageRemovals(images, ["b"])).toEqual([{ url: "a" }, { url: "c" }]);
    expect(applyPendingImageRemovals(images, [])).toBe(images);
  });
});

/**
 * «Auto-generar» no generaba nada y la matriz descartaba filas con producto
 * real. Un solo planificador: aditivo para el automático, estricto para la
 * matriz, y las filas con id se conservan siempre.
 */
describe("planGeneratedVariants", () => {
  const combo = (n: string) => ({ sizeId: "s", colorId: `c${n}`, designId: "d", sku: `SKU-${n}`, name: `Var ${n}` });
  const row = (n: string, id?: string) => ({ id, size: { id: "s" }, color: { id: `c${n}` }, design: { id: "d" } });

  it("keeps matched rows, creates the missing ones and ignores duplicate combinations", () => {
    const plan = planGeneratedVariants([row("1", "p1")], [combo("1"), combo("2"), combo("2")], "additive");
    expect(plan.kept).toEqual([row("1", "p1")]);
    expect(plan.toCreate).toEqual([combo("2")]);
    expect(plan.keptOutside).toEqual([]);
    expect(plan.dropped).toEqual([]);
  });

  it("additive mode never drops an unsaved row that is not in the generated set", () => {
    const plan = planGeneratedVariants([row("9")], [combo("1")], "additive");
    expect(plan.kept).toEqual([row("9")]);
    expect(plan.toCreate).toEqual([combo("1")]);
  });

  it("strict mode drops unsaved rows outside the set but keeps saved ones aside", () => {
    const plan = planGeneratedVariants([row("9"), row("8", "p8")], [combo("1")], "strict");
    expect(plan.kept).toEqual([]);
    expect(plan.dropped).toEqual([row("9")]);
    expect(plan.keptOutside).toEqual([row("8", "p8")]);
    expect(plan.toCreate).toEqual([combo("1")]);
  });
});


/**
 * El freno de «fotos sin repartir».
 *
 * Lo que reportó Paula: al crear un grupo nuevo, las fotos salían repartidas
 * a todas las variantes sin que ella lo pidiera, y editar el grupo después
 * siempre lo arreglaba. No era azar: el bloque «Reparto por variante» está en
 * el paso 1 y solo aparece cuando ya hay colores o diseños elegidos, que se
 * eligen en el paso 2, más abajo. En un grupo nuevo se suben las fotos
 * primero (sin colores todavía, así que no hay bloque), se baja a elegir
 * colores y se guarda sin volver a subir: el bloque ya estaba, pero por
 * encima de donde se está mirando.
 *
 * Y una foto sin entrada no queda «sin decidir»: `resolveVariantImages` la
 * trata igual que un «todas» explícito. Al editar, `initialData` trae colores
 * y diseños desde el principio, el bloque se ve de entrada y por eso «editar
 * después» siempre funcionaba.
 */
describe("fotos sin repartir", () => {
  const foto = (url: string) => ({ url });
  const dosVariantes = 2;

  it("señala solo las fotos que nadie tocó", () => {
    expect(
      findUnassignedGroupImages(
        [foto("a.jpg"), foto("b.jpg"), foto("c.jpg")],
        [{ url: "a.jpg", scope: "color-1" }],
      ),
    ).toEqual(["b.jpg", "c.jpg"]);
  });

  it("sin reparto ninguno, todas están sin repartir", () => {
    expect(findUnassignedGroupImages([foto("a.jpg")], undefined)).toEqual(["a.jpg"]);
    expect(findUnassignedGroupImages([foto("a.jpg")], [])).toEqual(["a.jpg"]);
  });

  /** El caso exacto de Paula. */
  it("grupo nuevo de varias variantes con fotos sin tocar: no se guarda", () => {
    const { block, missing } = shouldBlockForUnassignedImages(
      [foto("a.jpg"), foto("b.jpg")],
      [],
      dosVariantes,
    );
    expect(block).toBe(true);
    expect(missing).toEqual(["a.jpg", "b.jpg"]);
  });

  it("basta una sola foto sin repartir para frenar", () => {
    expect(
      shouldBlockForUnassignedImages(
        [foto("a.jpg"), foto("b.jpg")],
        [{ url: "a.jpg", scope: "color-1" }],
        dosVariantes,
      ),
    ).toEqual({ block: true, missing: ["b.jpg"] });
  });

  it("con todo repartido se guarda", () => {
    expect(
      shouldBlockForUnassignedImages(
        [foto("a.jpg"), foto("b.jpg")],
        [
          { url: "a.jpg", scope: "color-1" },
          { url: "b.jpg", scope: "design-9" },
        ],
        dosVariantes,
      ),
    ).toEqual({ block: false, missing: [] });
  });

  /**
   * «Todas las variantes» elegido a mano es una decisión, no un descuido: el
   * freno es para el silencio, nunca para lo que alguien pidió a propósito.
   */
  it("«todas» puesto a mano vale y no frena nada", () => {
    expect(
      shouldBlockForUnassignedImages(
        [foto("a.jpg"), foto("b.jpg")],
        [
          { url: "a.jpg", scope: "all" },
          { url: "b.jpg", scope: "all" },
        ],
        dosVariantes,
      ),
    ).toEqual({ block: false, missing: [] });
  });

  it("con una sola variante no hay nada que repartir: se guarda igual", () => {
    // Un color por un diseño sigue siendo UNA variante, aunque se hayan
    // marcado atributos en las dos listas.
    expect(
      shouldBlockForUnassignedImages([foto("a.jpg"), foto("b.jpg")], [], 1),
    ).toEqual({ block: false, missing: [] });
    // Y un grupo sin variantes todavía tampoco se frena.
    expect(shouldBlockForUnassignedImages([foto("a.jpg")], [], 0)).toEqual({
      block: false,
      missing: [],
    });
  });

  it("editar un grupo ya repartido no se frena por error", () => {
    // Al abrir, `initialData` trae el reparto guardado de cada foto.
    const guardadas = [foto("vieja-1.jpg"), foto("vieja-2.jpg")];
    const repartoGuardado = [
      { url: "vieja-1.jpg", scope: "color-1" },
      { url: "vieja-2.jpg", scope: "all" },
    ];
    expect(
      shouldBlockForUnassignedImages(guardadas, repartoGuardado, 4),
    ).toEqual({ block: false, missing: [] });
  });

  it("una foto marcada para quitar no puede frenar el guardado", () => {
    // `onSubmit` mira las fotos que sobreviven, no las que se van: se
    // comprueba con la misma pareja de ayudantes que usa el formulario.
    const todas = [foto("queda.jpg"), foto("se-va.jpg")];
    const sobreviven = applyPendingImageRemovals(todas, ["se-va.jpg"]);
    const reparto = [{ url: "queda.jpg", scope: "color-1" }];
    expect(
      shouldBlockForUnassignedImages(sobreviven, reparto, dosVariantes),
    ).toEqual({ block: false, missing: [] });
  });
});
