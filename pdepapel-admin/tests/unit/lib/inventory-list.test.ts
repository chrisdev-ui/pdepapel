import { describe, expect, it } from "vitest";

import { groupBySupplier, paginateInventory, type InventoryListRow } from "@/lib/inventory-list";
import { parseInventoryListQuery } from "@/lib/inventory-list-query";
import { INVENTORY_VIEWS, inventoryMatchesView, summarizeInventory } from "@/lib/inventory-views";
import { compareUrgency, computeReplenishment } from "@/lib/replenishment";

const THRESHOLD = 3;
const suppliers = [{ id: "sup-a", name: "Henko" }, { id: "sup-b", name: "Ábaco" }, null];

/** 90 filas variadas: agotadas, sin costo, kits, durmientes y con ventas. */
const rows: InventoryListRow[] = Array.from({ length: 90 }, (_, i) => {
  const stock = i % 7 === 0 ? 0 : i % 5;
  const sold30 = i % 4 === 0 ? 0 : i % 9;
  const sold90 = sold30 + (i % 3);
  const onOrder = i % 11 === 0 ? 2 : 0;
  return {
    id: `p-${i}`,
    name: i === 1 ? "Lápiz HB" : i === 2 ? "Cuaderno rayado azul" : `Producto ${i}`,
    sku: `SKU-${i}`,
    categoryName: i % 2 ? "Lápices" : "Cuadernos",
    stock,
    price: 5000 + i,
    isKit: i % 13 === 0,
    onOrder,
    acqPrice: i % 6 === 0 ? null : 2000,
    supplier: suppliers[i % 3],
    signal: computeReplenishment({ stock, sold30, sold90, onOrder, threshold: THRESHOLD }),
  };
});

const page = (search: string, options: { viewer?: boolean } = {}) =>
  paginateInventory(rows, parseInventoryListQuery(new URLSearchParams(search)), { threshold: THRESHOLD, ...options });

/** Recorre todas las páginas y devuelve los ids, sin repetir. */
function walk(search: string) {
  const first = page(search);
  const ids = [...first.rows.map((row) => row.id)];
  for (let n = 2; n <= first.pageCount; n += 1) ids.push(...page(`${search}&pagina=${n}`).rows.map((row) => row.id));
  expect(new Set(ids).size).toBe(ids.length);
  return { first, ids };
}

describe("paginateInventory", () => {
  it("cada pestaña cuenta exactamente lo que listan sus páginas, con y sin búsqueda", () => {
    for (const q of ["", "q=lapiz"]) {
      const { counts } = page(q);
      for (const view of INVENTORY_VIEWS) {
        const { first, ids } = walk(`${q}&vista=${view.id}`);
        expect(first.total, `${view.id} ${q}`).toBe(counts[view.id]);
        expect(ids, `${view.id} ${q}`).toHaveLength(counts[view.id]);
      }
    }
    expect(page("").counts.todo).toBe(90);
  });

  it("«Por reponer» sale de la más urgente a la menos, como antes en el navegador", () => {
    const expected = rows.filter((row) => inventoryMatchesView(row, "por-reponer", THRESHOLD)).sort(compareUrgency).map((row) => row.id);
    expect(walk("vista=por-reponer").ids).toEqual(expected);
  });

  it("la búsqueda ignora tildes y mayúsculas, mira nombre, SKU y subcategoría en cualquier orden", () => {
    expect(page("vista=todo&q=LAPIZ hb").rows.map((row) => row.id)).toEqual(["p-1"]);
    expect(page("vista=todo&q=azul cuaderno").rows.map((row) => row.id)).toEqual(["p-2"]);
    expect(page("vista=todo&q=sku-89").rows.map((row) => row.id)).toEqual(["p-89"]);
    expect(page("vista=todo&q=lápices").total).toBe(45);
  });

  it("las cifras de la cabecera son de toda la tienda, no de la búsqueda", () => {
    expect(page("q=lapiz").totals).toEqual(summarizeInventory(rows, THRESHOLD));
  });

  it("ordena toda la lista por la columna pedida, no solo la página", () => {
    const stocks = walk("vista=todo&orden=-stock").ids.map((id) => rows.find((row) => row.id === id)!.stock);
    expect(stocks).toEqual([...stocks].sort((a, b) => b - a));
    expect(page("vista=todo&orden=product").rows[0].name).toBe("Cuaderno rayado azul");
  });

  it("agrupado por proveedora: todo lo que está por reponer, una vez, sin paginar", () => {
    const grouped = page("agrupar=proveedor");
    const replenish = rows.filter((row) => inventoryMatchesView(row, "por-reponer", THRESHOLD));
    expect(grouped.rows).toEqual([]);
    expect(grouped.groups).toEqual(groupBySupplier(replenish));
    expect(grouped.groups!.flatMap((group) => group.rows)).toHaveLength(replenish.length);
    expect(grouped.groups!.at(-1)!.id).toBeNull();
    // Solo en «Por reponer».
    expect(page("vista=todo&agrupar=proveedor").groups).toBeNull();
  });

  it("la cuenta de solo lectura no ve «Sin costo», no ordena por costo o proveedora, no agrupa y no recibe el valor a costo", () => {
    const viewer = page("vista=sin-costo&orden=-acqPrice&agrupar=proveedor", { viewer: true });
    expect(viewer.query.view).toBe("por-reponer");
    expect(viewer.query.sort).toBeNull();
    expect(viewer.groups).toBeNull();
    expect(viewer.counts["sin-costo"]).toBe(0);
    expect(viewer.totals.costValue).toBe(0);
    expect(page("vista=todo&orden=-supplier", { viewer: true }).query.sort).toBeNull();
    expect(page("vista=todo&orden=-stock", { viewer: true }).query.sort).toEqual({ id: "stock", desc: true });
  });

  it("una página de más cae en la última; un parámetro roto vuelve a lo de siempre", () => {
    const last = page("vista=todo&pagina=99");
    expect(last.page).toBe(last.pageCount);
    expect(page("vista=nada&pagina=-1&orden=secreto").query).toMatchObject({ view: "por-reponer", page: 1, sort: null, groupBySupplier: false });
    expect(page("vista=stock-critico").query.view).toBe("por-reponer");
  });
});
