// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { productLine } from "@/lib/sell-cart";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), toast: vi.fn() }));

vi.mock("axios", () => ({ default: { get: mocks.get, post: mocks.post, isAxiosError: () => false } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <img alt={props.alt} /> }));
vi.mock("@/components/invoice/invoice-download-button", () => ({ InvoiceDownloadButton: () => <button type="button">Recibo</button> }));
// La única entrada de la venta: buscar o escanear. Aquí se simula con un botón que agrega una línea.
vi.mock("@/components/sales/sale-search", () => ({
  SaleSearch: ({ onAdd }: { onAdd: (line: unknown) => void }) => (
    <button type="button" onClick={() => onAdd(productLine({ productId: "p-1", name: "Cartuchera maleta crema", price: 30000, originalPrice: 36000, offerLabel: "Oferta", maxQuantity: 1 }))}>
      Buscar o escanear
    </button>
  ),
}));

import { SellPanel } from "@/app/(dashboard)/[storeId]/(routes)/ventas-rapidas/components/sell-panel";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

/**
 * Vender (punto de venta): una sola entrada, precio con oferta, tres métodos
 * de pago, referencia en transferencia, y la tarjeta de después de la venta
 * que espera al datáfono o deja deshacer.
 */
describe("Vender · punto de venta", () => {
  it("adds through the single entry with the offer price and posts the transfer reference", async () => {
    mocks.post.mockResolvedValue({ data: { order: { id: "o-1", orderNumber: "V-1", paidAt: new Date().toISOString() }, duplicate: false, pending: false, terminal: null } });
    render(<SellPanel />);
    expect(screen.queryByLabelText("Código de barras o QR")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Buscar o escanear" }));
    const cart = await screen.findByRole("list", { name: "Productos en la venta" });
    expect(cart).toHaveTextContent("Cartuchera maleta crema");
    expect(cart).toHaveTextContent("antes $ 36.000");
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    fireEvent.click(screen.getByRole("radio", { name: /Transferencia/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Registrar pago" })[0]);
    fireEvent.change(screen.getByLabelText("Referencia de la transferencia"), { target: { value: "NEQUI-778" } });
    fireEvent.click(screen.getByRole("button", { name: "Sí, registrar pago" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/api/store-1/point-of-sale/sales", expect.objectContaining({ items: [{ productId: "p-1", quantity: 1 }], paymentMethod: "BankTransfer", transactionId: "NEQUI-778" })));
    const done = await screen.findByTestId("sale-done");
    expect(done).toHaveAttribute("data-state", "paid");
    expect(screen.getByRole("link", { name: /V-1/ })).toHaveAttribute("href", "/store-1/pedidos/o-1");
    expect(screen.getByRole("button", { name: /Deshacer/ })).toBeInTheDocument();
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Venta registrada" }));
  });

  it("sends a card-terminal sale and shows the waiting card until Bold confirms", async () => {
    mocks.post.mockResolvedValue({ data: { order: { id: "o-2", orderNumber: "V-2", paidAt: null }, duplicate: false, pending: true, terminal: "Cobro enviado al datáfono" } });
    mocks.get.mockResolvedValue({ data: { status: "PENDING" } });
    render(<SellPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Buscar o escanear" }));
    await screen.findByRole("list", { name: "Productos en la venta" });
    fireEvent.click(screen.getByRole("radio", { name: /Datáfono/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Registrar pago" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Sí, enviar al datáfono" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/api/store-1/point-of-sale/sales", expect.objectContaining({ paymentMethod: "Bold" })));
    const done = await screen.findByTestId("sale-done");
    expect(done).toHaveAttribute("data-state", "pending");
    expect(done).toHaveTextContent("Esperando al datáfono");
    expect(done).toHaveTextContent("Cobro enviado al datáfono");
  });

  it("shows the server's plain message when the sale fails", async () => {
    mocks.post.mockRejectedValue({ response: { data: { error: "No alcanzó el inventario: Cartuchera maleta crema (hay 0, pediste 1). No se registró nada; ajusta las cantidades o revisa Inventario." } } });
    render(<SellPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Buscar o escanear" }));
    await screen.findByRole("list", { name: "Productos en la venta" });
    fireEvent.click(screen.getAllByRole("button", { name: "Registrar pago" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Sí, registrar pago" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "No se pudo registrar la venta", description: expect.stringContaining("hay 0, pediste 1") })));
  });
});
