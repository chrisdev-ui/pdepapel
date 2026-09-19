// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildSaleInvoiceData, buildSaleShareMessage, SaleDoneCard } from "@/components/sales/sale-done-card";
import type { SellCompletedSale } from "@/components/sales/sell-panel";
import { productLine } from "@/lib/sell-cart";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), toast: vi.fn(), refresh: vi.fn() }));

vi.mock("axios", () => ({ default: { get: mocks.get, post: mocks.post } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/invoice/invoice-download-button", () => ({ InvoiceDownloadButton: ({ data }: { data: { orderNumber: string } }) => <button type="button">Recibo {data.orderNumber}</button> }));

/** El estado de la venta vive fuera de la tarjeta (el panel lo conserva): aquí lo sostiene un envoltorio. */
function Harness({ initial, pollMs }: { initial: SellCompletedSale; pollMs?: number }) {
  const [current, setCurrent] = useState(initial);
  return <SaleDoneCard storeId="store-1" sale={current} onNewSale={vi.fn()} onChange={(patch) => setCurrent((prev) => ({ ...prev, ...patch }))} pollMs={pollMs} />;
}

const line = productLine({ productId: "p-1", name: "Libreta", price: 8000, originalPrice: 10000, chips: ["Rosa"], detail: "SKU LIB-1 · 3 und", maxQuantity: 3 });
const paidAt = new Date("2026-09-19T15:00:00Z");
const sale: SellCompletedSale = { orderNumber: "V-1", orderId: "o-1", lines: [line], paymentMethod: "CASH", total: 8000, units: 1, savings: 2000, at: paidAt, paidAt: paidAt.toISOString() };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => vi.resetAllMocks());

/**
 * Vender: la tarjeta de después de la venta enlaza al pedido, da el recibo y
 * WhatsApp, deja deshacer 30 minutos por la cancelación con reingreso, y con
 * datáfono espera a que Bold confirme.
 */
describe("SaleDoneCard", () => {
  it("links the order, offers the receipt and WhatsApp, and counts the undo window down", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-19T15:05:00Z"), shouldAdvanceTime: true });
    render(<Harness initial={sale} />);
    expect(screen.getByTestId("sale-done")).toHaveAttribute("data-state", "paid");
    expect(screen.getByRole("link", { name: /V-1/ })).toHaveAttribute("href", "/store-1/pedidos/o-1");
    expect(await screen.findByRole("button", { name: "Recibo V-1" })).toBeInTheDocument();
    const whatsapp = screen.getByRole("link", { name: /WhatsApp/ });
    expect(whatsapp.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(decodeURIComponent(whatsapp.getAttribute("href") ?? "")).toContain("Pedido V-1");
    expect(screen.getByRole("button", { name: /Deshacer · 25 min/ })).toBeInTheDocument();
    expect(screen.getByText(/\$ 2\.000 de rebaja por ofertas/)).toBeInTheDocument();
  });

  it("hides «Deshacer» once 30 minutes passed and points to inventory movements", () => {
    vi.useFakeTimers({ now: new Date("2026-09-19T15:31:00Z") });
    render(<Harness initial={sale} />);
    expect(screen.queryByRole("button", { name: /Deshacer/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Pasaron 30 minutos/)).toBeInTheDocument();
  });

  it("undoes through the point-of-sale route after confirming", async () => {
    mocks.post.mockResolvedValue({ data: { message: "Venta V-1 deshecha: el inventario volvió." } });
    render(<Harness initial={{ ...sale, at: new Date(), paidAt: new Date().toISOString() }} />);
    fireEvent.click(screen.getByRole("button", { name: /Deshacer/ }));
    expect(screen.getByText("¿Deshacer la venta V-1?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, deshacer" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/api/store-1/point-of-sale/sales/o-1/undo"));
    await waitFor(() => expect(screen.getByTestId("sale-done")).toHaveAttribute("data-state", "undone"));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Venta V-1 deshecha: el inventario volvió." }));
    expect(screen.queryByRole("button", { name: /Deshacer/ })).not.toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("waits for Bold on a card-terminal sale and flips to paid when the order is PAID", async () => {
    mocks.get.mockResolvedValueOnce({ data: { status: "PENDING" } }).mockResolvedValueOnce({ data: { status: "PAID", paidAt: new Date().toISOString() } });
    render(<Harness initial={{ ...sale, paymentMethod: "Bold", pending: true, paidAt: null, terminal: "Cobro enviado al datáfono" }} pollMs={20} />);
    expect(screen.getByTestId("sale-done")).toHaveAttribute("data-state", "pending");
    expect(screen.getByText("Esperando al datáfono")).toBeInTheDocument();
    expect(screen.getByText("Cobro enviado al datáfono")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar cobro" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Recibo/ })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("sale-done")).toHaveAttribute("data-state", "paid"));
    expect(mocks.get).toHaveBeenCalledWith("/api/store-1/orders/o-1");
    expect(await screen.findByRole("button", { name: "Recibo V-1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Deshacer · 30 min/ })).toBeInTheDocument();
  });

  it("reports a cancelled terminal charge without inventory changes", async () => {
    mocks.get.mockResolvedValue({ data: { status: "CANCELLED" } });
    render(<Harness initial={{ ...sale, paymentMethod: "Bold", pending: true, paidAt: null }} pollMs={20} />);
    await waitFor(() => expect(screen.getByTestId("sale-done")).toHaveAttribute("data-state", "cancelled"));
    expect(screen.getByText(/no se descontó inventario/)).toBeInTheDocument();
  });

  it("builds the receipt with the discounted line price and the WhatsApp summary without personal data", () => {
    const invoice = buildSaleInvoiceData(sale, paidAt);
    expect(invoice).toMatchObject({ orderNumber: "V-1", subtotal: 10000, discount: 2000, total: 8000, paymentMethod: "Efectivo", items: [{ name: "Libreta (Rosa)", quantity: 1, price: 8000, sku: "LIB-1" }] });
    const message = buildSaleShareMessage(sale, "P de Papel").replace(/\u00a0/g, " ");
    expect(message).toContain("Pedido V-1");
    expect(message).toContain("• 1 × Libreta (Rosa) · $ 8.000");
    expect(message).toContain("Total: $ 8.000 · Efectivo");
    expect(message).not.toMatch(/Consumidor|@|\+57/);
  });
});

describe("SaleDoneCard · timers", () => {
  it("does nothing on a network error while waiting and retries on the next tick", async () => {
    let calls = 0;
    mocks.get.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new Error("offline");
      return { data: { status: "PAID", paidAt: new Date().toISOString() } };
    });
    render(<Harness initial={{ ...sale, paymentMethod: "Bold", pending: true, paidAt: null }} pollMs={20} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    await waitFor(() => expect(screen.getByTestId("sale-done")).toHaveAttribute("data-state", "paid"));
  });
});
