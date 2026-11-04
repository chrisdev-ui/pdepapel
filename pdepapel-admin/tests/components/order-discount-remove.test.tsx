// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FormProvider, useForm, type UseFormReturn } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));

import { DiscountsSection } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/discounts-section";
import type { OrderFormValues } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/schema";

afterEach(cleanup);

let form: UseFormReturn<OrderFormValues> | undefined;

function Harness() {
  form = useForm<OrderFormValues>({
    defaultValues: { discount: { type: "FIXED", amount: 20300, reason: "CÁPSULAS SORPRESA COMBO X7" } } as unknown as OrderFormValues,
  });
  // El formulario real lee el estado sucio al pintar (guardar, aviso de salida); sin leerlo, react-hook-form no lo calcula.
  void form.formState.isDirty;
  return (
    <FormProvider {...form}>
      <DiscountsSection storeId="s" availableCoupons={[]} coupon={null} setCoupon={() => {}} initialCoupon={null} subtotal={127000} locked={false} loading={false} />
    </FormProvider>
  );
}

/** ORD-1793744962855-67 (2026-11-03): en un pedido guardado, «Quitar descuento» dejaba el tipo FIXED con monto 0 y no dejaba guardar. */
describe("«Quitar descuento» en un pedido que ya tenía descuento", () => {
  it("deja el pedido sin tipo, sin monto y sin motivo, y la sección sin descuento", async () => {
    render(<Harness />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Quitar descuento/ }));
    });

    expect(form!.getValues("discount")).toEqual({ type: undefined, amount: 0, reason: "" });
    expect(form!.formState.isDirty).toBe(true);
    expect(screen.queryByRole("button", { name: /Quitar descuento/ })).toBeNull();
  });
});
