// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const filterMocks = vi.hoisted(() => ({
  setFilter: vi.fn(),
}));

vi.mock("@/hooks/use-product-filters", () => ({
  useProductFilters: () => ({
    filters: { isOnSale: false },
    setFilter: filterMocks.setFilter,
  }),
}));

import { OnSaleFilter } from "@/components/on-sale-filter";

describe("OnSaleFilter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders an accessible offer switch and updates the shared filter", async () => {
    const user = userEvent.setup();
    render(<OnSaleFilter />);

    const offerSwitch = screen.getByRole("switch", {
      name: "Mostrar solo ofertas",
    });
    expect(offerSwitch).not.toBeChecked();
    expect(offerSwitch).toHaveClass("h-11", "w-11", "touch-manipulation");
    expect(offerSwitch.firstElementChild).toHaveClass("h-5", "w-9");

    await user.click(offerSwitch);

    expect(filterMocks.setFilter).toHaveBeenCalledWith("isOnSale", true);

    filterMocks.setFilter.mockClear();
    await user.click(screen.getByText("Mostrar solo ofertas"));

    expect(filterMocks.setFilter).toHaveBeenCalledWith("isOnSale", true);
  });
});
