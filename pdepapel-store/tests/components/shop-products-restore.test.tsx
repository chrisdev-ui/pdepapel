/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Product } from "@/types";

const mocks = vi.hoisted(() => ({ back: false, saved: null as null | { visible: number; lastPage: number; scrollY: number } }));

vi.mock("@/lib/listing-restore", () => ({
  consumeBackNavigation: () => mocks.back,
  readListingState: () => mocks.saved,
  saveListingState: vi.fn(),
}));
vi.mock("@/components/ui/product-card", () => ({
  default: ({ product }: { product: Product }) => <article data-testid="card">{product.name}</article>,
}));
vi.mock("@/app/(routes)/tienda/components/paginator", () => ({ default: () => null }));

import Products from "@/app/(routes)/tienda/components/products";

const page = (n = 24): Product[] =>
  Array.from({ length: n }, (_, index) => ({ id: `p-${index}`, name: `p ${index}` }) as unknown as Product);

describe("Volver al listado con «Atrás»", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    mocks.back = false;
    mocks.saved = { visible: 24, lastPage: 1, scrollY: 1200 };
  });
  afterEach(cleanup);

  it("vuelve con las mismas tarjetas y a la misma altura", () => {
    mocks.back = true;
    render(<Products products={page()} totalPages={1} currentPage={1} />);

    expect(screen.getAllByTestId("card")).toHaveLength(24);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 1200);
  });

  it("una visita nueva al mismo listado empieza por arriba", () => {
    render(<Products products={page()} totalPages={1} currentPage={1} />);

    expect(screen.getAllByTestId("card")).toHaveLength(12);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
