// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MetaCatalogFeedCard } from "@/app/(dashboard)/[storeId]/(routes)/configuracion/components/meta-catalog-feed-card";

const fetchMock = vi.fn();

const report = {
  generatedAt: "2026-10-23T13:00:00.000Z",
  activeProducts: 900,
  exportedProducts: 890,
  outOfStock: 140,
  withoutIdentifier: 890,
  missingImages: [{ id: "STI-1", productId: "product-1", name: "Stickers sin foto" }],
  groupsWithDuplicateVariants: [],
};

function respond(body: unknown) {
  fetchMock.mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) }));
}

describe("MetaCatalogFeedCard", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("cuenta los productos sin categoría de Google y explica qué hacer", async () => {
    respond({
      configured: true,
      feedUrl: "https://admin.example.com/api/store-1/meta-catalog/feed?token=abc",
      report: { ...report, withoutGoogleCategory: [{ id: "X-1", productId: "p-2", name: "Nuevo" }, { id: "X-2", productId: "p-3", name: "Otro" }] },
    });
    render(<MetaCatalogFeedCard storeId="store-1" />);

    expect((await screen.findByText("Sin categoría de Google")).nextSibling).toHaveTextContent("2");
    expect(screen.getByText(/2 producto\(s\) salen sin categoría de Google/)).toBeInTheDocument();
    expect(screen.getByText(/quedan fuera del catálogo/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Stickers sin foto/ })).toHaveAttribute("href", "/store-1/productos/product-1");
  });

  it("un informe guardado antes del cambio, sin el campo, muestra 0 y no se rompe", async () => {
    respond({ configured: true, feedUrl: "https://admin.example.com/api/store-1/meta-catalog/feed?token=abc", report });
    render(<MetaCatalogFeedCard storeId="store-1" />);

    expect((await screen.findByText("Sin categoría de Google")).nextSibling).toHaveTextContent("0");
    expect(screen.queryByText(/salen sin categoría de Google/)).not.toBeInTheDocument();
  });
});
