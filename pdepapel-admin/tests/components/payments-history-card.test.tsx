// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PaymentsHistoryCard } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/payments-history-card";

afterEach(cleanup);

const payment = (id: string, kind: "DEPOSIT" | "INSTALLMENT" | "BALANCE", amount: number, day: number, method = "BankTransfer") => ({
  id,
  kind,
  status: "APPROVED",
  amount,
  method,
  paidAt: new Date(Date.UTC(2026, 9, day, 17)),
  note: null,
  createdAt: new Date(Date.UTC(2026, 9, day, 17)),
});

const order = (overrides: Record<string, unknown>) =>
  ({ paymentPlan: "DEPOSIT", status: "DEPOSIT_PAID", total: 160000, giftCardAmount: 0, depositAmount: 30000, payments: [], ...overrides }) as never;

/** El historial de pagos de una preventa con anticipo en la página del pedido. */
describe("Pagos de la clienta", () => {
  it("…393 con un abono: cada cobro con fecha, medio, valor y lo acumulado; falta total − pagado + envío", () => {
    render(<PaymentsHistoryCard order={order({ payments: [payment("p1", "DEPOSIT", 60000, 28), payment("p2", "INSTALLMENT", 20000, 30, "CASH")] })} />);
    const rows = within(screen.getByRole("list", { name: "Historial de pagos" })).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(/Anticipo · 28 de oct\.? de 2026 · Transferencia o Bre-B/);
    expect(rows[0].textContent).toMatch(/60\.000.*Llevas \$\s?60\.000/);
    expect(rows[1].textContent).toMatch(/Abono · 30 de oct\.? de 2026 · Efectivo/);
    expect(rows[1].textContent).toMatch(/Llevas \$\s?80\.000/);
    expect(screen.getByTestId("payments-summary").textContent).toMatch(/Pagado \$\s?80\.000 de \$\s?160\.000 · falta \$\s?80\.000 \+ envío/);
  });

  it("pagado todo antes de que llegue: «Saldo pagado»", () => {
    render(<PaymentsHistoryCard order={order({ payments: [payment("p1", "DEPOSIT", 30000, 28), payment("p2", "INSTALLMENT", 130000, 29)] })} />);
    expect(screen.getByTestId("payments-summary").textContent).toMatch(/Saldo pagado: al llegar solo falta el envío/);
  });

  it("pagado con el saldo: suma todo, sin «falta»", () => {
    render(<PaymentsHistoryCard order={order({ status: "PAID", total: 169000, payments: [payment("p1", "DEPOSIT", 60000, 28), payment("p2", "BALANCE", 109000, 31)] })} />);
    expect(screen.getByTestId("payments-summary").textContent).toMatch(/^Pagado \$\s?169\.000 de \$\s?169\.000$/);
  });

  it("sin cobros o sin anticipo no se muestra", () => {
    const { container } = render(<PaymentsHistoryCard order={order({ payments: [] })} />);
    render(<PaymentsHistoryCard order={order({ paymentPlan: "FULL", payments: [payment("p1", "DEPOSIT", 1, 1)] })} />);
    expect(container.textContent).toBe("");
    expect(screen.queryByText("Pagos de la clienta")).toBeNull();
  });
});
