// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StatusActions } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/status-actions";
import { OrderStatus, OrderType, PaymentMethod, ShippingProvider } from "@prisma/client";

afterEach(cleanup);

describe("StatusActions", () => {
  it("lets a manual delivery be marked as sent without a guide number", async () => {
    const onTransition = vi.fn().mockResolvedValue(undefined);
    render(
      <StatusActions status={OrderStatus.PAID} type={OrderType.STANDARD} paymentMethod={PaymentMethod.BankTransfer} shippingProvider={ShippingProvider.MANUAL} loading={false} variant="card" onTransition={onTransition} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Marcar como enviado" }));
    expect(screen.getByLabelText("Número de guía (opcional)")).toBeInTheDocument();
    expect(screen.getByText(/déjalo vacío/)).toBeInTheDocument();

    const confirm = screen.getByRole("button", { name: "Sí, marcar como enviado" });
    expect(confirm).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(confirm);
    });
    expect(onTransition).toHaveBeenCalledWith(expect.objectContaining({ to: OrderStatus.SENT, trackingCode: undefined }));
  });

  it("still requires the guide for an EnvioClick shipment without one", () => {
    render(
      <StatusActions status={OrderStatus.PAID} type={OrderType.STANDARD} paymentMethod={PaymentMethod.BankTransfer} shippingProvider={ShippingProvider.ENVIOCLICK} loading={false} variant="card" onTransition={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Marcar como enviado" }));
    expect(screen.getByLabelText("Número de guía")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sí, marcar como enviado" })).toBeDisabled();
  });
});
