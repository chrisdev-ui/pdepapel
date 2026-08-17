/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import FeaturedProducts from "@/components/featured-products";
import { Season } from "@/types";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

describe("FeaturedProducts seasonal copy", () => {
  afterEach(cleanup);

  it("presents existing featured products as October favorites during spooky season", () => {
    render(<FeaturedProducts featureProducts={[]} season={Season.Spooky} />);

    expect(
      screen.getByRole("heading", { name: "Favoritos de octubre" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Selección de temporada")).toBeInTheDocument();
    expect(
      screen.getByText("Una selección especial para una temporada mágica."),
    ).toBeInTheDocument();
  });

  it("keeps the regular featured-products presentation outside spooky season", () => {
    render(<FeaturedProducts featureProducts={[]} />);

    expect(
      screen.getByRole("heading", { name: "Productos destacados" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Selección de temporada")).not.toBeInTheDocument();
  });

  it("presents existing featured products as Christmas favorites during Christmas season", () => {
    render(<FeaturedProducts featureProducts={[]} season={Season.Christmas} />);

    expect(
      screen.getByRole("heading", { name: "Favoritos de Navidad" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Selección de Navidad")).toBeInTheDocument();
    expect(
      screen.getByText("Ideas bonitas para regalar, crear y celebrar."),
    ).toBeInTheDocument();
  });
});
