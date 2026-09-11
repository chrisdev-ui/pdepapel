// @vitest-environment jsdom

import { ListingTable } from "@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/listings/listing-table";
import type { Listing, ListingBusyState } from "@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/listings/listing-types";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";


const busy: ListingBusyState = {
  publishingId: null,
  deletingDraftId: null,
  reviewingContentId: null,
  syncingContentId: null,
  loadingQualityId: null,
  changingStatusId: null,
  updatingVideoReminderId: null,
};

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "l1",
    categoryId: "MCO1",
    listingType: "gold_special",
    marketplacePrice: 55000,
    stockSafetyBuffer: 1,
    syncStock: true,
    syncPrice: false,
    minimumMarginAmount: null,
    status: "ACTIVE",
    externalPermalink: "https://articulo.mercadolibre.com.co/x",
    externalItemId: "MCO412585",
    lastSyncedStock: 4,
    lastError: null,
    metadata: { attributes: [], media: { imageUrls: ["a", "b", "c"] }, saleConditions: { shippingMode: "me2", freeShipping: true, localPickUp: false, packageDimensions: null } },
    product: { id: "p1", name: "Alcancía de gato", sku: "ALC-GAT-01", stock: 5, price: 40000, acqPrice: 20000, transportationCost: 1000, images: [{ url: "a" }], category: { id: "c", name: "Alcancías" } },
    ...overrides,
  };
}

function renderTable(props: Partial<React.ComponentProps<typeof ListingTable>> = {}) {
  const handlers = {
    onEdit: vi.fn(),
    onPublish: vi.fn(),
    onDeleteDraft: vi.fn(),
    onReviewContent: vi.fn(),
    onSyncContent: vi.fn(),
    onReviewQuality: vi.fn(),
    onPause: vi.fn(),
    onActivate: vi.fn(),
  };
  const onRunBulkAction = vi.fn();
  render(
    <ListingTable
      listings={[listing(), listing({ id: "l2", externalItemId: null, status: "DRAFT", externalPermalink: null, metadata: { attributes: [], publicationError: { kind: "review", step: "ficha", field: "BRAND", message: "Falta la marca", at: "2026-09-11T00:00:00.000Z" } }, product: { ...listing().product, id: "p2", name: "Termo Owala", sku: "TER-01" } })]}
      isLoading={false}
      error={null}
      onRetry={() => undefined}
      rowSelection={{}}
      onRowSelectionChange={() => undefined}
      highlightedListingId={null}
      busy={busy}
      bulkOutcome={{ action: "sync_stock", at: "", queued: 1, skipped: 1, byListingId: { l2: { outcome: "skipped", reason: "Primero debes publicar este borrador." } } }}
      isRunningBulkAction={false}
      onRunBulkAction={onRunBulkAction}
      handlers={handlers}
      {...props}
    />,
  );
  return { handlers, onRunBulkAction };
}

describe("ListingTable", () => {
  afterEach(() => cleanup());

  it("shows the signals a row used to hide and the per-row bulk outcome", () => {
    renderTable();
    const rows = screen.getAllByRole("row");
    const live = rows.find((row) => within(row).queryByText("Alcancía de gato"))!;
    expect(within(live).getByText("Activa")).toBeInTheDocument();
    expect(within(live).getByText("Stock desde el panel")).toBeInTheDocument();
    expect(within(live).getByText("Precio manual en Mercado Libre")).toBeInTheDocument();
    expect(within(live).getByText("3 fotos")).toBeInTheDocument();
    expect(within(live).getByText("Envío gratis")).toBeInTheDocument();
    expect(within(live).getByText("4 para publicar")).toBeInTheDocument();
    expect(within(live).getByText(/Alcancías/)).toBeInTheDocument();

    const draft = rows.find((row) => within(row).queryByText("Termo Owala"))!;
    expect(within(draft).getByText("Rechazada: ficha técnica · BRAND")).toBeInTheDocument();
    expect(within(draft).getByText("Primero debes publicar este borrador.")).toBeInTheDocument();
  });

  it("wires the visible and menu actions to the handlers", () => {
    const { handlers } = renderTable();
    const rows = screen.getAllByRole("row");
    const draft = rows.find((row) => within(row).queryByText("Termo Owala"))!;
    fireEvent.click(within(draft).getByRole("button", { name: "Publicar" }));
    expect(handlers.onPublish).toHaveBeenCalledWith(expect.objectContaining({ id: "l2" }));
    fireEvent.click(within(draft).getByRole("button", { name: "Editar" }));
    expect(handlers.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "l2" }));

    const live = rows.find((row) => within(row).queryByText("Alcancía de gato"))!;
    expect(within(live).queryByRole("button", { name: "Publicar" })).not.toBeInTheDocument();
    expect(within(live).getByRole("button", { name: "Más acciones para Alcancía de gato" })).toBeInTheDocument();
  });

  it("stops a bulk run above the 20-listing cap before it reaches the API", () => {
    const many = Array.from({ length: 21 }, (_, i) => listing({ id: `m${i}`, product: { ...listing().product, id: `p${i}`, name: `Producto ${i}` } }));
    const { onRunBulkAction } = renderTable({
      listings: many,
      rowSelection: Object.fromEntries(many.map((item) => [item.id, true])),
    });
    expect(screen.getByText(/Máximo 20 a la vez; quita 1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aplicar de forma segura" })).toBeDisabled();
    expect(onRunBulkAction).not.toHaveBeenCalled();
  });
});
