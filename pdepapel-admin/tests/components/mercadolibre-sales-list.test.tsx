// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MercadoLibreHistoricalSales } from "@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/historical-sales";

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
  usePathname: () => "/store-1/mercadolibre",
  useSearchParams: () => new URLSearchParams("tab=ventas"),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const base = {
  externalPackId: null,
  inventoryError: null,
  buyerName: "Ana Pérez",
  paidAt: "2026-09-01T12:00:00.000Z",
  createdAt: "2026-09-01T12:00:00.000Z",
  totalAmount: 69_000,
  marketplaceFee: 13_110,
  shippingCost: 8_500,
  taxesAmount: 933,
  netAmount: 46_457,
  refundedAmount: null,
  refundReason: null,
  historical: false,
  moneyReleaseStatus: null,
  items: [{ title: "Agenda kawaii", quantity: 1, unitPrice: 69_000, product: { name: "Agenda kawaii", sku: "AGE-1" } }],
};

const sales = [
  { ...base, id: "s1", externalOrderId: "2000000000000001", status: "PAID", inventoryStatus: "DECREMENTED" },
  { ...base, id: "s2", externalOrderId: "2000000000000002", status: "PAID", inventoryStatus: "EXCEPTION", inventoryError: "Sin relación local: Sticker", netAmount: null, marketplaceFee: null, shippingCost: null, taxesAmount: null },
  { ...base, id: "s3", externalOrderId: "2000000000000003", status: "CANCELLED", inventoryStatus: "RESTOCK_PENDING", inventoryError: "La venta fue cancelada. Confirma el retorno físico antes de devolver unidades al inventario." },
  { ...base, id: "s4", externalOrderId: "2000000000000004", status: "PAID", inventoryStatus: "DECREMENTED", historical: true, netAmount: 40_000 },
];

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: string) => {
    if (String(input).includes("/historical-sales?")) {
      return { ok: true, json: async () => ({ data: sales, total: sales.length, linkedSale: null }) };
    }
    return { ok: true, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Ventas de Mercado Libre", () => {
  it("opens on what needs attention and names the action per row", async () => {
    render(<MercadoLibreHistoricalSales storeId="store-1" canReconcile highlightedOrderId={null} />);

    await waitFor(() => expect(screen.getByRole("tab", { name: /Por atender/ })).toHaveAttribute("aria-selected", "true"));
    expect(screen.getByRole("tab", { name: /Por atender/ })).toHaveTextContent("2");
    expect(screen.getByRole("tab", { name: /Pagadas/ })).toHaveTextContent("3");
    expect(screen.getByRole("tab", { name: /Canceladas y reembolsos/ })).toHaveTextContent("1");

    expect(screen.getAllByRole("button", { name: "Re-sincronizar" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Confirmar retorno físico" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sin relación local: Sticker").length).toBeGreaterThan(0);
    // Una venta sana no está en «Por atender».
    expect(screen.queryByText("2000000000000001")).not.toBeInTheDocument();
  });

  it("shows unknown charges as a dash and never calls a hand-typed net 'confirmed by Mercado Libre'", async () => {
    render(<MercadoLibreHistoricalSales storeId="store-1" canReconcile highlightedOrderId={null} />);
    await waitFor(() => expect(screen.getByRole("tab", { name: /Todas/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: /Todas/ }));

    await waitFor(() => expect(screen.getAllByText("2000000000000004").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Neto ingresado a mano al importar la venta").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Neto confirmado por Mercado Libre").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Se conocen al liquidar").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Liquidación pendiente de Mercado Libre").length).toBeGreaterThan(0);
  });

  it("keeps the import tool below the list and marks it as the exception", async () => {
    render(<MercadoLibreHistoricalSales storeId="store-1" canReconcile highlightedOrderId={null} />);
    await waitFor(() => expect(screen.getByRole("tab", { name: /Todas/ })).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Importar una venta anterior a la integración" })).toBeInTheDocument();
    expect(screen.getByLabelText("Número de venta o pack")).toBeInTheDocument();
  });
});
