/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkoutGiftCard: vi.fn(),
  push: vi.fn(),
  toast: vi.fn(),
  setPendingOrder: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: null, getToken: async () => null }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/actions/gift-cards", () => ({ checkoutGiftCard: mocks.checkoutGiftCard }));
vi.mock("@/hooks/use-guest-user", () => ({ useGuestUser: () => ({ guestId: "guest-1", setGuestId: vi.fn() }) }));
vi.mock("@/hooks/use-checkout-store", () => ({
  useCheckoutStore: (selector: (state: { setPendingOrder: typeof mocks.setPendingOrder }) => unknown) => selector({ setPendingOrder: mocks.setPendingOrder }),
}));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { GiftCardForm } from "@/app/(routes)/tarjeta-regalo/components/gift-card-form";
import { OrderGiftCardPurchaseNotice } from "@/components/order-gift-card-purchase-notice";

function renderForm() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <GiftCardForm denominations={[50000, 100000, 200000]} />
    </QueryClientProvider>,
  );
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("tarjeta de regalo · compra", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  });
  afterEach(() => cleanup());

  it("offers the denominations as radios with the middle one preselected and updates the button", () => {
    renderForm();
    const radios = screen.getAllByRole("radio", { name: /\$/ });
    expect(radios).toHaveLength(3);
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: /Comprar tarjeta de/ })).toHaveTextContent("100.000");

    fireEvent.click(radios[2]);
    expect(radios[2]).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: /Comprar tarjeta de/ })).toHaveTextContent("200.000");
  });

  it("explains where the code goes depending on the recipient email", () => {
    renderForm();
    expect(screen.getByText(/el código llega a tu correo/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nombre de quien la recibe"), { target: { value: "Mariana López" } });
    fireEvent.change(screen.getByLabelText("Su correo"), { target: { value: "mariana@correo.com" } });
    expect(screen.getByText(/El código llega al correo de Mariana López/)).toBeInTheDocument();
  });

  it("submits the purchase and sends the buyer to the order page with the payment open", async () => {
    mocks.checkoutGiftCard.mockResolvedValue({ order: { id: "order-1", orderNumber: "ORD-1", total: 100000 }, boldData: {} });
    renderForm();
    fireEvent.change(screen.getByLabelText(/Nombre y apellidos/), { target: { value: "Luisa Sánchez" } });
    fireEvent.change(screen.getByLabelText(/Correo electrónico/), { target: { value: "luisa@correo.com" } });
    fireEvent.change(screen.getByLabelText("Nombre de quien la recibe"), { target: { value: "Mariana López" } });
    fireEvent.change(screen.getByLabelText("Mensaje"), { target: { value: "¡Feliz cumpleaños!" } });
    fireEvent.click(screen.getByRole("button", { name: /Comprar tarjeta de/ }));

    await waitFor(() => expect(mocks.checkoutGiftCard).toHaveBeenCalledTimes(1));
    const [payload, , idempotencyKey] = mocks.checkoutGiftCard.mock.calls[0];
    expect(payload).toMatchObject({
      amount: 100000,
      buyerName: "Luisa Sánchez",
      buyerEmail: "luisa@correo.com",
      recipientName: "Mariana López",
      message: "¡Feliz cumpleaños!",
      payment: { method: "Bold" },
      userId: null,
      guestId: "guest-1",
      website: "",
    });
    expect(typeof payload.formStartedAt).toBe("number");
    expect(payload.recipientEmail).toBeUndefined();
    expect(typeof idempotencyKey).toBe("string");
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/pedido/order-1?autoPay=true"));
    expect(mocks.setPendingOrder).toHaveBeenCalledWith(expect.objectContaining({ id: "order-1", total: 100000 }));
  });

  it("never offers cash on delivery nor any shipping or address step: the card goes by email", () => {
    renderForm();
    expect(screen.getByText("Pago en línea")).toBeTruthy();
    expect(screen.getByText("Transferencia bancaria")).toBeTruthy();
    expect(screen.queryByText(/contra entrega/i)).toBeNull();
    expect(screen.queryByText(/al recibir el paquete/i)).toBeNull();
    expect(screen.queryByText(/dirección|ciudad|envío a|transportadora/i)).toBeNull();
    expect(screen.getByText(/No hay envío: la tarjeta sale por correo/)).toBeTruthy();
  });

  it("avisa antes de enviar un celular +57 9… o un nombre de letras al azar", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Nombre y apellidos/), { target: { value: "xKqPzLmWvB" } });
    fireEvent.change(screen.getByLabelText(/Correo electrónico/), { target: { value: "luisa@correo.com" } });
    fireEvent.change(screen.getByLabelText(/Teléfono/), { target: { value: "+57 912 345 6789" } });
    fireEvent.click(screen.getByRole("button", { name: /Comprar tarjeta de/ }));
    await waitFor(() => expect(screen.getByText("Escribe un celular válido: 10 dígitos que empiezan por 3.")).toBeInTheDocument());
    expect(screen.getByText(/Revisa tu nombre/)).toBeInTheDocument();
    expect(mocks.checkoutGiftCard).not.toHaveBeenCalled();
  });

  it("acepta un solo nombre y un celular colombiano real", async () => {
    mocks.checkoutGiftCard.mockResolvedValue({ order: { id: "order-1", orderNumber: "ORD-1", total: 100000 }, boldData: {} });
    renderForm();
    fireEvent.change(screen.getByLabelText(/Nombre y apellidos/), { target: { value: "Daniela" } });
    fireEvent.change(screen.getByLabelText(/Correo electrónico/), { target: { value: "dani@correo.com" } });
    fireEvent.change(screen.getByLabelText(/Teléfono/), { target: { value: "+57 300 123 4567" } });
    fireEvent.click(screen.getByRole("button", { name: /Comprar tarjeta de/ }));
    await waitFor(() => expect(mocks.checkoutGiftCard).toHaveBeenCalledTimes(1));
  });

  it("tiene un campo trampa que una persona no ve ni alcanza con el tabulador", () => {
    const { container } = renderForm();
    const trap = container.querySelector('input[name="website"]') as HTMLInputElement;
    expect(trap).not.toBeNull();
    expect(trap.tabIndex).toBe(-1);
    expect(trap.closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("refuses to submit without the buyer's name and email", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /Comprar tarjeta de/ }));
    await waitFor(() => expect(screen.getByText("Escribe tu nombre y apellidos")).toBeInTheDocument());
    expect(mocks.checkoutGiftCard).not.toHaveBeenCalled();
  });
});

describe("OrderGiftCardPurchaseNotice", () => {
  afterEach(() => cleanup());

  it("renders nothing for a normal order", () => {
    const { container } = render(<OrderGiftCardPurchaseNotice order={{ type: "STANDARD", status: "PAID", giftCardPurchase: null, giftRecipientName: null, email: "x" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("tells the buyer the code went by email and never shows it", () => {
    render(
      <OrderGiftCardPurchaseNotice
        order={{ type: "GIFT_CARD", status: "PAID", giftRecipientName: "Mariana López", email: "luisa@x.com", giftCardPurchase: { recipientName: "Mariana López", initialAmount: 100000, codeLast4: "2R8T", deliveredAt: "2026-09-28T12:00:00.000Z" } }}
      />,
    );
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("Tarjeta de regalo");
    expect(note).toHaveTextContent("para Mariana López");
    expect(note).toHaveTextContent("ya salió por correo y termina en 2R8T");
    expect(note).not.toHaveTextContent("PDP-");
  });

  it("says the code is on its way while the payment is pending", () => {
    render(<OrderGiftCardPurchaseNotice order={{ type: "GIFT_CARD", status: "PENDING", giftRecipientName: null, email: "luisa@x.com", giftCardPurchase: null }} />);
    expect(screen.getByRole("note")).toHaveTextContent("sale por correo en cuanto el pago esté confirmado");
  });

  it("pagada pero sin código todavía (en revisión): dice que se está verificando, sin prometer que ya salió", () => {
    render(<OrderGiftCardPurchaseNotice order={{ type: "GIFT_CARD", status: "PAID", giftRecipientName: null, email: "luisa@x.com", giftCardPurchase: null }} />);
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("Recibimos tu pago y estamos verificando la compra");
    expect(note).not.toHaveTextContent("ya salió");
    expect(note).not.toHaveTextContent("en cuanto el pago esté confirmado");
  });
});
