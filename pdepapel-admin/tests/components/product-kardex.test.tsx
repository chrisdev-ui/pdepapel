// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
const modalProps = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
  useParams: () => ({ storeId: "store-1" }),
  usePathname: () => "/store-1/movimientos-inventario/producto/p1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/(dashboard)/[storeId]/(routes)/movimientos-inventario/components/adjust-inventory-modal", () => ({
  AdjustInventoryModal: (props: Record<string, unknown>) => {
    modalProps.last = props;
    return props.isOpen ? <div data-testid="adjust-modal">modal:{String(props.defaultProductId ?? "none")}</div> : null;
  },
}));

import { ProductKardexView } from "@/app/(dashboard)/[storeId]/(routes)/movimientos-inventario/producto/[productId]/components/product-kardex";
import type { KardexRow, ProductKardex } from "@/app/(dashboard)/[storeId]/(routes)/movimientos-inventario/producto/[productId]/server/get-product-kardex";

const row = (overrides: Partial<KardexRow>): KardexRow => ({
  id: "m1",
  type: "MANUAL_ADJUSTMENT",
  quantity: 2,
  previousStock: 3,
  newStock: 5,
  cost: 4000,
  createdAt: new Date("2026-09-11T22:08:00.000Z"),
  who: "Camila",
  reference: null,
  ...overrides,
});

const kardex = (overrides: Partial<ProductKardex> = {}, product: Partial<ProductKardex["product"]> = {}, metrics: Partial<ProductKardex["metrics"]> = {}): ProductKardex => ({
  product: { id: "p1", name: "Cuaderno Snoopy", sku: "CUA-1", stock: 8, acqPrice: 18500, isKit: false, supplier: { id: "sup-1", name: "Papelería Bogotá" }, ...product },
  threshold: 5,
  metrics: {
    sold30: 6,
    weeklyRate: 1.4,
    coverDays: 40,
    received90: 20,
    receipts90: 1,
    adjustments90: { total: -1, byType: { DAMAGE: 1 } },
    balanced: true,
    latestBalance: 8,
    ...metrics,
  },
  rows: [
    row({ id: "m1", type: "ORDER_PLACED", quantity: -2, newStock: 8, who: "Tienda en línea", reference: { kind: "order", label: "ORD-100", secondary: "Ana Pérez · Medellín", href: "/store-1/pedidos/o1" } }),
    row({ id: "m2", type: "RESTOCK_RECEIVED", quantity: 20, newStock: 10, who: "Camila", reference: { kind: "restock", label: "PO-1001", secondary: "Papelería Bogotá", href: "/store-1/aprovisionamiento/r1" } }),
    row({ id: "m3", type: "FESTIVAL_ALLOCATION", quantity: -5, newStock: -10, who: "Camila", reference: { kind: "fair", label: "Feria Kawaii", secondary: null, href: "/store-1/ferias/f1" } }),
    row({ id: "m4", type: "DAMAGE", quantity: -1, newStock: -5, cost: null, who: "Camila", reference: { kind: "note", label: "“Se mojó en bodega”", secondary: null, href: null } }),
  ],
  openingBalance: 4,
  olderCount: 12,
  totalCount: 16,
  firstMovementAt: new Date("2025-03-15T12:00:00.000Z"),
  windowDays: 90,
  hasMore: false,
  ...overrides,
});

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
  modalProps.last = null;
});
afterEach(cleanup);

describe("ProductKardexView", () => {
  it("renders the header with a mint stock badge above the threshold", () => {
    render(<ProductKardexView storeId="store-1" kardex={kardex()} showAll={false} typeFilter={null} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Kardex · Cuaderno Snoopy");
    expect(screen.getByText("8 en stock")).toHaveClass("bg-tint-mint");
    expect(screen.getByText("CUA-1 · Papelería Bogotá · costo actual $ 18.500 · 16 movimientos desde marzo de 2025")).toBeInTheDocument();
  });

  it("uses cream at or below the threshold and pink at zero", () => {
    const { unmount } = render(<ProductKardexView storeId="store-1" kardex={kardex({}, { stock: 5 })} showAll={false} typeFilter={null} />);
    expect(screen.getByText("5 en stock")).toHaveClass("bg-tint-cream");
    unmount();
    render(<ProductKardexView storeId="store-1" kardex={kardex({}, { stock: 0, supplier: null })} showAll={false} typeFilter={null} />);
    expect(screen.getByText("0 en stock")).toHaveClass("bg-tint-pink");
    expect(screen.getByText(/Sin proveedor/)).toBeInTheDocument();
  });

  it("shows the metrics with their notes", () => {
    render(<ProductKardexView storeId="store-1" kardex={kardex()} showAll={false} typeFilter={null} />);
    expect(screen.getByText("1,4 por semana · 40 días de cobertura")).toBeInTheDocument();
    expect(screen.getByText("1 recepción")).toBeInTheDocument();
    expect(screen.getByText("1 daño")).toBeInTheDocument();
    expect(screen.getByText("El saldo de los movimientos coincide con el stock")).toBeInTheDocument();
  });

  it("warns when the stock does not match the latest balance", () => {
    render(<ProductKardexView storeId="store-1" kardex={kardex({}, { stock: 8 }, { balanced: false, latestBalance: 11 })} showAll={false} typeFilter={null} />);
    expect(screen.getByText("No cuadra")).toBeInTheDocument();
    expect(screen.getByText("El stock (8) no coincide con el último saldo (11): revisa los últimos movimientos")).toBeInTheDocument();
    expect(screen.getByText("No cuadra").closest("div.rounded-xl")).toHaveClass("border-tint-pink");
  });

  it("links references to the order, restock order and fair, and quotes plain reasons", () => {
    render(<ProductKardexView storeId="store-1" kardex={kardex()} showAll={false} typeFilter={null} />);
    expect(screen.getByRole("link", { name: "ORD-100" })).toHaveAttribute("href", "/store-1/pedidos/o1");
    expect(screen.getByText("Ana Pérez · Medellín")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PO-1001" })).toHaveAttribute("href", "/store-1/aprovisionamiento/r1");
    expect(screen.getByRole("link", { name: "Feria Kawaii" })).toHaveAttribute("href", "/store-1/ferias/f1");
    expect(screen.getByText("“Se mojó en bodega”")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "“Se mojó en bodega”" })).toBeNull();
  });

  it("renders each row with label, signed quantity, balance, cost and actor", () => {
    render(<ProductKardexView storeId="store-1" kardex={kardex()} showAll={false} typeFilter={null} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);
    const first = within(rows[0]);
    expect(first.getByText("11 sept · 17:08")).toBeInTheDocument();
    expect(first.getByText("Venta")).toHaveClass("bg-tint-sky");
    expect(first.getByText("−2")).toHaveClass("text-red-600");
    expect(first.getByText("Tienda en línea")).toBeInTheDocument();
    const second = within(rows[1]);
    expect(second.getByText("Recepción")).toHaveClass("bg-tint-mint");
    expect(second.getByText("+20")).toHaveClass("text-green-600");
    expect(within(rows[3]).getByText("—")).toBeInTheDocument();
  });

  it("shows the opening balance footer and toggles ?todo=1 keeping the type filter", () => {
    render(<ProductKardexView storeId="store-1" kardex={kardex()} showAll={false} typeFilter="ORDER_PLACED" />);
    expect(screen.getByText(/Saldo inicial del periodo:/)).toHaveTextContent("Saldo inicial del periodo: 4 · 12 movimientos anteriores");
    expect(screen.getByRole("link", { name: "Ver todo el historial" })).toHaveAttribute("href", "/store-1/movimientos-inventario/producto/p1?todo=1&tipo=ORDER_PLACED");
    cleanup();
    render(<ProductKardexView storeId="store-1" kardex={kardex({ windowDays: null })} showAll typeFilter={null} />);
    expect(screen.getByRole("link", { name: "Ver solo los últimos 90 días" })).toHaveAttribute("href", "/store-1/movimientos-inventario/producto/p1");
  });

  it("opens the adjust modal with the product preselected and links Reponer with supplier and product", async () => {
    render(<ProductKardexView storeId="store-1" kardex={kardex()} showAll={false} typeFilter={null} />);
    expect(screen.getByRole("link", { name: "Reponer" })).toHaveAttribute("href", "/store-1/aprovisionamiento/nuevo?proveedor=sup-1&producto=p1");
    expect(screen.getByRole("link", { name: "Volver a inventario" })).toHaveAttribute("href", "/store-1/inventario");
    await userEvent.click(screen.getByRole("button", { name: "Ajustar inventario" }));
    expect(screen.getByTestId("adjust-modal")).toHaveTextContent("modal:p1");
    expect(modalProps.last?.defaultProductId).toBe("p1");
  });

  it("shows an empty state when the window has no rows", () => {
    render(<ProductKardexView storeId="store-1" kardex={kardex({ rows: [], olderCount: 0, openingBalance: 0 })} showAll={false} typeFilter={null} />);
    expect(screen.getByText("No hay movimientos en últimos 90 días.")).toBeInTheDocument();
  });
});
