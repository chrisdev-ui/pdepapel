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

  // Cancelar antes de liberar: el inventario nunca se descontó, solo vuelve el cupo.
  it("cancelar un pedido con anticipo que espera la preventa no promete devolver inventario", () => {
    render(
      <StatusActions status={OrderStatus.DEPOSIT_PAID} type={OrderType.STANDARD} paymentMethod={PaymentMethod.BankTransfer} shippingProvider={ShippingProvider.ENVIOCLICK} loading={false} variant="care" paymentPlan="DEPOSIT" heldByPresale onTransition={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Cancelar/ }));
    expect(screen.getByText(/No se toca el inventario: la preventa no se ha liberado/)).toBeInTheDocument();
    expect(screen.getByText(/El anticipo y los abonos no se devuelven solos/)).toBeInTheDocument();
    expect(screen.queryByText("El inventario vuelve con un movimiento de cancelación.")).not.toBeInTheDocument();
  });

  it("un pedido pagado ya despachable sigue diciendo que el inventario vuelve", () => {
    render(
      <StatusActions status={OrderStatus.PAID} type={OrderType.STANDARD} paymentMethod={PaymentMethod.BankTransfer} shippingProvider={ShippingProvider.ENVIOCLICK} loading={false} variant="care" onTransition={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Cancelar/ }));
    expect(screen.getByText("El inventario vuelve con un movimiento de cancelación.")).toBeInTheDocument();
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
