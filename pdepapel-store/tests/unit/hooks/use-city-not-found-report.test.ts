// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/customer-analytics", () => ({ trackCustomerEvent: mocks.track }));

import { useCityNotFoundReport } from "@/hooks/use-city-not-found-report";

type Props = Parameters<typeof useCityNotFoundReport>[0];

describe("useCityNotFoundReport", () => {
  beforeEach(() => mocks.track.mockClear());

  it("avisa una vez por búsqueda sin resultados, con el término saneado", () => {
    const { rerender } = renderHook((props: Props) => useCityNotFoundReport(props), {
      initialProps: { query: "Pueblo raro", results: [], isLoading: false, isStale: false },
    });
    rerender({ query: "Pueblo raro", results: [], isLoading: false, isStale: false });
    expect(mocks.track).toHaveBeenCalledTimes(1);
    expect(mocks.track).toHaveBeenCalledWith("city_not_found", { checkout_step: 2, search_term: "pueblo raro" });
  });

  it("no avisa mientras carga, con la lista anterior, con resultados ni con menos de tres letras", () => {
    const { rerender } = renderHook((props: Props) => useCityNotFoundReport(props), {
      initialProps: { query: "Bo", results: [] as unknown[], isLoading: false, isStale: false } as Props,
    });
    rerender({ query: "Bogota", results: [], isLoading: true, isStale: false });
    rerender({ query: "Bogota", results: [], isLoading: false, isStale: true });
    rerender({ query: "Bogota", results: [{}], isLoading: false, isStale: false });
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it("nunca manda un número de documento o teléfono escrito por error", () => {
    renderHook(() => useCityNotFoundReport({ query: "3025556677", results: [], isLoading: false, isStale: false }));
    const [, params] = mocks.track.mock.calls[0];
    expect(String(params.search_term ?? "")).not.toContain("3025556677");
  });
});
