import { describe, expect, it } from "vitest";

import { planGroupCoverBackfill, undoStatements, type BackfillGroup } from "@/lib/group-cover-backfill";

const at = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n));
const row = (id: string, url: string, extra: Partial<{ isMain: boolean; origin: "OWN" | "GROUP_COPY" | null; createdAt: Date }> = {}) => ({
  id,
  url,
  isMain: false,
  origin: "OWN" as const,
  createdAt: at(0),
  ...extra,
  updatedAt: new Date((extra.createdAt ?? at(0)).getTime() + 1000),
  brokenAt: null,
});

const group = (products: BackfillGroup["products"], images: BackfillGroup["images"] = [{ id: "g-cover", url: "portada.jpg", isMain: true, scope: "all" }, { id: "g-rosa", url: "rosa.jpg", isMain: false, scope: "COLOR|rosa" }]): BackfillGroup => ({
  id: "grupo-1",
  name: "Agendas",
  images,
  products,
});

describe("planGroupCoverBackfill", () => {
  it("quita la portada (copia o propia) de las variantes que conservan otra foto y deja la portada en su primera propia", () => {
    const plan = planGroupCoverBackfill([
      group([
        { id: "v1", name: "Agenda rosa", sku: "AG-1", isArchived: false, images: [row("a", "portada.jpg", { isMain: true, origin: "GROUP_COPY", createdAt: at(9) }), row("b", "rosa.jpg", { origin: "GROUP_COPY", createdAt: at(8) }), row("c", "propia.jpg", { createdAt: at(5) })] },
        { id: "v2", name: "Agenda azul", sku: "AG-2", isArchived: true, images: [row("d", "portada.jpg", { origin: "OWN" }), row("e", "azul.jpg", { isMain: true, createdAt: at(1) })] },
      ]),
    ]);
    expect(plan.scopeUpdates).toEqual([{ imageId: "g-cover", groupId: "grupo-1", before: "all" }]);
    expect(plan.deletions.map((d) => [d.productId, d.id])).toEqual([["v1", "a"], ["v2", "d"]]);
    // v1 perdió su portada: pasa a la primera propia, no a la copia repartida.
    expect(plan.coverChanges).toEqual([{ imageId: "c", productId: "v1", url: "propia.jpg" }]);
    expect(plan.touchedProductIds).toEqual(["v1", "v2"]);
    expect(plan.skipped).toEqual([]);
  });

  it("sin propias, la portada pasa a la primera foto repartida", () => {
    const plan = planGroupCoverBackfill([group([{ id: "v1", name: "Rosa", sku: null, isArchived: false, images: [row("a", "portada.jpg", { isMain: true, origin: "GROUP_COPY" }), row("b", "rosa.jpg", { origin: "GROUP_COPY", createdAt: at(1) })] }])]);
    expect(plan.coverChanges).toEqual([{ imageId: "b", productId: "v1", url: "rosa.jpg" }]);
  });

  it("no toca la variante que solo tiene la portada: queda de respaldo y sale en la lista", () => {
    const plan = planGroupCoverBackfill([
      group([
        { id: "v1", name: "Agenda verde", sku: "AG-3", isArchived: false, images: [row("a", "portada.jpg", { isMain: true, origin: "GROUP_COPY" })] },
        { id: "v2", name: "Agenda lila", sku: "AG-4", isArchived: false, images: [row("b", "portada.jpg", { isMain: true, origin: "OWN" })] },
        { id: "v3", name: "Sin fotos", sku: "AG-5", isArchived: false, images: [] },
      ]),
    ]);
    expect(plan.deletions).toEqual([]);
    expect(plan.coverChanges).toEqual([]);
    expect(plan.skipped.map((s) => s.sku)).toEqual(["AG-3", "AG-4"]);
  });

  it("un grupo sin portada no se toca y una portada ya marcada no se vuelve a marcar", () => {
    expect(planGroupCoverBackfill([group([], [{ id: "x", url: "x.jpg", isMain: false, scope: "all" }])])).toMatchObject({ scopeUpdates: [], deletions: [] });
    expect(planGroupCoverBackfill([group([], [{ id: "x", url: "x.jpg", isMain: true, scope: "GROUP_ONLY" }])]).scopeUpdates).toEqual([]);
  });

  it("las líneas de deshacer recrean las filas borradas y devuelven portadas y alcances", () => {
    const plan = planGroupCoverBackfill([
      group([{ id: "v1", name: "Rosa", sku: null, isArchived: false, images: [row("a", "portada.jpg", { isMain: true, origin: "GROUP_COPY", createdAt: at(3) }), row("c", "it's.jpg")] }]),
    ]);
    expect(undoStatements(plan)).toEqual([
      "INSERT INTO `Image` (`id`, `productId`, `url`, `isMain`, `origin`, `brokenAt`, `createdAt`, `updatedAt`) VALUES ('a', 'v1', 'portada.jpg', 1, 'GROUP_COPY', NULL, '2026-01-01 00:00:03.000', '2026-01-01 00:00:04.000');",
      "UPDATE `Image` SET `isMain` = 0 WHERE `id` = 'c';",
      "UPDATE `Image` SET `scope` = 'all' WHERE `id` = 'g-cover';",
    ]);
  });
});
