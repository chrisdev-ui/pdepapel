// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StatusActions } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/status-actions";
import { requestOrderAction } from "@/lib/order-actions";
import { OrderStatus, OrderType, PaymentMethod, ShippingProvider } from "@prisma/client";

afterEach(cleanup);

describe("StatusActions", () => {
  it("opens the pay dialog when the header asks for it, only on the status card", async () => {
    const onTransition = vi.fn().mockResolvedValue(undefined);
    render(
      <>
        <StatusActions status={OrderStatus.PENDING} type={OrderType.STANDARD} paymentMethod={PaymentMethod.BankTransfer} shippingProvider={ShippingProvider.MANUAL} loading={false} variant="card" onTransition={onTransition} />
        <StatusActions status={OrderStatus.PENDING} type={OrderType.STANDARD} paymentMethod={PaymentMethod.BankTransfer} shippingProvider={ShippingProvider.MANUAL} loading={false} variant="care" onTransition={onTransition} />
      </>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    await act(async () => requestOrderAction("pay"));

    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs).toHaveLength(1);
    expect(screen.getByLabelText("Referencia de la transferencia")).toBeInTheDocument();
    expect(screen.getByText(/«Pendiente de pago» a «Pagado»/)).toBeInTheDocument();
  });

  it("lets a manual delivery be marked as sent without a guide number", async () => {
    const onTransition = vi.fn().mockResolvedValue(undefined);
    render(
      <StatusActions status={OrderStatus.PAID} type={OrderType.STANDARD} paymentMethod={PaymentMethod.BankTransfer} shippingProvider={ShippingProvider.MANUAL} loading={false} variant="card" onTransition={onTransition} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Marcar como enviado" }));
    expect(screen.getByLabelText("Número de guía (opcional)")).toBeInTheDocument();
    expect(screen.getByText(/déjalo vacío/)).toBeInTheDocument();

    const confirm = screen.getAllByRole("button", { name: "Marcar como enviado" }).at(-1)!;
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
    expect(screen.getAllByRole("button", { name: "Marcar como enviado" }).at(-1)).toBeDisabled();
  });
});
