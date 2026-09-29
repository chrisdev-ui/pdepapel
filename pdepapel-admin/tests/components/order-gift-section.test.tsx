// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FormProvider, useForm } from "react-hook-form";

import { GiftSection } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/gift-section";
import type { OrderFormValues } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/schema";

/**
 * La sección Regalo del pedido: apagada solo muestra el interruptor; al
 * encenderla aparecen quién recibe, su correo, su teléfono y el mensaje.
 */
function Harness({ initial }: { initial: Partial<OrderFormValues> }) {
  const form = useForm<OrderFormValues>({
    defaultValues: {
      isGift: false,
      giftRecipientName: "",
      giftRecipientEmail: "",
      giftRecipientPhone: "",
      giftMessage: "",
      ...initial,
    } as OrderFormValues,
  });
  return (
    <FormProvider {...form}>
      <GiftSection loading={false} />
    </FormProvider>
  );
}

describe("GiftSection", () => {
  afterEach(() => cleanup());

  it("hides the recipient fields until the order is marked as a gift", () => {
    render(<Harness initial={{}} />);

    expect(screen.getByRole("switch", { name: "Es un regalo" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.queryByLabelText(/Quién lo recibe/)).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: "Es un regalo" }));

    expect(screen.getByLabelText(/Quién lo recibe/)).toBeInTheDocument();
    expect(screen.getByLabelText("Su correo")).toBeInTheDocument();
    expect(screen.getByLabelText("Mensaje")).toBeInTheDocument();
    expect(screen.getAllByText(/sin productos ni precios/).length).toBeGreaterThan(0);
  });

  it("shows the saved recipient on an existing gift order", () => {
    render(
      <Harness
        initial={{
          isGift: true,
          giftRecipientName: "Mariana López",
          giftMessage: "¡Feliz cumpleaños!",
        }}
      />,
    );

    expect(screen.getByLabelText(/Quién lo recibe/)).toHaveValue("Mariana López");
    expect(screen.getByLabelText("Mensaje")).toHaveValue("¡Feliz cumpleaños!");
    expect(screen.getByText(/18\/300/)).toBeInTheDocument();
  });
});
