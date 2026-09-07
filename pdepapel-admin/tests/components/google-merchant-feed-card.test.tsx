// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GoogleMerchantFeedCard } from "@/app/(dashboard)/[storeId]/(routes)/configuracion/components/google-merchant-feed-card";

const fetchMock = vi.fn();

const status = {
  configured: true,
  feedUrl: "https://admin.example.com/api/store-1/google-merchant/feed?token=abc",
  schedule: "Todos los días a las 8:00 a. m. (hora de Colombia)",
  report: {
    generatedAt: "2026-09-07T13:00:00.000Z",
    activeProducts: 120,
    exportedProducts: 120,
    outOfStock: 7,
    withoutIdentifier: 90,
    missingImages: [{ id: "SKU-1", productId: "product-1", name: "Cuaderno sin foto" }],
    rewrittenImages: [],
    groupsWithDuplicateVariants: ["group-1"],
  },
};

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

describe("GoogleMerchantFeedCard", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the protected feed URL, the last report and product fixes", async () => {
    fetchMock.mockImplementation(() => jsonResponse(status));

    render(<GoogleMerchantFeedCard storeId="store-1" />);

    expect(
      await screen.findByLabelText("URL del feed de Google Merchant"),
    ).toHaveValue(status.feedUrl);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/store-1/google-merchant/report",
      { cache: "no-store" },
    );
    expect(screen.getByText("Exportados").nextSibling).toHaveTextContent("120");
    expect(screen.getByText("Sin imagen").nextSibling).toHaveTextContent("1");
    expect(screen.getByRole("link", { name: /Cuaderno sin foto/ })).toHaveAttribute(
      "href",
      "/store-1/productos/product-1",
    );
    expect(screen.getByText(/1 grupo\(s\) se exportan/)).toBeInTheDocument();
    expect(screen.getByText(/Última generación:/)).toBeInTheDocument();
  });

  it("explains how to turn the feed on when the secret is missing", async () => {
    fetchMock.mockImplementation(() =>
      jsonResponse({ ...status, configured: false, feedUrl: null, report: null }),
    );

    render(<GoogleMerchantFeedCard storeId="store-1" />);

    expect(
      await screen.findByText(/El feed está apagado/),
    ).toBeInTheDocument();
    expect(screen.getByText("GOOGLE_MERCHANT_FEED_SECRET")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Regenerar feed ahora/ }),
    ).not.toBeInTheDocument();
  });

  it("regenerates the feed on demand through the owner-only endpoint", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? jsonResponse({
            report: { ...status.report, exportedProducts: 121 },
            cached: true,
          })
        : jsonResponse(status),
    );

    render(<GoogleMerchantFeedCard storeId="store-1" />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Regenerar feed ahora/ }),
    );

    await waitFor(() => {
      expect(screen.getByText("Exportados").nextSibling).toHaveTextContent("121");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/store-1/google-merchant/report",
      { method: "POST" },
    );
  });
});
