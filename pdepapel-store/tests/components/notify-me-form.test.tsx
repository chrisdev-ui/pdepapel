/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/home/early-access-form", () => ({
  EarlyAccessForm: ({ label, source, productId }: { label: string; source: string; productId?: string }) => (
    <button type="button" data-source={source} data-product={productId}>
      {label}
    </button>
  ),
}));

import { NotifyMeForm } from "@/components/notify-me-form";

describe("NotifyMeForm", () => {
  afterEach(cleanup);

  it("asks for the email on coming-soon products with the arrival date", () => {
    render(<NotifyMeForm productId="p1" arrivalLabel="Llega el 1 de oct" />);
    expect(screen.getByText(/Llega el 1 de oct · te avisamos cuando esté en la tienda/)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Avísame cuando llegue" });
    expect(button).toHaveAttribute("data-source", "producto");
    expect(button).toHaveAttribute("data-product", "p1");
  });

  it("uses back-in-stock copy on sold-out products", () => {
    render(<NotifyMeForm productId="p2" arrivalLabel={null} variant="sold-out" />);
    expect(screen.getByText(/Agotado por ahora · te avisamos cuando vuelva/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Avísame cuando vuelva" })).toHaveAttribute("data-product", "p2");
  });
});
