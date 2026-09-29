/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";

import { GiftCardField } from "@/app/(routes)/finalizar-compra/components/gift-card-field";
import type { CheckoutFormValue, GiftCardState } from "@/app/(routes)/finalizar-compra/components/multi-step-checkout-form";
import { Form } from "@/components/ui/form";

function Harness({ state, validate, applied = 0 }: { state: GiftCardState; validate: (code: string) => void; applied?: number }) {
  const form = useForm<CheckoutFormValue>({ defaultValues: { giftCardCode: "" } as Partial<CheckoutFormValue> as CheckoutFormValue });
  return (
    <Form {...form}>
      <GiftCardField
        form={form}
        giftCardState={state}
        setGiftCardState={vi.fn()}
        validateGiftCardMutate={validate}
        validateGiftCardStatus="idle"
        appliedAmount={applied}
      />
    </Form>
  );
}

describe("checkout · tarjeta de regalo", () => {
  afterEach(() => cleanup());

  it("formats what the customer types as PDP-XXXX-XXXX-XXXX and validates on Enter without submitting", () => {
    const validate = vi.fn();
    render(<Harness state={{ card: null, isValid: null }} validate={validate} />);
    const input = screen.getByLabelText("¿Tienes una tarjeta de regalo?");
    fireEvent.change(input, { target: { value: "pdp 7k3m p9qx 2r8t" } });
    expect(input).toHaveValue("PDP-7K3M-P9QX-2R8T");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(validate).toHaveBeenCalledWith("PDP-7K3M-P9QX-2R8T");
  });

  it("tells the customer what the card covers and what is left on it", () => {
    render(<Harness state={{ card: { balance: 60000, last4: "2R8T" }, isValid: true }} validate={vi.fn()} applied={25000} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("termina en 2R8T");
    expect(status).toHaveTextContent("25.000");
    expect(status).toHaveTextContent("35.000");
    expect(screen.getByRole("button", { name: "Quitar" })).toBeInTheDocument();
  });
});
