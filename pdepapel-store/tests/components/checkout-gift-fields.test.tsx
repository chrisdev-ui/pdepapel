/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, userId: null }),
}));

import { BasicInfoStep } from "@/app/(routes)/finalizar-compra/components/steps/basic-info-step";
import { Form } from "@/components/ui/form";
import type { CheckoutFormValue } from "@/app/(routes)/finalizar-compra/components/multi-step-checkout-form";

/**
 * El paso «Tus datos» ofrece «¿Es un regalo?». Apagado, no pide nada más;
 * encendido, pide quién recibe (obligatorio) y ofrece correo, celular y
 * mensaje, y explica que el recibo completo va a quien compra.
 */
function Harness({ isGift = false }: { isGift?: boolean }) {
  const form = useForm<CheckoutFormValue>({
    defaultValues: {
      fullName: "",
      email: "",
      telephone: "",
      documentId: "",
      newsletterOptIn: false,
      isGift,
      giftRecipientName: "",
      giftRecipientEmail: "",
      giftRecipientPhone: "",
      giftMessage: "",
    } as Partial<CheckoutFormValue> as CheckoutFormValue,
  });
  return (
    <Form {...form}>
      <BasicInfoStep form={form} />
    </Form>
  );
}

describe("checkout · ¿Es un regalo?", () => {
  afterEach(() => cleanup());

  it("keeps the recipient fields hidden until the buyer says it is a gift", () => {
    render(<Harness />);

    const toggle = screen.getByRole("checkbox", { name: /¿Es un regalo\?/ });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/recibo completo en tu correo/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Nombre de quien recibe/)).toBeNull();

    fireEvent.click(toggle);

    expect(screen.getByLabelText(/Nombre de quien recibe/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Su correo \(opcional\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Su celular \(opcional\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Mensaje para esa persona/)).toBeInTheDocument();
    expect(screen.getByText(/0\/300/)).toBeInTheDocument();
  });

  it("counts the message length as the buyer types", () => {
    render(<Harness isGift />);

    fireEvent.change(screen.getByLabelText(/Mensaje para esa persona/), {
      target: { value: "¡Feliz cumpleaños!" },
    });

    expect(screen.getByText(/18\/300/)).toBeInTheDocument();
  });
});
