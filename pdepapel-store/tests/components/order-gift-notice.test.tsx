/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OrderGiftNotice } from "@/components/order-gift-notice";

describe("OrderGiftNotice", () => {
  afterEach(() => cleanup());

  it("renders nothing for a normal order", () => {
    const { container } = render(
      <OrderGiftNotice order={{ isGift: false, giftRecipientName: null, giftMessage: null }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("tells the buyer who the gift is for and what that person receives", () => {
    render(
      <OrderGiftNotice
        order={{
          isGift: true,
          giftRecipientName: "Mariana López",
          giftMessage: "¡Feliz cumpleaños!",
        }}
      />,
    );

    expect(screen.getByRole("note")).toHaveTextContent("Es un regalo para Mariana López.");
    expect(screen.getByRole("note")).toHaveTextContent("sin productos ni precios");
    expect(screen.getByText(/¡Feliz cumpleaños!/)).toBeInTheDocument();
  });
});
