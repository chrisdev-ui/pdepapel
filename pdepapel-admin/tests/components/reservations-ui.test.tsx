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
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  toast: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    get: mocks.get,
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
vi.mock("@/components/ui/user-combobox", () => ({
  UserCombobox: ({ onChange }: { onChange: (value: string, user?: { value: string; label: string; phone?: string }) => void }) => (
    <button type="button" data-testid="customer-picker" onClick={() => onChange("guest_3105556677", { value: "guest_3105556677", label: "Valentina", phone: "+573105556677" })}>
      Buscar clienta
    </button>
  ),
}));
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
  vi.useRealTimers();
});

const noOpenReservation = () => mocks.get.mockResolvedValue({ data: { reservations: [] } });

describe("Hoja «Reservar»", () => {
  it("llega prellenada y envía la reserva con su clave de idempotencia", async () => {
    noOpenReservation();
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
    expect(screen.getByLabelText("Nombre")).toHaveValue("Laura");

    fireEvent.click(screen.getByRole("button", { name: "Reservar 2 unidades" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    const [url, body, config] = mocks.post.mock.calls[0];
    expect(url).toBe("/api/store-1/stock-reservations");
    expect(body).toEqual({ items: [{ productId: "p-1", quantity: 2 }], customerName: "Laura", customerPhone: "+573001234567", days: 3, note: "Pedido solicitado por WhatsApp" });
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
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Marta" } });
    act(() => rerender());
    expect(screen.getByTestId("tick")).toHaveTextContent("1");
    expect(screen.getByLabelText("Nombre")).toHaveValue("Marta");
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

  it("varios productos: el mismo producto suma, cada uno con su cantidad, el total corre y se guarda una sola vez", async () => {
    noOpenReservation();
    mocks.post.mockResolvedValue({ data: { reservation: { id: "r-9", expiresAt: "2026-10-20T12:00:00.000Z", items: [] } } });
    const onSaved = vi.fn();
    render(
      <ReserveSheet
        open
        onOpenChange={() => undefined}
        defaultDays={3}
        lines={[{ product: { id: "p-1", name: "Sobre de manila", stock: 5, reservedUnits: 0, price: 1500 }, quantity: 2 }]}
        customerName="Laura"
        onSaved={onSaved}
      />,
    );
    fireEvent.click(screen.getByTestId("picker"));
    fireEvent.click(screen.getByTestId("picker"));
    expect(screen.getAllByTestId("reserve-line")).toHaveLength(2);
    expect(screen.getByTestId("reserve-total")).toHaveTextContent("2 productos · 4 unidades");
    fireEvent.click(screen.getByRole("button", { name: "Quitar Washi tape" }));
    expect(screen.getByTestId("reserve-total")).toHaveTextContent(/^1 producto · 2 unidades · \$\s?3\.000 aprox\.$/);
    fireEvent.click(screen.getByTestId("picker"));
    fireEvent.click(screen.getByRole("button", { name: "Reservar 3 unidades" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post.mock.calls[0][1].items).toEqual([{ productId: "p-1", quantity: 2 }, { productId: "p-9", quantity: 1 }]);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: "r-9" }), "created", [{ productId: "p-1", quantity: 2 }, { productId: "p-9", quantity: 1 }]));
  });

  it("si la clienta ya tiene una reserva abierta, lo normal es agregar a esa; «Crear otra» queda a mano", async () => {
    mocks.get.mockResolvedValue({ data: { reservations: [{ id: "r-open", customerName: "Valentina", expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(), items: [{ quantity: 1, product: { name: "Agenda" } }] }] } });
    mocks.patch.mockResolvedValue({ data: { reservation: { id: "r-open", expiresAt: "x", items: [] } } });
    render(<ReserveSheet open onOpenChange={() => undefined} defaultDays={3} product={{ id: "p-1", name: "Sobre de manila", stock: 5, reservedUnits: 0 }} />);
    fireEvent.click(screen.getByTestId("customer-picker"));
    expect(screen.getByLabelText("Nombre")).toHaveValue("Valentina");

    const box = await screen.findByTestId("open-reservation");
    expect(box).toHaveTextContent("Valentina ya tiene una reserva abierta");
    expect(box).toHaveTextContent("1 × Agenda");
    expect(mocks.get).toHaveBeenCalledWith("/api/store-1/stock-reservations", { params: { telefono: "+573105556677" } });
    expect(within(box).getByLabelText("Agregar a la reserva abierta")).toBeChecked();
    expect(screen.queryByTestId("extend-offer")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Agregar 1 unidad" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(mocks.patch.mock.calls[0][0]).toBe("/api/store-1/stock-reservations/r-open");
    expect(mocks.patch.mock.calls[0][1]).toEqual({ action: "add_items", items: [{ productId: "p-1", quantity: 1 }] });
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("«Crear otra» crea una reserva nueva aunque haya una abierta", async () => {
    mocks.get.mockResolvedValue({ data: { reservations: [{ id: "r-open", customerName: "Valentina", expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(), items: [{ quantity: 1, product: { name: "Agenda" } }] }] } });
    mocks.post.mockResolvedValue({ data: { reservation: { id: "r-new", expiresAt: "x", items: [] } } });
    render(<ReserveSheet open onOpenChange={() => undefined} defaultDays={3} product={{ id: "p-1", name: "Sobre de manila", stock: 5, reservedUnits: 0 }} customerName="Valentina" customerPhone="+573105556677" />);
    const box = await screen.findByTestId("open-reservation");
    fireEvent.click(within(box).getByLabelText("Crear otra reserva"));
    fireEvent.click(screen.getByRole("button", { name: "Reservar 1 unidad" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it("si vence en menos de 24 h ofrece «Extender», apagado: agregar solo no extiende; marcado, extiende después de agregar", async () => {
    const soon = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    mocks.patch.mockResolvedValue({ data: { reservation: { id: "r-open", expiresAt: soon, items: [] } } });
    const { unmount } = render(
      <ReserveSheet open onOpenChange={() => undefined} defaultDays={3} product={{ id: "p-1", name: "Sobre de manila", stock: 5, reservedUnits: 0 }} target={{ id: "r-open", customerName: "Valentina", expiresAt: soon }} />,
    );
    const offer = screen.getByTestId("extend-offer");
    expect(within(offer).getByRole("checkbox")).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Agregar 1 unidad" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(mocks.patch.mock.calls.map((call) => call[1].action)).toEqual(["add_items"]);
    unmount();

    mocks.patch.mockClear();
    render(<ReserveSheet open onOpenChange={() => undefined} defaultDays={3} product={{ id: "p-1", name: "Sobre de manila", stock: 5, reservedUnits: 0 }} target={{ id: "r-open", customerName: "Valentina", expiresAt: soon }} />);
    fireEvent.click(within(screen.getByTestId("extend-offer")).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Agregar 1 unidad" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(2));
    expect(mocks.patch.mock.calls.map((call) => call[1])).toEqual([{ action: "add_items", items: [{ productId: "p-1", quantity: 1 }] }, { action: "extender", days: 3 }]);
  });

  it("el 409 con varios productos sale tal cual, nombrando cada uno", async () => {
    noOpenReservation();
    mocks.post.mockRejectedValue({ isAxiosError: true, response: { data: { error: "No alcanza para reservar: «Sobre de manila» (quedan 1, pediste 2); «Washi tape» (no hay unidades)." } } });
    render(<ReserveSheet open onOpenChange={() => undefined} defaultDays={3} product={{ id: "p-1", name: "Sobre de manila" }} quantity={2} customerName="Laura" />);
    fireEvent.click(screen.getByTestId("picker"));
    fireEvent.click(screen.getByRole("button", { name: "Reservar 3 unidades" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("«Sobre de manila» (quedan 1, pediste 2); «Washi tape» (no hay unidades)");
  });
});

const PRODUCT = { id: "p-1", name: "Sobre de manila", sku: "SOB", isKit: false, stock: 5, reservedUnits: 2, images: [] };

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
  product: PRODUCT,
  items: [],
  order: null,
  ...overrides,
});

const screenWith = (reservations: ReservationView[]) =>
  render(<ReservationsClient storeId="store-1" filter="activas" reservations={reservations} defaultDays={3} counts={{ activas: reservations.length, convertidas: 0, sinRespaldo: 0 }} />);

describe("Pantalla Reservas", () => {
  it("una reserva con varios productos dice cuántos y cuáles, sin enlace a uno solo", () => {
    const notebook = { ...PRODUCT, id: "p-2", name: "Libreta" };
    screenWith([
      hold({
        productId: null,
        quantity: null,
        product: null,
        items: [
          { id: "i-1", productId: "p-1", quantity: 2, unbackedAt: null, product: PRODUCT },
          { id: "i-2", productId: "p-2", quantity: 1, unbackedAt: null, product: notebook },
        ],
      }),
    ]);
    const card = screen.getByTestId("reservation-card");
    expect(within(card).getByText("2 productos · 3 unidades")).toBeInTheDocument();
    expect(within(card).getByText("2 × Sobre de manila, 1 × Libreta")).toBeInTheDocument();
    expect(within(card).queryByRole("link", { name: /Sobre de manila/ })).toBeNull();
  });

  it("cada tarjeta dice qué, para quién y cuándo vence, con WhatsApp", () => {
    screenWith([hold()]);
    const card = screen.getByTestId("reservation-card");
    expect(within(card).getByText("2 × Sobre de manila")).toBeInTheDocument();
    expect(within(card).getByText("Reservado")).toBeInTheDocument();
    expect(within(card).getByText("vence en 2 días")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", "https://wa.me/573001234567");
    expect(within(card).getByTestId("reservation-open")).toHaveAttribute("href", "/store-1/reservas/r-1");
  });

  it("«vence mañana» se ve marcado en la tarjeta", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T15:00:00Z"));
    screenWith([hold({ expiresAt: "2026-10-16T20:00:00Z" })]);
    const chip = within(screen.getByTestId("reservation-card")).getByTestId("expiry-chip");
    expect(chip).toHaveTextContent("vence mañana");
    expect(chip).toHaveAttribute("data-urgency", "manana");
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

  it("convertir muestra primero el resumen del pedido; crea el pedido solo al confirmar y lleva a él", async () => {
    mocks.get.mockResolvedValue({ data: { lines: [{ productId: "p-1", name: "Sobre de manila", quantity: 2, unitPrice: 1500, total: 3000 }], subtotal: 3000, total: 3000, payment: "Transferencia (se cambia en el pedido)" } });
    mocks.post.mockResolvedValue({ data: { orderId: "o-9" } });
    screenWith([hold()]);
    fireEvent.click(screen.getByRole("button", { name: "Convertir" }));
    const summary = await screen.findByTestId("convert-summary");
    expect(mocks.get).toHaveBeenCalledWith("/api/store-1/stock-reservations/r-1/convert");
    expect(summary).toHaveTextContent("2 × Sobre de manila");
    expect(mocks.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Crear el pedido" }));
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

  it("un doble toque en «Crear el pedido» crea un solo pedido; si falla, el error sale en el resumen", async () => {
    mocks.get.mockResolvedValue({ data: { lines: [{ productId: "p-1", name: "Sobre de manila", quantity: 2, unitPrice: 1500, total: 3000 }], subtotal: 3000, total: 3000, payment: "Transferencia" } });
    const request = deferred<{ data: { orderId: string } }>();
    mocks.post.mockReturnValue(request.promise);
    screenWith([hold()]);
    fireEvent.click(screen.getByRole("button", { name: "Convertir" }));
    await screen.findByTestId("convert-summary");
    const create = screen.getByRole("button", { name: "Crear el pedido" });
    fireEvent.click(create);
    fireEvent.click(create);
    await act(async () => request.reject({ isAxiosError: true, response: { data: { error: "Solo una reserva activa se puede convertir en pedido" } } }));
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("alert")).toHaveTextContent("Solo una reserva activa");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("una reserva creada desde la hoja aparece en la lista sin esperar la recarga", async () => {
    const later = new Date(Date.now() + 5 * 86_400_000).toISOString();
    noOpenReservation();
    mocks.post.mockResolvedValue({ data: { reservation: hold({ id: "r-new", productId: "p-9", customerName: "Sofía", quantity: 1, expiresAt: later, product: { ...PRODUCT, id: "p-9", name: "Washi tape" } }) } });
    screenWith([hold()]);
    fireEvent.click(screen.getByRole("button", { name: /Reservar/ }));
    const sheet = await screen.findByRole("dialog", { name: "Reservar" });
    fireEvent.click(within(sheet).getByTestId("picker"));
    fireEvent.change(within(sheet).getByLabelText("Nombre"), { target: { value: "Sofía" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Reservar 1 unidad" }));

    await waitFor(() => expect(screen.getAllByTestId("reservation-card")).toHaveLength(2));
    expect(screen.getAllByTestId("reservation-card")[1]).toHaveTextContent("1 × Washi tape");
    expect(activasTab()).toHaveTextContent("Activas2");
  });
});
