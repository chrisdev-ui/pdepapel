// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scanned: { id: "p-scan", name: "Alcancía de gato", sku: "ALC-01", stock: 5, price: 40000, images: [] },
}));

vi.mock("@/components/ui/async-product-select", () => ({
  AsyncProductSelect: ({ value, ariaLabel }: { value: string; ariaLabel?: string }) => <output aria-label={ariaLabel}>{value}</output>,
}));
vi.mock("@/components/ui/product-scan-button", () => ({
  ProductScanButton: ({ onFound, label }: { onFound: (p: unknown) => void; label?: string }) => (
    <button type="button" onClick={() => onFound(mocks.scanned)}>
      {label ?? "Escanear"}
    </button>
  ),
}));
vi.mock("@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/product-video-library", () => ({ ProductVideoLibrary: () => null }));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <img alt={props.alt} /> }));

import { MercadoLibreListingManager } from "@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/listing-manager";

const preview = {
  listings: [
    {
      key: "MCO9-null",
      externalItemId: "MCO9",
      externalVariationId: null,
      title: "Alcancía de gato negra",
      status: "ACTIVE",
      statusNote: null,
      marketplacePrice: 55000,
      currencyId: "COP",
      catalogListing: false,
      sellerSku: null,
      availableQuantity: 3,
      existingListingId: null,
      linkedProduct: null,
      suggestedProduct: null,
      draftListingId: null,
      issue: null,
      warnings: [],
    },
  ],
  summary: { total: 1, alreadyLinked: 0, readyToImport: 0, needsReview: 1, unavailable: 0 },
  partial: false,
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Mercado Libre · gestor: en «Importar existentes», escanear elige el producto local de esa publicación y la marca para importar. */
describe("Mercado Libre · escanear producto local al importar", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/listings/import/preview")) return jsonResponse(preview);
      if (url.endsWith("/listings")) return jsonResponse([]);
      if (url.endsWith("/templates") || url.endsWith("/profiles")) return jsonResponse([]);
      return jsonResponse({ error: `sin ruta simulada: ${url}` }, 404);
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("selects the scanned product for the listing and ticks it for import", async () => {
    render(<MercadoLibreListingManager storeId="store-1" canPublish />);
    fireEvent.click(await screen.findByRole("button", { name: "Importar existentes" }));
    const picker = await screen.findByLabelText("Producto local para Alcancía de gato negra");
    expect(picker.textContent).toBe("");
    const checkbox = screen.getByRole("checkbox", { name: "Importar Alcancía de gato negra" });
    expect(checkbox).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Escanear producto local para Alcancía de gato negra" }));
    await waitFor(() => expect(screen.getByLabelText("Producto local para Alcancía de gato negra").textContent).toBe("p-scan"));
    expect(screen.getByRole("checkbox", { name: "Importar Alcancía de gato negra" })).toHaveAttribute("data-state", "checked");
  });
});
