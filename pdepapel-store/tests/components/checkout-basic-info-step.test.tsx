/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, userId: null }),
}));

import { BasicInfoStep, shippingTeaser } from "@/app/(routes)/finalizar-compra/components/steps/basic-info-step";
import type { CheckoutFormValue } from "@/app/(routes)/finalizar-compra/components/multi-step-checkout-form";
import { Form } from "@/components/ui/form";

function Harness(props: { freeShippingThreshold?: number | null; freeShipping?: boolean }) {
  const form = useForm<CheckoutFormValue>({
    defaultValues: { fullName: "", email: "", telephone: "", newsletterOptIn: false, isGift: false } as Partial<CheckoutFormValue> as CheckoutFormValue,
  });
  return (
    <Form {...form}>
      <BasicInfoStep form={form} {...props} />
    </Form>
  );
}

describe("checkout · Tus datos", () => {
  afterEach(cleanup);

  it("ya no pide la cédula: solo nombre, correo y teléfono", () => {
    render(<Harness freeShippingThreshold={150000} />);
    expect(screen.getByLabelText(/Nombre y apellidos/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Correo electrónico/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Teléfono/ })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Documento|cédula/i)).toBeNull();
  });

  it("dice desde el primer paso cuándo el envío es gratis, con el umbral de Configuración", () => {
    render(<Harness freeShippingThreshold={150000} />);
    expect(screen.getByTestId("checkout-shipping-teaser")).toHaveTextContent(
      /Envío gratis desde \$\s?150\.000 · el valor exacto en el siguiente paso/,
    );
  });

  it("las tres formas de la línea de envío", () => {
    expect(shippingTeaser(null, false)).toBe("El valor del envío, en el siguiente paso.");
    expect(shippingTeaser(0, false)).toBe("El valor del envío, en el siguiente paso.");
    expect(shippingTeaser(150000, true)).toBe("Tu envío es gratis.");
  });
});
