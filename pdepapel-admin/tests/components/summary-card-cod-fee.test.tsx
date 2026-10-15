// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { FormProvider, useForm, type UseFormReturn } from "react-hook-form";
import { afterEach, describe, expect, it } from "vitest";

import type { OrderFormValues } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/schema";
import { SummaryCard } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/summary-card";

/** El recaudo contra entrega va en su propia línea del resumen; con envío gratis, «Envío: Gratis» y el recaudo aparte. */
function Harness({ children }: { children: ReactNode }) {
  const form = useForm({ defaultValues: { orderItems: [] } });
  return <FormProvider {...(form as unknown as UseFormReturn<OrderFormValues>)}>{children}</FormProvider>;
}

const totals = (total: number) => ({ subtotal: 50000, discount: 0, couponDiscount: 0, total });

afterEach(cleanup);

describe("resumen del pedido con recaudo contra entrega", () => {
  it("envío cobrado: «Envío» y «Recaudo contra entrega» en líneas separadas", () => {
    render(<Harness><SummaryCard totals={totals(75000)} shippingChargeState="charged" shippingCost={18000} codFee={7000} coupon={null} itemCount={1} /></Harness>);
    expect(screen.getByText("Envío").nextSibling).toHaveTextContent(/18\.000/);
    expect(screen.getByTestId("summary-cod-fee")).toHaveTextContent(/Recaudo contra entrega\+\s?\$\s7\.000/);
  });

  it("envío gratis: «Gratis» y el recaudo aparte", () => {
    render(<Harness><SummaryCard totals={totals(57000)} shippingChargeState="free" shippingCost={0} codFee={7000} coupon={null} itemCount={1} /></Harness>);
    expect(screen.getByText("Gratis")).toBeInTheDocument();
    expect(screen.getByTestId("summary-cod-fee")).toHaveTextContent(/7\.000/);
  });

  it("sin contra entrega no hay línea de recaudo", () => {
    render(<Harness><SummaryCard totals={totals(68000)} shippingChargeState="charged" shippingCost={18000} coupon={null} itemCount={1} /></Harness>);
    expect(screen.queryByTestId("summary-cod-fee")).not.toBeInTheDocument();
  });
});
