// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * «Reservar» desde el celular: la hoja llega prellenada (producto, cantidad,
 * clienta) cuando viene del pedido de WhatsApp o de la ficha, no pierde lo
 * escrito cuando el padre se vuelve a pintar y muestra el 409 tal cual. La
 * pantalla Reservas confirma antes de liberar y convierte llevando al pedido.
 */
const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
  toast: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    post: mocks.post,
    patch: mocks.patch,
    isAxiosError: (error: unknown) => Boolean((error as { isAxiosError?: boolean })?.isAxiosError),
  },
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }), useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/ui/async-product-select", () => ({ AsyncProductSelect: () => <output data-testid="picker" /> }));
vi.mock("@/components/ui/product-scan-button", () => ({ ProductScanButton: () => null }));
vi.mock("@/components/ui/phone-input", () => ({
  PhoneInput: ({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) => (
    <input id={id} aria-label="Celular" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

import { ReservationsClient, type ReservationView } from "@/app/(dashboard)/[storeId]/(routes)/reservas/components/reservations-client";
import { ReserveSheet } from "@/components/reservations/reserve-sheet";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Hoja «Reservar»", () => {
  it("llega prellenada y envía la reserva con su clave de idempotencia", async () => {
    mocks.post.mockResolvedValue({ data: {} });
    const onOpenChange = vi.fn();
    render(
      <ReserveSheet
        open
        onOpenChange={onOpenChange}
        defaultDays={3}
        product={{ id: "p-1", name: "Sobre de manila", stock: 5, reservedUnits: 1 }}
        quantity={2}
        customerName="Laura"
        customerPhone="+573001234567"
        note="Pedido solicitado por WhatsApp"
      />,
    );
    expect(screen.getByText("Sobre de manila")).toBeInTheDocument();
    expect(screen.getByTestId("reserve-available")).toHaveTextContent("Disponibles para reservar: 4");
    expect(screen.getByLabelText("Clienta")).toHaveValue("Laura");

    fireEvent.click(screen.getByRole("button", { name: "Reservar 2 unidades" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    const [url, body, config] = mocks.post.mock.calls[0];
    expect(url).toBe("/api/store-1/stock-reservations");
    expect(body).toEqual({ productId: "p-1", quantity: 2, customerName: "Laura", customerPhone: "+573001234567", days: 3, note: "Pedido solicitado por WhatsApp" });
    expect(config.headers["Idempotency-Key"]).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("no borra lo que Paula escribe cuando el padre se vuelve a pintar", () => {
    let rerender: () => void = () => undefined;
    function Parent() {
      const [tick, setTick] = useState(0);
      rerender = () => setTick((value) => value + 1);
      return (
        <>
          <output data-testid="tick">{tick}</output>
          <ReserveSheet open onOpenChange={() => undefined} defaultDays={3} product={{ id: "p-1", name: "Sobre de manila" }} customerName="" />
        </>
      );
    }
    render(<Parent />);
    fireEvent.change(screen.getByLabelText("Clienta"), { target: { value: "Marta" } });
    act(() => rerender());
    expect(screen.getByTestId("tick")).toHaveTextContent("1");
    expect(screen.getByLabelText("Clienta")).toHaveValue("Marta");
  });

  it("muestra el motivo del 409 y no cierra", async () => {
    mocks.post.mockRejectedValue({ isAxiosError: true, response: { data: { error: "Solo queda 1 unidad disponible de «Sobre de manila» y pediste 2." } } });
    const onOpenChange = vi.fn();
    render(<ReserveSheet open onOpenChange={onOpenChange} defaultDays={3} product={{ id: "p-1", name: "Sobre de manila" }} quantity={2} customerName="Laura" />);
    fireEvent.click(screen.getByRole("button", { name: "Reservar 2 unidades" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Solo queda 1 unidad disponible");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("sin unidades disponibles no deja reservar", () => {
    render(<ReserveSheet open onOpenChange={() => undefined} defaultDays={3} product={{ id: "p-1", name: "Sobre de manila", stock: 2, reservedUnits: 2 }} customerName="Laura" />);
    expect(screen.getByTestId("reserve-available")).toHaveTextContent("No hay unidades disponibles para reservar.");
    expect(screen.getByRole("button", { name: "Reservar 1 unidad" })).toBeDisabled();
  });
});

const hold = (overrides: Partial<ReservationView> = {}): ReservationView => ({
  id: "r-1",
  productId: "p-1",
  quantity: 2,
  customerName: "Laura",
  customerPhone: "+573001234567",
  note: null,
  expiresAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  status: "ACTIVE",
  orderId: null,
  unbackedAt: null,
  createdAt: new Date().toISOString(),
  closedAt: null,
  product: { id: "p-1", name: "Sobre de manila", sku: "SOB", isKit: false, stock: 5, reservedUnits: 2, images: [] },
  order: null,
  ...overrides,
});

const screenWith = (reservations: ReservationView[]) =>
  render(<ReservationsClient storeId="store-1" filter="activas" reservations={reservations} defaultDays={3} counts={{ activas: reservations.length, convertidas: 0, sinRespaldo: 0 }} />);

describe("Pantalla Reservas", () => {
  it("cada tarjeta dice qué, para quién y cuándo vence, con WhatsApp", () => {
    screenWith([hold()]);
    const card = screen.getByTestId("reservation-card");
    expect(within(card).getByText("2 × Sobre de manila")).toBeInTheDocument();
    expect(within(card).getByText("Reservado")).toBeInTheDocument();
    expect(within(card).getByText("vence en 2 días")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", "https://wa.me/573001234567");
  });

  it("liberar pide confirmación antes de llamar a la API", async () => {
    mocks.patch.mockResolvedValue({ data: { released: true } });
    screenWith([hold()]);
    fireEvent.click(screen.getByRole("button", { name: "Liberar" }));
    expect(mocks.patch).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"));
    expect(dialog).toHaveTextContent("¿Liberar esta reserva?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Liberar" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("/api/store-1/stock-reservations/r-1", { action: "liberar" }));
  });

  it("convertir crea el pedido y lleva a él", async () => {
    mocks.post.mockResolvedValue({ data: { orderId: "o-9" } });
    screenWith([hold()]);
    fireEvent.click(screen.getByRole("button", { name: "Convertir" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/store-1/pedidos/o-9"));
    expect(mocks.post).toHaveBeenCalledWith("/api/store-1/stock-reservations/r-1/convert");
  });

  it("una reserva sin respaldo lo dice y una convertida enlaza su pedido", () => {
    screenWith([
      hold({ id: "r-2", unbackedAt: new Date().toISOString() }),
      hold({ id: "r-3", status: "CONVERTED", orderId: "o-1", order: { id: "o-1", orderNumber: "ORD-77", status: "PENDING" } }),
    ]);
    const [unbacked, converted] = screen.getAllByTestId("reservation-card");
    expect(within(unbacked).getByText("Sin respaldo")).toBeInTheDocument();
    expect(within(converted).getByText("Con pedido")).toBeInTheDocument();
    expect(within(converted).getByRole("link", { name: "Pedido ORD-77" })).toHaveAttribute("href", "/store-1/pedidos/o-1");
    expect(within(converted).queryByRole("button", { name: "Convertir" })).not.toBeInTheDocument();
  });
});
