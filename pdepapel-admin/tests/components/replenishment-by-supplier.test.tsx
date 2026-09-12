// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
  id, name, sku: id.toUpperCase(), stock, price: 10000, acqPrice: 4000, isKit: false, updatedAt: new Date(), categoryName: "Cuadernos", supplier, image: "https://res.cloudinary.com/demo/image/upload/sample.jpg", lastMovement: null,
  lastCost: 4000, limitingComponent: null, sold30, sold90: sold30, onOrder: 0,
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

  it("has no draft button for products without a supplier", () => {
    render(<ReplenishmentBySupplier rows={rows} storeId="store-1" />);
    expect(screen.getAllByRole("button", { name: /Crear borrador/ })).toHaveLength(1);
    expect(screen.getByText(/recibir un pedido de aprovisionamiento lo asigna solo/)).toBeInTheDocument();
  });
});
