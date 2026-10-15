/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShippingRateRecovery } from "@/app/(routes)/finalizar-compra/components/steps/shipping-rate-recovery";

afterEach(cleanup);

/**
 * Recaudo contra entrega en la tienda: si el panel calcula otro recaudo que
 * el mostrado, la clienta ve el recaudo y el total nuevos y confirma antes de
 * que se cobre más.
 */
describe("recaudo contra entrega cambiado", () => {
  it("muestra el recaudo anterior, el nuevo y el total nuevo antes de confirmar", () => {
    render(
      <ShippingRateRecovery
        recovery={{
          kind: "changed",
          rate: { idRate: 1, carrier: "ENVIA", product: "Normal", flete: 18000, minimumInsurance: 0, totalCost: 18000, deliveryDays: 3, isCOD: true, codFee: 7300 },
          previousCost: 18000,
          codFee: 7300,
          previousCodFee: 7000,
          newTotal: 75300,
        }}
        onConfirm={vi.fn()}
        onChooseAnother={vi.fn()}
        isSubmitting={false}
      />,
    );
    expect(screen.getByText("El recaudo contra entrega cambió.")).toBeInTheDocument();
    const box = screen.getByTestId("recovery-cod-fee");
    expect(box).toHaveTextContent(/7\.000/);
    expect(box).toHaveTextContent(/7\.300/);
    expect(box).toHaveTextContent(/Total:\s*\$\s75\.300/);
    expect(screen.getByRole("button", { name: "Confirmar y continuar" })).toBeEnabled();
  });

  it("si solo cambió el flete, la tarjeta sigue igual que antes", () => {
    render(
      <ShippingRateRecovery
        recovery={{ kind: "changed", rate: { idRate: 1, carrier: "ENVIA", product: "Normal", flete: 19000, minimumInsurance: 0, totalCost: 19000, deliveryDays: 3, isCOD: false }, previousCost: 18000 }}
        onConfirm={vi.fn()}
        onChooseAnother={vi.fn()}
        isSubmitting={false}
      />,
    );
    expect(screen.getByText("El costo del envío cambió mientras comprabas.")).toBeInTheDocument();
    expect(screen.queryByTestId("recovery-cod-fee")).not.toBeInTheDocument();
  });
});

vi.mock("@/components/bold-checkout-button", () => ({ BoldCheckoutButton: () => null }));
vi.mock("@/components/bank-transfer-instructions", () => ({ BankTransferInstructions: () => null }));

import { OrderSummaryCard } from "@/app/(routes)/pedido/[orderId]/components/order-summary-card";
import type { Order } from "@/types";

const order = (shipping: Record<string, unknown>, total: number) =>
  ({
    id: "o-1",
    orderNumber: "ORD-1",
    fullName: "Clienta",
    email: "clienta@prueba.test",
    type: "STANDARD",
    subtotal: 50000,
    discount: 0,
    couponDiscount: 0,
    giftCardAmount: 0,
    total,
    payment: { method: "COD" },
    shipping: { provider: "ENVIOCLICK", status: "Preparing", createdAt: "2026-10-15T00:00:00.000Z", isCOD: true, ...shipping },
  }) as unknown as Order;

const renderSummary = (value: Order) =>
  render(
    <OrderSummaryCard
      order={value}
      stage={{ stage: "cod", title: "Contra entrega", description: "Pagas al recibir" } as never}
      awaitingPayment={false}
      autoOpenPayment={false}
      isStartingWompi={false}
      onPayWithWompi={vi.fn()}
    />,
  );

describe("resumen del pedido en la tienda", () => {
  it("envío y recaudo contra entrega en líneas separadas", () => {
    renderSummary(order({ cost: 18000, codFee: 7000 }, 75000));
    expect(screen.getByText("Recaudo contra entrega").closest("div")).toHaveTextContent(/7\.000/);
    expect(screen.getByText("Envío").closest("div")).toHaveTextContent(/18\.000/);
  });

  it("envío gratis: «Gratis» y el recaudo aparte", () => {
    renderSummary(order({ cost: 0, codFee: 7000 }, 57000));
    expect(screen.getByText("Gratis")).toBeInTheDocument();
    expect(screen.getByText("Recaudo contra entrega").closest("div")).toHaveTextContent(/7\.000/);
  });

  it("sin recaudo no hay línea", () => {
    renderSummary(order({ cost: 18000, codFee: null }, 68000));
    expect(screen.queryByText("Recaudo contra entrega")).not.toBeInTheDocument();
  });
});
