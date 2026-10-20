/* @vitest-environment jsdom */

import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ query: "" }));
const http = vi.hoisted(() => ({ get: vi.fn() }));
const spies = vi.hoisted(() => ({ toast: vi.fn(), confetti: vi.fn() }));

vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: null, getToken: async () => null }) }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/pedido/order-1",
}));
vi.mock("axios", () => ({ default: { get: http.get } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: spies.toast }), toast: spies.toast }));
vi.mock("@/hooks/use-confetti", () => ({ useConfetti: () => ({ fireConfetti: spies.confetti }) }));
vi.mock("@/hooks/use-checkout-order", () => ({ default: () => ({ mutate: vi.fn(), status: "idle" }) }));
vi.mock("@/hooks/use-track-shipment", () => ({ default: () => ({ mutate: vi.fn(), status: "idle" }) }));
vi.mock("@/components/order-account-claim-card", () => ({ OrderAccountClaimCard: () => null }));
vi.mock("@/components/bold-checkout-button", () => ({ BoldCheckoutButton: () => <button type="button">Pagar con Bold</button> }));
vi.mock("@/components/bank-transfer-instructions", () => ({ BankTransferInstructions: () => null }));
vi.mock("../../app/(routes)/pedido/[orderId]/components/order-items-card", () => ({ OrderItemsCard: () => null }));
vi.mock("../../app/(routes)/pedido/[orderId]/components/order-timeline", () => ({ OrderTimeline: () => null }));
vi.mock("../../app/(routes)/pedido/[orderId]/components/order-help-card", () => ({ OrderHelpCard: () => null }));

import SingleOrderPage from "@/app/(routes)/pedido/[orderId]/components/single-order-page";
import { OrderStatus } from "@/constants";
import { PAYMENT_RETURN_POLL_INTERVAL_MS, PAYMENT_RETURN_WINDOW_MS } from "@/lib/payment-return";
import type { Order } from "@/types";

import { fullReceiptOrder, maskedReceiptOrder } from "../fixtures/receipt-orders";

const BOLD_RETURN = "?bold-order-id=ORD-1&bold-tx-status=approved";
const WOMPI_RETURN = "?id=11111-1111111111-11111&env=test";

const variants = [
  ["completo", fullReceiptOrder],
  ["recortado", maskedReceiptOrder],
] as const;

const approved = (make: (o?: Partial<Order>) => Order) =>
  make({ status: OrderStatus.PAID, paymentResult: "approved", shipping: { ...make().shipping!, status: "Preparing" } });
const declined = (make: (o?: Partial<Order>) => Order) =>
  make({ status: OrderStatus.CANCELLED, paymentResult: "declined", paidAt: null });
const pending = (make: (o?: Partial<Order>) => Order) =>
  make({ status: OrderStatus.CREATED, paymentResult: "pending", paidAt: null, shipping: { ...make().shipping!, status: "Preparing" } });

const toastTitles = () => spies.toast.mock.calls.map(([options]) => options.title as string);
const flush = (ms = 0) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms);
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} });
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://admin.test/api/store-1");
  window.sessionStorage.clear();
  http.get.mockReset();
  spies.toast.mockReset();
  spies.confetti.mockReset();
  nav.query = "";
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe.each(variants)("aviso de pago al volver de la pasarela (recibo %s)", (_label, make) => {
  it("aprobado al volver de Bold: un aviso de gracias, confeti y el título", async () => {
    nav.query = BOLD_RETURN;
    render(<SingleOrderPage order={approved(make)} />);
    await flush();

    expect(toastTitles()).toEqual(["¡Gracias por tu compra!"]);
    expect(spies.confetti).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("¡Gracias por tu compra!");
  });

  it("aprobado al volver de Wompi: el mismo aviso, sin comparar la transacción", async () => {
    nav.query = WOMPI_RETURN;
    render(<SingleOrderPage order={approved(make)} />);
    await flush();

    expect(toastTitles()).toEqual(["¡Gracias por tu compra!"]);
  });

  it("rechazado: un aviso de fallo y nada de confeti", async () => {
    nav.query = "?bold-order-id=ORD-1&bold-tx-status=rejected";
    render(<SingleOrderPage order={declined(make)} />);
    await flush();

    expect(toastTitles()).toEqual(["¡Hubo un fallo en tu intento de pago!"]);
    expect(spies.confetti).not.toHaveBeenCalled();
  });

  it("pendiente que se aprueba: estado neutro, sondeo cada 3 s y luego el aviso de gracias", async () => {
    nav.query = BOLD_RETURN;
    http.get.mockResolvedValueOnce({ data: pending(make) }).mockResolvedValue({ data: approved(make) });
    render(<SingleOrderPage order={pending(make)} />);
    await flush();

    expect(screen.getByTestId("payment-return-status")).toHaveTextContent("Estamos confirmando tu pago…");
    expect(screen.queryByRole("button", { name: "Pagar con Bold" })).not.toBeInTheDocument();
    expect(spies.toast).not.toHaveBeenCalled();
    expect(http.get).toHaveBeenCalledTimes(1);

    await flush(PAYMENT_RETURN_POLL_INTERVAL_MS);

    expect(http.get).toHaveBeenCalledTimes(2);
    expect(toastTitles()).toEqual(["¡Gracias por tu compra!"]);
    expect(screen.queryByTestId("payment-return-status")).not.toBeInTheDocument();

    await flush(PAYMENT_RETURN_POLL_INTERVAL_MS * 3);
    expect(toastTitles()).toEqual(["¡Gracias por tu compra!"]);
  });

  it("pendiente que no llega: tras el plazo, un mensaje tranquilo y nunca «rechazado»", async () => {
    nav.query = BOLD_RETURN;
    http.get.mockResolvedValue({ data: pending(make) });
    render(<SingleOrderPage order={pending(make)} />);
    await flush();

    await flush(PAYMENT_RETURN_WINDOW_MS);
    const callsAtDeadline = http.get.mock.calls.length;
    expect(callsAtDeadline).toBeGreaterThanOrEqual(PAYMENT_RETURN_WINDOW_MS / PAYMENT_RETURN_POLL_INTERVAL_MS);

    const status = screen.getByTestId("payment-return-status");
    expect(status).toHaveTextContent(/te avisamos\s+por WhatsApp o correo/);
    const help = within(status).getByRole("link", { name: "¿Tienes dudas? Escríbenos por WhatsApp" });
    expect(help).toHaveAttribute("href", expect.stringMatching(/^https:\/\/wa\.me\/.*ORD-1/));
    expect(help).toHaveAttribute("target", "_blank");
    expect(spies.toast).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent(/rechaz/i);
    expect(screen.queryByRole("button", { name: "Pagar con Bold" })).not.toBeInTheDocument();

    // Pasado el plazo vuelve al ritmo normal (10 s), no cada 3 s.
    await flush(PAYMENT_RETURN_POLL_INTERVAL_MS * 3);
    expect(http.get.mock.calls.length - callsAtDeadline).toBeLessThanOrEqual(1);
  });

  it.each(["", "?autoPay=true", "?utm_source=whatsapp"])("visita sin marca de la pasarela (%s): ningún aviso de pago", async (query) => {
    nav.query = query;
    render(<SingleOrderPage order={approved(make)} />);
    await flush();

    expect(spies.toast).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pedido #ORD-1");
  });

  it("visita sin marca de un pedido por pagar: sigue el botón de pago y no hay estado de confirmación", async () => {
    http.get.mockResolvedValue({ data: approved(make) });
    render(<SingleOrderPage order={pending(make)} />);
    expect(screen.getByRole("button", { name: "Pagar con Bold" })).toBeInTheDocument();
    expect(screen.queryByTestId("payment-return-status")).not.toBeInTheDocument();
    await flush();

    expect(spies.toast).not.toHaveBeenCalled();
  });

  it.each([
    ["por cobrar", OrderStatus.CREATED, "pending"],
    ["entregado y cobrado", OrderStatus.PAID, "approved"],
  ] as const)("contra entrega (%s) con marca de la pasarela: ningún aviso de pago", async (_case, status, result) => {
    nav.query = BOLD_RETURN;
    const cod = make({ status, paymentResult: result, payment: { id: "pay-1", method: "COD" } });
    render(<SingleOrderPage order={cod} />);
    await flush(PAYMENT_RETURN_WINDOW_MS);

    expect(spies.toast).not.toHaveBeenCalled();
    expect(spies.confetti).not.toHaveBeenCalled();
    expect(screen.queryByTestId("payment-return-status")).not.toBeInTheDocument();
  });

  it("al recargar la página de regreso, el aviso no se repite", async () => {
    nav.query = BOLD_RETURN;
    const first = render(<SingleOrderPage order={approved(make)} />);
    await flush();
    first.unmount();

    render(<SingleOrderPage order={approved(make)} />);
    await flush();

    expect(toastTitles()).toEqual(["¡Gracias por tu compra!"]);
  });
});
