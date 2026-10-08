// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  // La búsqueda de productos trae una sola foto por fila.
  scanned: { id: "p-azul", name: "Agendas Flores Azul", sku: "AGE-AZU", stock: 1, price: 45000, acqPrice: 26000, transportationCost: 0, images: [{ url: "https://res.cloudinary.com/demo/image/upload/a.jpg" }] },
}));

vi.mock("@/components/ui/async-product-select", () => ({ AsyncProductSelect: () => null }));
vi.mock("@/components/ui/product-scan-button", () => ({
  ProductScanButton: ({ onFound, label }: { onFound: (p: unknown) => void; label?: string }) => (
    <button type="button" onClick={() => onFound(mocks.scanned)}>
      {label ?? "Escanear"}
    </button>
  ),
}));
vi.mock("@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/product-video-library", () => ({ ProductVideoLibrary: () => null }));
vi.mock("@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/use-picture-checks", () => ({
  usePictureChecks: (urls: readonly string[]) => Object.fromEntries(urls.map((url) => [url, { width: 1200, height: 1200 }])),
}));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <img alt={props.alt} /> }));

import { MercadoLibreListingManager } from "@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/listing-manager";

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Mercado Libre · elegir el producto en el asistente", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/listings/product-photos?productId=p-azul")) {
        return jsonResponse({
          productId: "p-azul",
          isKit: false,
          brand: null,
          productGroupName: "Bitácora-Agenda William Morris",
          images: [
            { url: "https://res.cloudinary.com/demo/image/upload/a.jpg", isMain: true },
            { url: "https://res.cloudinary.com/demo/image/upload/b.jpg", isMain: false },
            { url: "https://res.cloudinary.com/demo/image/upload/c.jpg", isMain: false },
          ],
        });
      }
      if (url.endsWith("/listings")) return jsonResponse([]);
      if (url.endsWith("/templates") || url.endsWith("/profiles")) return jsonResponse([]);
      return jsonResponse({ error: `sin ruta simulada: ${url}` }, 404);
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads every photo of the product and proposes the group name as the family", async () => {
    render(<MercadoLibreListingManager storeId="store-1" canPublish />);
    fireEvent.click(await screen.findByRole("button", { name: "Preparar publicación" }));
    fireEvent.click(await screen.findByRole("button", { name: "Escanear producto local" }));

    await waitFor(() =>
      expect(screen.getByLabelText(/Nombre de familia en Mercado Libre/)).toHaveValue("Bitácora-Agenda William Morris"),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/store-1/marketplaces/mercadolibre/listings/product-photos?productId=p-azul");
  });

  // Nunca el precio de la tienda tal cual: con costo 26.000 y la misma ganancia que en la tienda (19.000).
  it("defaults the Mercado Libre price to the estimated suggestion, not the store price", async () => {
    render(<MercadoLibreListingManager storeId="store-1" canPublish />);
    fireEvent.click(await screen.findByRole("button", { name: "Preparar publicación" }));
    fireEvent.click(await screen.findByRole("button", { name: "Escanear producto local" }));
    await waitFor(() => expect((screen.getByLabelText(/Precio de venta en Mercado Libre/) as HTMLInputElement).value).toContain("64.900"));
  });
});
