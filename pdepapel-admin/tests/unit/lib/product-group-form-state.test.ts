import { describe, expect, it } from "vitest";

import {
  applyPendingImageRemovals,
  archivePayload,
  deriveArchiveMode,
  describeArchiveRows,
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
