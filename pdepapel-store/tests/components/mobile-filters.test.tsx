// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_FILTERS } from "@/lib/shop-filters";

const mocks = vi.hoisted(() => ({
  setFilters: vi.fn(),
  count: vi.fn(),
  filters: { ...({} as Record<string, unknown>) },
}));

vi.mock("@/hooks/use-product-filters", () => ({
  useProductFilters: () => ({ filters: mocks.filters, setFilters: mocks.setFilters, setFilter: vi.fn(), toggleFilter: vi.fn() }),
}));
vi.mock("@/hooks/use-filter-count", () => ({ useFilterCount: mocks.count }));
vi.mock("@/lib/customer-analytics", () => ({ trackCustomerEvent: vi.fn() }));
vi.mock("@/components/price-filter", () => ({ default: () => <div>Precio</div> }));

import MobileFilters from "@/components/mobile-filters";

// The sheet waits for the live count query to settle before applying filters.
const renderWithQuery = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

const types = [
  { id: "t1", name: "Cuadernos", categories: [] },
  { id: "t2", name: "Escritura", categories: [] },
];

describe("MobileFilters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.filters = { ...EMPTY_FILTERS };
    mocks.count.mockReturnValue({ data: 128, isFetching: false });
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.HTMLElement.prototype.setPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
  });
  afterEach(cleanup);

  it("keeps changes pending until the count button applies them", async () => {
    const user = userEvent.setup();
    renderWithQuery(<MobileFilters types={types} categories={[]} catalogOptions={[]} colors={[]} designs={[]} />);

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    const dialog = await screen.findByRole("dialog", { name: "Filtros de productos" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Categorías")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();

    await user.click(screen.getByLabelText("Escritura"));
    expect(mocks.setFilters).not.toHaveBeenCalled();
    expect(mocks.count).toHaveBeenLastCalledWith(expect.objectContaining({ typeId: ["t2"] }), undefined, true);

    await user.click(screen.getByRole("button", { name: "Ver 128 productos" }));
    await waitFor(() => expect(mocks.setFilters).toHaveBeenCalledWith(expect.objectContaining({ typeId: ["t2"], page: 1 })));
  });

  it("shows the applied count on the trigger and disables apply when nothing matches", async () => {
    const user = userEvent.setup();
    mocks.filters = { ...EMPTY_FILTERS, typeId: ["t1"], isOnSale: true };
    mocks.count.mockReturnValue({ data: 0, isFetching: false });
    renderWithQuery(<MobileFilters types={types} categories={[]} catalogOptions={[]} colors={[]} designs={[]} />);

    expect(screen.getByRole("button", { name: "Filtros" })).toHaveTextContent("2");
    await user.click(screen.getByRole("button", { name: "Filtros" }));
    expect(await screen.findByRole("button", { name: "Sin productos con estos filtros" })).toBeDisabled();
  });
});
