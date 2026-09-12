// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RestockOrderWorkspace } from "@/app/(dashboard)/[storeId]/(routes)/aprovisionamiento/[restockOrderId]/components/restock-order-workspace";
import type { RestockOrderWithRelations } from "@/lib/restock-orders-db";
import { RestockOrderStatus } from "@prisma/client";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1", restockOrderId: "po-1" }),
  useRouter: () => ({ refresh, push: vi.fn() }),
}));
vi.mock("axios", () => ({ default: { patch: vi.fn(), post: vi.fn(), delete: vi.fn(), isAxiosError: () => false } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const product = (name: string, sku: string) => ({ id: sku, name, sku, stock: 2, acqPrice: 14000, transportationCost: 0, supplierId: null });

const base: RestockOrderWithRelations = {
  id: "po-1",
  storeId: "store-1",
  supplierId: "sup-1",
  orderNumber: "PO-0036",
  status: RestockOrderStatus.PARTIALLY_RECEIVED,
  totalAmount: 60000,
  shippingCost: 6000,
  notes: "Llegan en dos entregas",
  createdAt: new Date("2026-09-09T15:00:00.000Z"),
  updatedAt: new Date("2026-09-11T15:00:00.000Z"),
  supplier: { id: "sup-1", name: "Henko Importaciones", leadTimeDays: 10 },
  items: [
    { id: "l1", restockOrderId: "po-1", productId: "CUA-AZU", index: 0, quantity: 2, quantityReceived: 1, cost: 15000, subtotal: 30000, product: product("Cuaderno azul", "CUA-AZU") },
    { id: "l2", restockOrderId: "po-1", productId: "RES-1", index: 1, quantity: 3, quantityReceived: 0, cost: 10000, subtotal: 30000, product: product("Resaltadores", "RES-1") },
  ],
  receipts: [
    { id: "r1", storeId: "store-1", restockOrderId: "po-1", idempotencyKey: "k1", receivedUnits: 1, lineCount: 1, excessUnits: 0, updatedCosts: true, lines: [], createdBy: "USER_1", createdAt: new Date("2026-09-11T15:42:00.000Z") },
  ],
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("RestockOrderWorkspace", () => {
  it("shows progress, totals aligned under the subtotal, receipts and refuses to cancel once something arrived", () => {
    render(<RestockOrderWorkspace order={base} />);
    expect(screen.getByRole("heading", { name: "Pedido PO-0036" })).toBeInTheDocument();
    expect(screen.getByText(/1 de 5 unidades recibidas/)).toBeInTheDocument();
    expect(screen.getByText("4 unidades pendientes")).toBeInTheDocument();
    expect(screen.getByText("Envío / logística")).toBeInTheDocument();
    expect(screen.getByText("$ 66.000")).toBeInTheDocument();
    expect(screen.getByText(/1 unidad en 1 línea/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver movimientos" })).toHaveAttribute("href", "/store-1/movimientos-inventario?referencia=po-1");
    expect(screen.queryByRole("button", { name: "Cancelar pedido" })).toBeNull();
    expect(screen.getByRole("button", { name: /Cerrar pedido \(faltan 4\)/ })).toBeInTheDocument();
    expect(screen.getAllByText(/Con mercancía recibida ya no se puede cancelar/).length).toBeGreaterThan(0);
  });

  it("saves notes on their own, without touching the lines", async () => {
    vi.mocked(axios.patch).mockResolvedValue({ data: {} });
    render(<RestockOrderWorkspace order={base} />);
    const header = screen.getAllByRole("button", { name: "Guardar notas" })[0];
    expect(header).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Notas del pedido"), { target: { value: "Segunda entrega el viernes" } });
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Guardar notas" })[0]);
    });
    await waitFor(() => expect(axios.patch).toHaveBeenCalledWith("/api/store-1/restock-orders/po-1", { notes: "Segunda entrega el viernes" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("offers cancel while nothing has been received and opens the receive dialog", async () => {
    const untouched: RestockOrderWithRelations = {
      ...base,
      status: RestockOrderStatus.ORDERED,
      items: base.items.map((item) => ({ ...item, quantityReceived: 0 })),
      receipts: [],
    };
    render(<RestockOrderWorkspace order={untouched} />);
    expect(screen.getByRole("button", { name: "Cancelar pedido" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recibir mercancía" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Recibir mercancía de PO-0036");
  });
});
