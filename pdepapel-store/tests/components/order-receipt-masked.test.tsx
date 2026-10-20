/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/bold-checkout-button", () => ({ BoldCheckoutButton: () => null }));
vi.mock("@/components/bank-transfer-instructions", () => ({ BankTransferInstructions: () => null }));

import { OrderShippingCard } from "@/app/(routes)/pedido/[orderId]/components/order-shipping-card";
import { OrderSummaryCard } from "@/app/(routes)/pedido/[orderId]/components/order-summary-card";
import { OrderGiftNotice } from "@/components/order-gift-notice";
import { getOrderStage } from "@/lib/order-status";
import type { Order } from "@/types";

import { fullReceiptOrder, maskedReceiptOrder } from "../fixtures/receipt-orders";

afterEach(cleanup);

const renderShipping = (order: Order) =>
  render(
    <OrderShippingCard
      order={order}
      awaitingPayment={false}
      trackingEvents={[]}
      canRefreshTracking={false}
      isRefreshingTracking={false}
      onRefreshTracking={vi.fn()}
    />,
  );

const renderSummary = (order: Order) =>
  render(
    <OrderSummaryCard
      order={order}
      stage={getOrderStage(order)}
      awaitingPayment={false}
      autoOpenPayment={false}
      isStartingWompi={false}
      onPayWithWompi={vi.fn()}
    />,
  );

const addressBlock = () => document.querySelector("address") as HTMLElement;

describe("recibo recortado para quien solo tiene el enlace", () => {
  it("la dirección muestra nombre, ciudad y teléfono recortados, sin renglones vacíos", () => {
    renderShipping(maskedReceiptOrder());

    const address = addressBlock();
    expect(address).toHaveTextContent("Ana M.");
    expect(address).toHaveTextContent("Medellín, Antioquia");
    expect(address).toHaveTextContent("•••• 0000");
    for (const line of Array.from(address.querySelectorAll("p"))) {
      expect(line.textContent?.trim()).not.toBe("");
    }
    expect(screen.getByText(/no muestra la dirección completa/)).toBeInTheDocument();
  });

  it("la guía y el enlace de la transportadora siguen visibles", () => {
    renderShipping(maskedReceiptOrder());

    expect(screen.getByText("GUIA-PRUEBA-1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Rastrear en Coordinadora/ })).toBeInTheDocument();
  });

  it("la versión completa conserva calle, barrio, empresa y referencia, sin la nota de privacidad", () => {
    renderShipping(fullReceiptOrder());

    const address = addressBlock();
    expect(address).toHaveTextContent("Ana María Prueba");
    expect(address).toHaveTextContent("Empresa Prueba");
    expect(address).toHaveTextContent("Calle Prueba 1, Apto 2");
    expect(address).toHaveTextContent("Barrio Centro");
    expect(address).toHaveTextContent("Portería azul");
    expect(screen.queryByText(/no muestra la dirección completa/)).not.toBeInTheDocument();
  });

  it("retiro en tienda recortado: «A nombre de» sin renglones vacíos", () => {
    renderShipping(maskedReceiptOrder({ shipping: { id: "s", provider: "NONE", status: "Preparing" } as Order["shipping"] }));

    const address = addressBlock();
    expect(address).toHaveTextContent("Ana M.");
    for (const line of Array.from(address.querySelectorAll("p"))) {
      expect(line.textContent?.trim()).not.toBe("");
    }
  });

  it.each([
    ["recortado", maskedReceiptOrder()],
    ["completo", fullReceiptOrder()],
  ])("«Referencia» es el número del pedido (%s), nunca la transacción", (_label, order) => {
    renderSummary(order);

    const row = screen.getByText("Referencia").closest("div") as HTMLElement;
    expect(within(row).getByText("ORD-1")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("TX-PRUEBA-1");
  });

  it("el correo recortado se muestra tal cual", () => {
    renderSummary(maskedReceiptOrder());
    expect(screen.getByText("a***@prueba.test")).toBeInTheDocument();
  });

  it("regalo recortado: el nombre de quien recibe sin el mensaje", () => {
    render(<OrderGiftNotice order={maskedReceiptOrder()} />);

    expect(screen.getByText(/Es un regalo para Lucía P\./)).toBeInTheDocument();
    expect(screen.queryByText(/Tu mensaje/)).not.toBeInTheDocument();
  });
});
