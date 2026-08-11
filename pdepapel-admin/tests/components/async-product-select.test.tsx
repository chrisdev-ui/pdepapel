// @vitest-environment jsdom

import { AsyncProductSelect } from "@/components/ui/async-product-select";
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

const { selectedProduct } = vi.hoisted(() => ({
  selectedProduct: {
    id: "product-1",
    name: "Set de marcadores kawaii edición especial con estuche coleccionable",
    sku: "SKU-MARCADOR-KAWAII-EDICION-ESPECIAL-COLECCIONABLE-2026",
    gtin: "77012345678901234567890",
    stock: 12,
    price: 38500,
    category: { name: "Marcadores y resaltadores" },
    images: [],
  },
}));

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <img alt={props.alt} />,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
}));

vi.mock("swr", () => ({
  default: () => ({ data: selectedProduct }),
}));

vi.mock("swr/infinite", () => ({
  default: () => ({
    data: [{ data: [], metadata: { hasMore: false } }],
    size: 1,
    setSize: vi.fn(),
    isLoading: false,
    isValidating: false,
  }),
}));

vi.mock("@/hooks/use-debounce", () => ({
  useDebounce: (value: string) => value,
}));

beforeAll(() => {
  class IntersectionObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  globalThis.IntersectionObserver =
    IntersectionObserverMock as unknown as typeof IntersectionObserver;
});

describe("AsyncProductSelect", () => {
  it("keeps a selected product with long identifiers within its trigger", () => {
    render(
      <div className="w-80">
        <AsyncProductSelect
          value={selectedProduct.id}
          onChange={() => undefined}
          modal
        />
      </div>,
    );

    const trigger = screen.getByRole("combobox");
    const productName = screen.getByText(selectedProduct.name);
    const details = screen.getByText(/GTIN: 77012345678901234567890/);

    expect(trigger).toHaveClass("min-w-0");
    expect(productName).toHaveClass("truncate");
    expect(productName.parentElement).toHaveClass("min-w-0", "flex-1");
    expect(productName.parentElement?.parentElement).toHaveClass(
      "min-w-0",
      "flex-1",
    );
    expect(details).toHaveClass("truncate");
    expect(details).toHaveAttribute(
      "title",
      expect.stringContaining(selectedProduct.sku),
    );
  });
});
