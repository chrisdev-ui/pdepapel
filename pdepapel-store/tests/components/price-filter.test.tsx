// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_FILTERS } from "@/lib/shop-filters";

const mocks = vi.hoisted(() => ({
  setFilters: vi.fn(),
  filters: {} as Record<string, unknown>,
}));

vi.mock("@/hooks/use-product-filters", () => ({
  useProductFilters: () => ({ filters: mocks.filters, setFilters: mocks.setFilters, setFilter: vi.fn(), toggleFilter: vi.fn() }),
}));

import PriceFilter from "@/components/price-filter";

const applied = () => {
  const update = mocks.setFilters.mock.calls.at(-1)?.[0];
  return typeof update === "function" ? update({ ...EMPTY_FILTERS, page: 4 }) : update;
};

describe("PriceFilter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.filters = { ...EMPTY_FILTERS };
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("writes the range once after a preset is chosen", () => {
    render(<PriceFilter />);

    fireEvent.click(screen.getByRole("button", { name: "$ 5.000 – $ 10.000" }));
    act(() => vi.advanceTimersByTime(400));

    expect(mocks.setFilters).toHaveBeenCalledTimes(1);
    expect(applied()).toMatchObject({ minPrice: 5_000, maxPrice: 10_000, page: 1 });
  });

  it("does not put the range back when it is removed from outside (chip ×, «Limpiar todo»)", () => {
    mocks.filters = { ...EMPTY_FILTERS, minPrice: 5_000, maxPrice: 10_000 };
    const { rerender } = render(<PriceFilter />);
    act(() => vi.advanceTimersByTime(400));

    mocks.filters = { ...EMPTY_FILTERS };
    rerender(<PriceFilter />);
    act(() => vi.advanceTimersByTime(4_000));

    expect(mocks.setFilters).not.toHaveBeenCalled();
    expect(screen.getByRole("slider", { name: "Precio mínimo" })).toHaveAttribute("aria-valuenow", "0");
  });

  it("does not drag an old range into a new URL (megamenu click)", () => {
    mocks.filters = { ...EMPTY_FILTERS, minPrice: 5_000, maxPrice: 10_000 };
    const { rerender } = render(<PriceFilter />);

    fireEvent.click(screen.getByRole("button", { name: "$ 10.000 – $ 20.000" }));
    mocks.filters = { ...EMPTY_FILTERS, typeId: ["cuadernos"] };
    rerender(<PriceFilter />);
    act(() => vi.advanceTimersByTime(4_000));

    expect(mocks.setFilters).not.toHaveBeenCalled();
  });
});
