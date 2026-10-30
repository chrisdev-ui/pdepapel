// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CancelSettlementFields } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/cancel-settlement-fields";
import { UnfulfilledPresaleNotice } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/unfulfilled-presale-notice";

afterEach(cleanup);

const last = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)?.[0];

describe("CancelSettlementFields", () => {
  it("arranca con todo devuelto por transferencia y hoy", () => {
    const onChange = vi.fn();
    render(<CancelSettlementFields info={{ prepaid: 80000, maxRetained: 60000, unfulfilled: false }} onChange={onChange} />);
    expect(last(onChange)).toMatchObject({ refunded: 80000, refundMethod: "BankTransfer", retained: 0, storeCredit: 0 });
    expect(last(onChange).refundedAt).toEqual(expect.any(String));
    expect(screen.getByText(/· cuadra/)).toBeTruthy();
  });

  it("si no suma lo pagado, no hay cuerpo; devuelto + saldo a favor que cuadran sí", () => {
    const onChange = vi.fn();
    render(<CancelSettlementFields info={{ prepaid: 80000, maxRetained: 0, unfulfilled: true }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Devuelto"), { target: { value: "50000" } });
    expect(last(onChange)).toBeNull();
    expect(screen.getByText(/tienen que sumar exactamente lo que pagó/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Saldo a favor"), { target: { value: "30.000" } });
    expect(last(onChange)).toMatchObject({ refunded: 50000, storeCredit: 30000, retained: 0 });
  });

  it("«sin unidad»: no ofrece retener y lo dice", () => {
    render(<CancelSettlementFields info={{ prepaid: 30000, maxRetained: 0, unfulfilled: true }} onChange={vi.fn()} />);
    expect(screen.queryByLabelText("Retenido (anticipo no reembolsable)")).toBeNull();
    expect(screen.getByText(/No se puede retener nada/)).toBeTruthy();
  });

  it("retener más que el anticipo marca el campo y no deja cuerpo; todo retenido no pide medio ni fecha", () => {
    const onChange = vi.fn();
    render(<CancelSettlementFields info={{ prepaid: 30000, maxRetained: 30000, unfulfilled: false }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Devuelto"), { target: { value: "0" } });
    const retained = screen.getByLabelText("Retenido (anticipo no reembolsable)");
    fireEvent.change(retained, { target: { value: "30001" } });
    expect(retained.getAttribute("aria-invalid")).toBe("true");
    expect(last(onChange)).toBeNull();
    fireEvent.change(retained, { target: { value: "30000" } });
    expect(screen.queryByLabelText("Por dónde lo devolviste")).toBeNull();
    expect(last(onChange)).toEqual({ refunded: 0, refundMethod: null, refundedAt: null, refundReference: null, retained: 30000, storeCredit: 0 });
  });

  it("una fecha pasada viaja al mediodía de Bogotá, con medio y referencia", () => {
    const onChange = vi.fn();
    render(<CancelSettlementFields info={{ prepaid: 30000, maxRetained: 30000, unfulfilled: false }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Por dónde lo devolviste"), { target: { value: "Bold" } });
    fireEvent.change(screen.getByLabelText("Fecha de la devolución"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Referencia (opcional)"), { target: { value: " TRX-9 " } });
    expect(last(onChange)).toMatchObject({ refundMethod: "Bold", refundedAt: "2026-10-01T12:00:00-05:00", refundReference: "TRX-9" });
  });
});

describe("UnfulfilledPresaleNotice", () => {
  it("lista los tres pasos de la devolución", () => {
    render(<UnfulfilledPresaleNotice />);
    expect(screen.getByRole("heading", { name: "Preventa sin unidad: hay que devolver" })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});
