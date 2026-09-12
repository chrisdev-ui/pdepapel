// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("axios", () => ({ default: { post: vi.fn() }, isAxiosError: () => false }));

import { groupBySupplier, ReplenishmentBySupplier } from "@/app/(dashboard)/[storeId]/(routes)/inventario/components/replenishment-by-supplier";
import type { InventoryRow } from "@/app/(dashboard)/[storeId]/(routes)/inventario/server/get-inventory";
import { computeReplenishment } from "@/lib/replenishment";

const row = (id: string, name: string, stock: number, sold30: number, supplier: { id: string; name: string } | null, extra: Partial<InventoryRow> = {}): InventoryRow => ({
  id, name, sku: id.toUpperCase(), stock, price: 10000, acqPrice: 4000, isKit: false, updatedAt: new Date(), categoryName: "Cuadernos", supplier, image: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
  lastCost: 4000, lastCostSource: "purchase", lastCostAt: new Date("2026-08-05T15:00:00.000Z"), limitingComponent: null, sold30, sold90: sold30, soldViaKits30: 0, onOrder: 0,
  signal: computeReplenishment({ stock, sold30, sold90: sold30, onOrder: extra.onOrder ?? 0 }),
  ...extra,
});

const henko = { id: "sup-henko", name: "Henko" };
const rows = [
  row("p1", "Cuaderno azul", 1, 14, henko),
  row("p2", "Washi", 2, 12, henko, { onOrder: 4, signal: computeReplenishment({ stock: 2, sold30: 12, sold90: 12, onOrder: 4 }) }),
  row("p3", "Stickers", 0, 3, null),
];

beforeEach(() => push.mockClear());
afterEach(cleanup);

describe("groupBySupplier", () => {
  it("groups by supplier with the unassigned last and sums units on order", () => {
    const groups = groupBySupplier(rows);
    expect(groups.map((g) => g.name)).toEqual(["Henko", "Sin proveedor asignado"]);
    expect(groups[0].onOrderUnits).toBe(4);
    expect(groups[0].rows.map((r) => r.id)).toEqual(["p1", "p2"]);
  });
});

describe("ReplenishmentBySupplier", () => {
  it("creates a draft with the ticked lines at the last purchase cost and opens it", async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { id: "po-9", orderNumber: "PO-0040" } });
    const user = userEvent.setup();
    render(<ReplenishmentBySupplier rows={rows} storeId="store-1" />);

    expect(screen.getByText(/4 unidades en camino de este proveedor/)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Incluir Washi" }));
    await user.click(screen.getByRole("button", { name: /Crear borrador con 1 línea/ }));

    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
    expect(vi.mocked(axios.post).mock.calls[0][0]).toBe("/api/store-1/restock-orders");
    expect(vi.mocked(axios.post).mock.calls[0][1]).toMatchObject({ supplierId: "sup-henko", status: "DRAFT", items: [{ productId: "p1", quantity: 13, cost: 4000 }] });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/store-1/aprovisionamiento/po-9"));
  });

  it("lets a product without supplier start its own draft instead of a group draft", () => {
    render(<ReplenishmentBySupplier rows={rows} storeId="store-1" />);
    expect(screen.getAllByRole("button", { name: /Crear borrador/ })).toHaveLength(1);
    expect(screen.getByText(/al recibir el pedido, el producto queda con ese proveedor/)).toBeInTheDocument();
    const stickers = screen.getByText("Stickers").closest("tr") as HTMLElement;
    // Agotado con 3 vendidos en 30 días: 3/30 × 28 = 2,8 → 3 sugeridos.
    expect(within(stickers).getByRole("link", { name: "Reponer" })).toHaveAttribute("href", "/store-1/aprovisionamiento/nuevo?producto=p3&cantidad=3");
    expect(within(stickers).getByRole("link", { name: "Abrir producto" })).toHaveAttribute("href", "/store-1/productos/p3");
    expect(within(stickers).queryByRole("checkbox")).toBeNull();
  });

  it("shows where each cost comes from and keeps kits out of the draft", () => {
    const kit = row("k1", "Kit resaltadores", 2, 6, henko, { isKit: true, lastCost: null, lastCostSource: null, lastCostAt: null, limitingComponent: "Marcador lila" });
    const guessed = row("p4", "Marcador lila", 3, 9, henko, { lastCost: 1500, lastCostSource: "product", lastCostAt: null, soldViaKits30: 6 });
    const unknown = row("p5", "Borrador", 1, 5, henko, { lastCost: null, lastCostSource: null, lastCostAt: null });
    render(<ReplenishmentBySupplier rows={[rows[0], kit, guessed, unknown]} storeId="store-1" />);

    expect(screen.getByText("recibido el 5 ago")).toBeInTheDocument();
    expect(screen.getByText("costo del producto, sin compra recibida")).toBeInTheDocument();
    expect(screen.getByText("sin costo")).toBeInTheDocument();
    expect(screen.getByText(/6 vendidos dentro de kits en 30 días/)).toBeInTheDocument();

    const kitRow = screen.getByText("Kit resaltadores").closest("tr") as HTMLElement;
    expect(within(kitRow).queryByRole("checkbox")).toBeNull();
    expect(within(kitRow).getByText(/Se pide por componentes/)).toBeInTheDocument();
    // Tres líneas marcadas (el kit no cuenta), y el pie lo dice.
    expect(screen.getByRole("button", { name: /Crear borrador con 3 líneas/ })).toBeInTheDocument();
    expect(screen.getByText(/3 de 3 marcados/)).toBeInTheDocument();
  });
});
