/* @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  LOW_STOCK_THRESHOLD,
  LowStockNotice,
  canShowLowStockInProductCard,
  getLowStockLabel,
  isLowStock,
} from "@/components/ui/low-stock-notice";

describe("LowStockNotice", () => {
  it("only treats one to three available units as low stock", () => {
    expect(LOW_STOCK_THRESHOLD).toBe(3);
    expect(isLowStock(0)).toBe(false);
    expect(isLowStock(1)).toBe(true);
    expect(isLowStock(3)).toBe(true);
    expect(isLowStock(4)).toBe(false);
    expect(canShowLowStockInProductCard(2, false)).toBe(true);
    expect(canShowLowStockInProductCard(2, true)).toBe(false);
  });

  it("uses concise wording in product cards", () => {
    render(<LowStockNotice stock={2} variant="card" />);

    expect(screen.getByText("Últimas 2 unidades")).toBeInTheDocument();
    expect(getLowStockLabel(1, "card")).toBe("Última unidad");
  });

  it("explains the selected option on the product page", () => {
    render(<LowStockNotice stock={1} variant="detail" />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "¡Última unidad disponible!",
    );
  });

  it("does not render urgency for unavailable or sufficiently stocked products", () => {
    const { container, rerender } = render(
      <LowStockNotice stock={0} variant="card" />,
    );
    expect(container).toBeEmptyDOMElement();

    rerender(<LowStockNotice stock={4} variant="detail" />);
    expect(container).toBeEmptyDOMElement();
  });
});
