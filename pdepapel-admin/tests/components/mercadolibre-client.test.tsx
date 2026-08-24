// @vitest-environment jsdom

import MercadoLibreClient from "@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-id" }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/mercadolibre-logo", () => ({
  MercadoLibreLogo: () => <span>Mercado Libre</span>,
}));

vi.mock(
  "@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/historical-sales",
  () => ({
    MercadoLibreHistoricalSales: () => null,
  }),
);

vi.mock(
  "@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/cashflow-summary",
  () => ({
    MercadoLibreCashflowSummary: () => null,
  }),
);

vi.mock(
  "@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/listing-manager",
  () => ({
    MercadoLibreListingManager: () => null,
  }),
);

vi.mock(
  "@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/operations-center",
  () => ({
    MercadoLibreOperationsCenter: () => null,
  }),
);

vi.mock(
  "@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/product-ads-overview",
  () => ({
    MercadoLibreProductAdsOverview: () => null,
  }),
);

const connection = {
  sellerId: "seller-id",
  siteId: "MCO",
  status: "CONNECTED" as const,
  lastSyncedAt: new Date("2026-08-24T12:00:00.000Z"),
  lastError: null,
  recoveryScheduleId: "schedule-id",
  updatedAt: new Date("2026-08-24T12:00:00.000Z"),
};

describe("MercadoLibreClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows and safely refreshes the active 15-minute recovery schedule", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MercadoLibreClient
        configuration={{ configured: true, missing: [] }}
        queueConfiguration={{ configured: true, missing: [] }}
        connection={connection}
      />,
    );

    expect(
      screen.getByText(
        /La recuperación automática está activa cada 15 minutos/i,
      ),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Actualizar programación" }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/store-id/marketplaces/mercadolibre/queue",
        { method: "POST" },
      ),
    );
    expect(
      screen.getByText(/La programación quedó actualizada/i),
    ).toBeVisible();
  });
});
