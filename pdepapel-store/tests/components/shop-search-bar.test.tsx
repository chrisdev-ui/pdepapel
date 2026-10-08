// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_FILTERS } from "@/lib/shop-filters";

const mocks = vi.hoisted(() => ({
  setFilter: vi.fn(),
  filters: {} as Record<string, unknown>,
}));

vi.mock("@/hooks/use-product-filters", () => ({
  useProductFilters: () => ({ filters: mocks.filters, setFilter: mocks.setFilter, setFilters: vi.fn(), toggleFilter: vi.fn() }),
}));
vi.mock("@/lib/customer-analytics", () => ({ trackCustomerEvent: vi.fn() }));

import ShopSearchBar from "@/app/(routes)/tienda/components/shop-search-bar";

const offsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");

describe("ShopSearchBar", () => {
  beforeAll(() => {
    // jsdom no hace diseño: sin esto el campo parece oculto y nunca escribe.
    Object.defineProperty(HTMLElement.prototype, "offsetParent", { configurable: true, get() { return this.parentNode; } });
  });
  afterAll(() => {
    if (offsetParent) Object.defineProperty(HTMLElement.prototype, "offsetParent", offsetParent);
  });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.filters = { ...EMPTY_FILTERS, search: "" };
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("writes what the customer types once the debounce settles", () => {
    render(<ShopSearchBar />);
    const input = screen.getByRole("searchbox");
    input.focus();

    fireEvent.change(input, { target: { value: "gat" } });
    act(() => vi.advanceTimersByTime(100));
    fireEvent.change(input, { target: { value: "gato" } });
    act(() => vi.advanceTimersByTime(400));

    expect(mocks.setFilter).toHaveBeenCalledTimes(1);
    expect(mocks.setFilter).toHaveBeenCalledWith("search", "gato");
  });

  it("does not put the search back when it is removed from outside (chip ×, «Limpiar todo»)", () => {
    mocks.filters = { ...EMPTY_FILTERS, search: "gato" };
    const { rerender } = render(<ShopSearchBar />);
    act(() => vi.advanceTimersByTime(400));

    mocks.filters = { ...EMPTY_FILTERS, search: "" };
    // El componente va en memo; en la tienda lo vuelve a pintar nuqs al cambiar la URL.
    rerender(<ShopSearchBar className="url-changed" />);
    act(() => vi.advanceTimersByTime(4_000));

    expect(mocks.setFilter).not.toHaveBeenCalled();
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
  });
});
