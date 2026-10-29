/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-clipboard", () => ({ useClipboard: () => ({ onCopy: vi.fn().mockResolvedValue(true) }) }));
vi.mock("@/components/bold-checkout-button", () => ({ BoldCheckoutButton: () => <button type="button">Pagar ahora</button> }));

import { OrderSummaryCard } from "@/app/(routes)/pedido/[orderId]/components/order-summary-card";
import { BankTransferInstructions } from "@/components/bank-transfer-instructions";
import { getOrderStage, isAwaitingPayment } from "@/lib/order-status";
import { StorefrontSettingsProvider } from "@/providers/storefront-settings-provider";
import type { BankTransferInfo, Order } from "@/types";

// Valores de mentira: los reales viven en Configuración del panel.
const bankTransfer: BankTransferInfo = { account: "Ahorros Banco Prueba 000-TEST-00", breBKey: "@llave-de-prueba", whatsappNumber: "573000000000" };

const withSettings = (node: React.ReactNode) =>
  render(<StorefrontSettingsProvider value={{ freeShippingThreshold: null, deliveryEstimate: null, bankTransfer }}>{node}</StorefrontSettingsProvider>);

const order = (overrides: Partial<Order> = {}) =>
  ({
    id: "o-1",
    orderNumber: "ORD-1",
    fullName: "Clienta",
    type: "STANDARD",
    status: "DEPOSIT_PAID",
    subtotal: 160000,
    discount: 0,
    couponDiscount: 0,
    giftCardAmount: 0,
    total: 160000,
    paymentPlan: "DEPOSIT",
    depositAmount: 30000,
    depositPaidAt: "2026-10-28T10:05:00.000Z",
    payment: { id: "p", method: "Bold" },
    shipping: { provider: "MANUAL", status: "Preparing", cost: 0, createdAt: "2026-10-28T10:00:00.000Z" },
    orderItems: [],
    createdAt: "2026-10-28T10:00:00.000Z",
    ...overrides,
  }) as unknown as Order;

const renderSummary = (value: Order) => {
  const stage = getOrderStage(value);
  return withSettings(
    <OrderSummaryCard
      order={value}
      stage={stage}
      awaitingPayment={isAwaitingPayment(value)}
      autoOpenPayment={false}
      isStartingWompi={false}
      onPayWithWompi={vi.fn()}
    />,
  );
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("pedido de una preventa con anticipo", () => {
  it("con el anticipo recibido: «Preventa apartada», el saldo + envío y sin «Pagar ahora»", () => {
    renderSummary(order());
    const card = screen.getByTestId("deposit-paid-card");
    expect(card).toHaveTextContent("Preventa apartada");
    expect(card.textContent!.replace(/\s+/g, " ")).toContain(
      "Recibimos tu anticipo de $ 30.000. Saldo pendiente: $ 130.000 + envío, que pagas cuando llegue el producto. Te escribimos cuando llegue para coordinar el pago.",
    );
    expect(screen.getByText("Saldo al llegar").closest("div")).toHaveTextContent(/130\.000 \+ envío/);
    expect(screen.getByText("Se cotiza cuando llegue")).toBeInTheDocument();
    expect(screen.queryByText("Gratis")).toBeNull();
    expect(screen.queryByRole("button", { name: "Pagar ahora" })).toBeNull();
  });

  it("pendiente: pide el anticipo, no el total", () => {
    renderSummary(order({ status: "PENDING", depositPaidAt: null }));
    expect(screen.getByText("Paga el anticipo de $ 30.000 para apartar tu preventa.")).toBeInTheDocument();
    expect(screen.getByText("Anticipo a pagar hoy").closest("div")).toHaveTextContent("30.000");
    expect(screen.getByRole("button", { name: "Pagar ahora" })).toBeInTheDocument();
  });

  it("transferencia pendiente: el valor a transferir es el anticipo", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderSummary(order({ status: "PENDING", depositPaidAt: null, payment: { id: "p", method: "BankTransfer" } }));
    const amount = screen.getByText("Monto exacto a transferir:").nextSibling as HTMLElement;
    expect(amount).toHaveTextContent("30.000");
    expect(amount).not.toHaveTextContent("160.000");
  });
});

describe("valor a transferir", () => {
  it("un pedido con tarjeta de regalo transfiere el total menos la tarjeta (antes, el total)", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    withSettings(<BankTransferInstructions order={{ id: "o", orderNumber: "ORD-2", total: 100000, giftCardAmount: 40000, status: "PENDING" }} />);
    expect(screen.getByText("Monto exacto a transferir:").nextSibling).toHaveTextContent("60.000");
    const link = screen.getByRole("link", { name: /Enviar Comprobante por WhatsApp/i });
    expect(decodeURIComponent(link.getAttribute("href")!)).toContain("60.000");
  });

  it("un pedido normal transfiere el total", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    withSettings(<BankTransferInstructions order={{ id: "o", orderNumber: "ORD-3", total: 20000 }} />);
    expect(screen.getByText("Monto exacto a transferir:").nextSibling).toHaveTextContent("20.000");
  });
});
