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
vi.mock("@/components/ui/async-product-select", () => ({
  AsyncProductSelect: ({ onChange }: { onChange: (value: string, option: unknown) => void }) => (
    <button type="button" data-testid="picker" onClick={() => onChange("p-9", { id: "p-9", name: "Washi tape", stock: 4, reservedUnits: 0 })}>
      Elegir producto
    </button>
  ),
}));
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
    expect(screen.getByTestId("reserve-available")).toHaveTextContent(/^Disponibles para reservar: 4 · stock 5 · 1 reservado$/);
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
    expect(screen.getByTestId("reserve-available")).toHaveTextContent(/^No hay unidades disponibles para reservar · stock 2 · 2 reservados$/);
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

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, ko) => {
    resolve = ok;
    reject = ko;
  });
  return { promise, resolve, reject };
};
const activasTab = () => screen.getByRole("link", { name: /^Activas/ });
const confirmRelease = async () => {
  fireEvent.click(within(screen.getAllByTestId("reservation-card")[0]).getByRole("button", { name: "Liberar" }));
  const dialog = await screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"));
  return within(dialog).getByRole("button", { name: "Liberar" });
};

describe("Pantalla Reservas · al instante", () => {
  it("liberar quita la tarjeta y baja «Activas» antes de que responda el servidor; luego recarga", async () => {
    const request = deferred<{ data: { released: boolean } }>();
    mocks.patch.mockReturnValue(request.promise);
    screenWith([hold(), hold({ id: "r-2", customerName: "Marta" })]);
    expect(activasTab()).toHaveTextContent("Activas2");

    fireEvent.click(await confirmRelease());
    await waitFor(() => expect(screen.getAllByTestId("reservation-card")).toHaveLength(1));
    expect(screen.queryByText("Laura")).not.toBeInTheDocument();
    expect(activasTab()).toHaveTextContent("Activas1");
    expect(mocks.refresh).not.toHaveBeenCalled();

    await act(async () => request.resolve({ data: { released: true } }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("si el servidor falla, la tarjeta vuelve a su lugar, el contador se restaura y sale el error", async () => {
    mocks.patch.mockRejectedValue({ isAxiosError: true, response: { data: { error: "Reserva no encontrada" } } });
    screenWith([hold(), hold({ id: "r-2", customerName: "Marta" })]);
    fireEvent.click(await confirmRelease());

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", description: "Reserva no encontrada" })));
    const cards = screen.getAllByTestId("reservation-card");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText("Laura")).toBeInTheDocument();
    expect(activasTab()).toHaveTextContent("Activas2");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("un doble toque en «Liberar» manda una sola petición", async () => {
    const request = deferred<{ data: { released: boolean } }>();
    mocks.patch.mockReturnValue(request.promise);
    screenWith([hold()]);
    const confirm = await confirmRelease();
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await act(async () => request.resolve({ data: { released: true } }));
    expect(mocks.patch).toHaveBeenCalledTimes(1);
  });

  it("un doble toque en «Convertir» crea un solo pedido", async () => {
    const request = deferred<{ data: { orderId: string } }>();
    mocks.post.mockReturnValue(request.promise);
    screenWith([hold()]);
    const button = screen.getByRole("button", { name: "Convertir" });
    fireEvent.click(button);
    fireEvent.click(button);
    await act(async () => request.resolve({ data: { orderId: "o-1" } }));
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it("mientras convierte, los botones de la tarjeta se apagan y ya dice «Con pedido»; si falla, vuelve", async () => {
    const request = deferred<{ data: { orderId: string } }>();
    mocks.post.mockReturnValue(request.promise);
    screenWith([hold()]);
    fireEvent.click(screen.getByRole("button", { name: "Convertir" }));
    const card = screen.getByTestId("reservation-card");
    await waitFor(() => expect(within(card).getByText("Con pedido")).toBeInTheDocument());
    expect(within(card).getByRole("button", { name: "Liberar" })).toBeDisabled();
    expect(within(card).getByRole("button", { name: /\+ días/ })).toBeDisabled();

    await act(async () => request.reject({ isAxiosError: true, response: { data: { error: "Solo una reserva activa se puede convertir en pedido" } } }));
    expect(within(card).getByText("Reservado")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Liberar" })).toBeEnabled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("una reserva creada desde la hoja aparece en la lista sin esperar la recarga", async () => {
    const later = new Date(Date.now() + 5 * 86_400_000).toISOString();
    mocks.post.mockResolvedValue({ data: { reservation: hold({ id: "r-new", productId: "p-9", customerName: "Sofía", quantity: 1, expiresAt: later, product: { ...hold().product, id: "p-9", name: "Washi tape" } }) } });
    screenWith([hold()]);
    fireEvent.click(screen.getByRole("button", { name: /Reservar/ }));
    const sheet = await screen.findByRole("dialog", { name: "Reservar" });
    fireEvent.click(within(sheet).getByTestId("picker"));
    fireEvent.change(within(sheet).getByLabelText("Clienta"), { target: { value: "Sofía" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Reservar 1 unidad" }));

    await waitFor(() => expect(screen.getAllByTestId("reservation-card")).toHaveLength(2));
    expect(screen.getAllByTestId("reservation-card")[1]).toHaveTextContent("1 × Washi tape");
    expect(activasTab()).toHaveTextContent("Activas2");
  });
});
