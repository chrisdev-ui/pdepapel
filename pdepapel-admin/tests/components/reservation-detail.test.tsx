// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * El detalle de una reserva: cambiar la cantidad guarda solo al tocar
 * «Guardar», quitar pide confirmación, «Agregar productos» abre la hoja sobre
 * esta reserva, el historial dice quién y qué sin datos de la clienta, y una
 * convertida se edita desde su pedido.
 */
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), toast: vi.fn(), push: vi.fn(), refresh: vi.fn() }));

vi.mock("axios", () => ({
  default: { get: mocks.get, post: mocks.post, patch: mocks.patch, isAxiosError: (error: unknown) => Boolean((error as { isAxiosError?: boolean })?.isAxiosError) },
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }), useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/ui/async-product-select", () => ({ AsyncProductSelect: () => <output data-testid="picker" /> }));
vi.mock("@/components/ui/product-scan-button", () => ({ ProductScanButton: () => null }));
vi.mock("@/components/ui/user-combobox", () => ({ UserCombobox: () => null }));
vi.mock("@/components/ui/phone-input", () => ({
  PhoneInput: ({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) => (
    <input id={id} aria-label="Celular" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

import { ReservationDetail, type ReservationDetailView } from "@/app/(dashboard)/[storeId]/(routes)/reservas/[reservationId]/components/reservation-detail";

const product = (id: string, name: string, stock = 10, reservedUnits = 3) => ({ id, name, sku: id, isKit: false, stock, reservedUnits, images: [] });

const detail = (overrides: Partial<ReservationDetailView["reservation"]> = {}): ReservationDetailView => ({
  reservation: {
    id: "r-1",
    productId: null,
    quantity: null,
    customerName: "Laura",
    customerPhone: "+573001234567",
    note: "Paga el viernes",
    expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    status: "ACTIVE",
    orderId: null,
    unbackedAt: null,
    createdAt: new Date().toISOString(),
    closedAt: null,
    product: null,
    items: [
      { id: "i-1", productId: "p-1", quantity: 2, unbackedAt: null, product: product("p-1", "Sobre de manila") },
      { id: "i-2", productId: "p-2", quantity: 1, unbackedAt: null, product: product("p-2", "Libreta") },
    ],
    order: null,
    ...overrides,
  },
  events: [
    { id: "e-3", kind: "item_removed", productId: "p-9", quantity: 0, previousQuantity: 2, actor: "user_owner", detail: null, createdAt: "2026-10-15T15:10:00.000Z" },
    { id: "e-2", kind: "item_added", productId: "p-2", quantity: 1, previousQuantity: 0, actor: "user_owner", detail: null, createdAt: "2026-10-15T15:05:00.000Z" },
    { id: "e-1", kind: "created", productId: null, quantity: null, previousQuantity: null, actor: "user_owner", detail: { items: 2, days: 3 }, createdAt: "2026-10-15T15:00:00.000Z" },
  ],
  productNames: { "p-1": "Sobre de manila", "p-2": "Libreta", "p-9": "Washi tape" },
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("detalle de una reserva", () => {
  it("si vence en menos de 24 h ofrece «Extender» arriba, en un toque; con más tiempo, no", async () => {
    mocks.patch.mockResolvedValue({ data: {} });
    const { unmount } = render(<ReservationDetail storeId="store-1" detail={detail()} defaultDays={3} />);
    expect(screen.queryByTestId("extend-offer")).toBeNull();
    unmount();

    render(<ReservationDetail storeId="store-1" detail={detail({ expiresAt: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString() })} defaultDays={3} />);
    fireEvent.click(within(screen.getByTestId("extend-offer")).getByRole("button", { name: /Extender 3 días/ }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("/api/store-1/stock-reservations/r-1", { action: "extender", days: 3 }));
  });

  it("cambiar la cantidad guarda solo con «Guardar»", async () => {
    mocks.patch.mockResolvedValue({ data: { reservation: {}, released: false } });
    render(<ReservationDetail storeId="store-1" detail={detail()} defaultDays={3} />);
    const [first] = screen.getAllByTestId("reservation-line");
    expect(within(first).queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
    fireEvent.click(within(first).getByRole("button", { name: /aumentar|más|\+/i }));
    fireEvent.click(within(first).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("/api/store-1/stock-reservations/r-1", { action: "set_quantity", itemId: "i-1", quantity: 3 }));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("quitar pide confirmación y manda cantidad 0", async () => {
    mocks.patch.mockResolvedValue({ data: { reservation: {}, released: false } });
    render(<ReservationDetail storeId="store-1" detail={detail()} defaultDays={3} />);
    fireEvent.click(screen.getByRole("button", { name: "Quitar Libreta" }));
    expect(mocks.patch).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"));
    expect(dialog).toHaveTextContent("1 × Libreta vuelve a estar a la venta.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Quitar" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("/api/store-1/stock-reservations/r-1", { action: "set_quantity", itemId: "i-2", quantity: 0 }));
  });

  it("«Agregar productos» abre la hoja sobre esta reserva, sin pedir otra vez la clienta", async () => {
    render(<ReservationDetail storeId="store-1" detail={detail()} defaultDays={3} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar productos" }));
    const sheet = await screen.findByRole("dialog", { name: "Agregar a la reserva" });
    expect(sheet).toHaveTextContent("Reserva de Laura");
    expect(within(sheet).queryByLabelText("Nombre")).not.toBeInTheDocument();
  });

  it("el historial dice qué pasó y que fue desde el panel, también de un producto ya quitado, sin datos de la clienta", () => {
    render(<ReservationDetail storeId="store-1" detail={detail()} defaultDays={3} />);
    const history = screen.getByTestId("reservation-history");
    expect(history).toHaveTextContent("Quitó Washi tape (2 unidades)");
    expect(history).toHaveTextContent("Agregó 1 unidad de Libreta");
    expect(history).toHaveTextContent("Creó la reserva con 2 productos por 3 días");
    expect(history).toHaveTextContent("· Panel");
    expect(history).not.toHaveTextContent("user_owner");
    expect(history).not.toHaveTextContent("3001234567");
  });

  it("una reserva convertida se edita desde su pedido: sin cantidades ni «Agregar productos»", () => {
    render(
      <ReservationDetail
        storeId="store-1"
        detail={detail({ status: "CONVERTED", orderId: "o-1", order: { id: "o-1", orderNumber: "ORD-77", status: "PENDING" } })}
        defaultDays={3}
      />,
    );
    const note = screen.getByTestId("converted-note");
    expect(note).toHaveTextContent("Se edita desde el pedido ORD-77");
    expect(within(note).getByRole("link", { name: "ORD-77" })).toHaveAttribute("href", "/store-1/pedidos/o-1");
    expect(screen.queryByRole("button", { name: "Agregar productos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Quitar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Convertir en pedido" })).not.toBeInTheDocument();
  });

  it("convertir enseña el resumen y crea el pedido al confirmar", async () => {
    mocks.get.mockResolvedValue({ data: { lines: [{ productId: "p-1", name: "Sobre de manila", quantity: 2, unitPrice: 1500, total: 3000 }], subtotal: 3000, total: 3000, payment: "Transferencia" } });
    mocks.post.mockResolvedValue({ data: { orderId: "o-5" } });
    render(<ReservationDetail storeId="store-1" detail={detail()} defaultDays={3} />);
    fireEvent.click(screen.getByRole("button", { name: "Convertir en pedido" }));
    await screen.findByTestId("convert-summary");
    fireEvent.click(screen.getByRole("button", { name: "Crear el pedido" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/store-1/pedidos/o-5"));
  });
});
