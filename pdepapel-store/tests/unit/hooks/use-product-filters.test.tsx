// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ state: {} as Record<string, unknown>, setRaw: vi.fn() }));

vi.mock("nuqs", () => {
  const parser = { withDefault: () => parser };
  return {
    parseAsArrayOf: () => parser,
    parseAsBoolean: parser,
    parseAsInteger: parser,
    parseAsString: parser,
    useQueryStates: () => [mocks.state, mocks.setRaw],
  };
});

import { useProductFilters } from "@/hooks/use-product-filters";

beforeEach(() => {
  mocks.setRaw.mockReset();
  mocks.state = {
    typeId: [], categoryId: [], colorId: [], sizeId: [], designId: [], optionValueId: [],
    minPrice: null, maxPrice: null, sortOption: "", page: 3, search: "", isOnSale: false, exact: false,
  };
});

const historyOfLastCall = () => mocks.setRaw.mock.calls.at(-1)?.[1]?.history;

describe("useProductFilters y el historial", () => {
  it("elegir un tipo o una subcategoría apila una entrada", () => {
    const { result } = renderHook(() => useProductFilters());
    act(() => result.current.toggleFilter("typeId", "t-1"));
    expect(historyOfLastCall()).toBe("push");
    act(() => result.current.toggleFilter("categoryId", "c-1"));
    expect(historyOfLastCall()).toBe("push");
  });

  it("colores, ofertas, orden y búsqueda reemplazan la entrada actual", () => {
    const { result } = renderHook(() => useProductFilters());
    act(() => result.current.toggleFilter("colorId", "rosa"));
    expect(historyOfLastCall()).toBe("replace");
    act(() => result.current.setFilter("isOnSale", true));
    expect(historyOfLastCall()).toBe("replace");
    act(() => result.current.setFilter("sortOption", "price-asc"));
    expect(historyOfLastCall()).toBe("replace");
    act(() => result.current.setFilters((previous) => ({ ...previous, minPrice: 1000, page: 1 })));
    expect(historyOfLastCall()).toBe("replace");
  });
});
