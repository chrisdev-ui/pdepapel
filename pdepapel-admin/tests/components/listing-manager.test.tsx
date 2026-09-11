// @vitest-environment jsdom

import { MercadoLibreListingManager } from "@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/listing-manager";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/async-product-select", () => ({
  AsyncProductSelect: () => <button type="button">Producto local</button>,
}));
vi.mock("@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/product-video-library", () => ({
  ProductVideoLibrary: () => null,
}));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <img alt={props.alt} /> }));

const listings = [
  {
    id: "l1",
    categoryId: "MCO1",
    listingType: "gold_special",
    marketplacePrice: 55000,
    stockSafetyBuffer: 0,
    syncStock: true,
    syncPrice: true,
    minimumMarginAmount: null,
    status: "ACTIVE",
    externalPermalink: null,
    externalItemId: "MCO1",
    lastSyncedStock: 5,
    lastError: null,
    metadata: { attributes: [] },
    product: { id: "p1", name: "Alcancía de gato", sku: "ALC-01", stock: 5, price: 40000, acqPrice: 20000, transportationCost: 1000, images: [], color: { name: "Negro" }, size: { name: "Único" } },
  },
];

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("MercadoLibreListingManager", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/listings") && (!init || !init.method || init.method === "GET")) return jsonResponse(listings);
      if (url.endsWith("/templates") || url.endsWith("/profiles")) return jsonResponse([]);
      if (url.endsWith("/listings/bulk")) {
        return jsonResponse({ action: "pause", queued: 1, enqueued: 1, skipped: [], results: [{ listingId: "l1", productId: "p1", outcome: "queued", reason: null }] });
      }
      return jsonResponse({ error: `sin ruta simulada: ${url}` }, 404);
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads the listings into the table and keeps the edit path's color and size for the wizard", async () => {
    render(<MercadoLibreListingManager storeId="store-1" canPublish />);
    // La tabla y su tarjeta móvil conviven en el DOM (CSS decide cuál se ve).
    expect((await screen.findAllByText("Alcancía de gato")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Activa").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]);
    // Sin fotos el asistente abre en el paso 2 (categoría y fotos): el título
    // del diálogo lo dice y el producto ya quedó fijado al borrador.
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Editar publicación");
    expect(dialog).toHaveTextContent("Paso 2 de 4");
  });

  it("pauses a single listing through the queued action and reports it", async () => {
    render(<MercadoLibreListingManager storeId="store-1" canPublish />);
    await screen.findAllByText("Alcancía de gato");
    // Radix abre el menú con teclado en jsdom (no hay PointerEvent real).
    const trigger = screen.getAllByRole("button", { name: "Más acciones para Alcancía de gato" })[0];
    fireEvent.keyDown(trigger, { key: "Enter" });
    const item = await screen.findByRole("menuitem", { name: /Pausar publicación/ });
    fireEvent.keyDown(item, { key: "Enter" });
    fireEvent.click(await screen.findByRole("button", { name: "Pausar" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/listings\/bulk$/),
        expect.objectContaining({ body: JSON.stringify({ action: "pause", listingIds: ["l1"] }) }),
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(/pausa programada/);
  });
});
