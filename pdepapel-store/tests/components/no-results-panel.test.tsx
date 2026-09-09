// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NoResultsPanel } from "@/components/ui/no-results";

const suggestions = [
  { label: "Cuadernos", href: "/categoria/cuadernos" },
  { label: "Stickers", href: "/categoria/stickers" },
];

describe("NoResultsPanel", () => {
  afterEach(cleanup);

  it("names the failed search and offers categories and the whole shop", () => {
    render(<NoResultsPanel variant="search" query="zzzq" suggestions={suggestions} />);
    expect(screen.getByRole("heading", { name: "No encontramos «zzzq»" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Stickers" })).toHaveAttribute("href", "/categoria/stickers");
    expect(screen.getByRole("link", { name: "Ver toda la tienda" })).toHaveAttribute("href", "/tienda");
  });

  it("leads with clearing filters when filters caused the empty result", () => {
    const onClearFilters = vi.fn();
    render(<NoResultsPanel variant="filters" suggestions={suggestions} onClearFilters={onClearFilters} />);
    expect(screen.getByRole("heading", { name: "Nada con estos filtros" })).toBeInTheDocument();
    screen.getByRole("button", { name: "Limpiar filtros" }).click();
    expect(onClearFilters).toHaveBeenCalled();
  });

  it("renders the error state as an alert with a retry", () => {
    const onRetry = vi.fn();
    render(<NoResultsPanel variant="error" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar los productos");
    screen.getByRole("button", { name: "Intentar de nuevo" }).click();
    expect(onRetry).toHaveBeenCalled();
  });
});
