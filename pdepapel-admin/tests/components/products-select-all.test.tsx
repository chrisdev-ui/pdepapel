// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ post: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }),
  usePathname: () => "/store-1/productos",
  useSearchParams: () => new URLSearchParams("q=lapicero&pagina=2"),
}));
vi.mock("axios", async () => {
  const actual = await vi.importActual<typeof import("axios")>("axios");
  return { ...actual, default: { ...actual.default, post: mocks.post, isAxiosError: actual.default.isAxiosError } };
});
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/modals/product-batch-import-modal", () => ({ ProductBatchImportModal: () => null }));
vi.mock("@/components/ui/product-scan-button", () => ({ ProductScanButton: () => null }));
vi.mock("@/components/shell/viewer-access", () => ({ useCanWrite: () => true }));

import { AxiosError, AxiosHeaders } from "axios";

import ProductClient from "@/app/(dashboard)/[storeId]/(routes)/productos/components/client";
import { parseProductListQuery } from "@/lib/product-list-query";
import { PRODUCT_VIEWS } from "@/lib/product-readiness";

const zero = Object.fromEntries(PRODUCT_VIEWS.map((view) => [view.id, 0])) as Record<(typeof PRODUCT_VIEWS)[number]["id"], number>;
const product = (i: number) => ({
  id: `p-${i}`,
  name: `Lapicero ${i}`,
  sku: `LAP-${i}`,
  slug: `lapicero-${i}`,
  price: 2000,
  discountedPrice: 2000,
  hasDiscount: false,
  offerLabel: undefined,
  stock: 5,
  reservedUnits: 0,
  isArchived: false,
  isFeatured: false,
  isKit: false,
  availableAt: null,
  gtin: null,
  hasNoProductIdentifier: true,
  acqPrice: 1000,
  transportationCost: null,
  categoryId: "c",
  category: { id: "c", name: "Lápices" },
  size: null,
  design: null,
  color: null,
  productGroupId: null,
  productGroup: null,
  brandId: null,
  brandRef: null,
  images: [],
  kitComponents: [],
  brokenImages: 0,
  _count: { images: 0, kitComponents: 0 },
  createdAt: new Date("2026-10-01T00:00:00Z"),
});

const summary = (count: number) => ({
  count,
  withBrand: 0,
  groups: 0,
  actions: {
    archive: { eligible: count - 2, skipped: [{ reason: "Ya está archivado", count: 2 }] },
    restore: { eligible: 2, skipped: [] },
    feature: { eligible: count, skipped: [] },
    unfeature: { eligible: 0, skipped: [] },
    "mark-no-identifier": { eligible: 0, skipped: [] },
    "unmark-no-identifier": { eligible: count, skipped: [] },
    "coming-soon": { eligible: count, skipped: [] },
    "available-now": { eligible: 0, skipped: [] },
  },
});

function renderList(total: number, rows = 2) {
  const query = parseProductListQuery(new URLSearchParams("q=lapicero&pagina=2"));
  render(
    <ProductClient
      data={Array.from({ length: rows }, (_, i) => product(i)) as never}
      list={{ counts: zero, summary: zero, total, page: 2, pageCount: 2, pageSize: 25, facets: { shape: [], brand: [], category: [], group: [] }, query, attributeName: null }}
      suppliers={[]}
      taxonomies={{ categories: [], sizes: [], colors: [], designs: [] }}
      lowStockThreshold={null}
    />,
  );
}

const selectFirstRow = () => fireEvent.click(screen.getAllByRole("checkbox", { name: "Seleccionar fila" })[0]);
const bar = () => screen.getByRole("region", { name: /seleccionad/ });

beforeEach(() => {
  mocks.post.mockReset();
  mocks.refresh.mockReset();
});
afterEach(cleanup);

describe("Productos · seleccionar los N de este filtro", () => {
  it("no se ofrece cuando toda la lista cabe en la página", () => {
    renderList(2);
    selectFirstRow();
    expect(within(bar()).queryByRole("button", { name: /de este filtro/ })).toBeNull();
  });

  it("al activarlo cuenta en el servidor con la consulta de la lista, sin la página", async () => {
    mocks.post.mockResolvedValueOnce({ data: summary(30) });
    renderList(30);
    selectFirstRow();
    fireEvent.click(within(bar()).getByRole("button", { name: "Seleccionar los 30 de este filtro" }));
    expect(mocks.post).toHaveBeenCalledWith("/api/store-1/products/selection", { query: "q=lapicero", intent: "summary" });
    await screen.findByText("30 seleccionados en este filtro");
    expect(within(bar()).getByRole("button", { name: "Archivar (28 de 30)" })).toBeInTheDocument();
    fireEvent.click(within(bar()).getByRole("button", { name: "Solo esta página" }));
    expect(within(bar()).getByText("1 seleccionado")).toBeInTheDocument();
  });

  it("archivar todo el filtro pide confirmar con el número en el botón y manda la consulta, no los ids", async () => {
    mocks.post.mockImplementation(async (url: string, body: Record<string, unknown>) => {
      if (url.endsWith("/selection")) return { data: summary(30) };
      if (body.preview) return { data: { affected: 28, siblings: { total: 0, archived: 0 }, selection: { matching: 30, eligible: 28, skipped: [{ reason: "Ya está archivado", count: 2 }] } } };
      return { data: { message: "Se actualizaron 28 productos." } };
    });
    renderList(30);
    selectFirstRow();
    fireEvent.click(within(bar()).getByRole("button", { name: "Seleccionar los 30 de este filtro" }));
    fireEvent.click(await within(bar()).findByRole("button", { name: "Archivar (28 de 30)" }));
    const dialog = await screen.findByRole("alertdialog");
    await within(dialog).findByText("Se aplica a 28 productos de los 30 de este filtro.");
    expect(within(dialog).getByText("Se omiten 2 productos: ya está archivado.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Archivar 28 productos" }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenLastCalledWith("/api/store-1/products/bulk-update", {
        match: { query: "q=lapicero", expectedCount: 30 },
        expandGroups: false,
        field: "isArchived",
        value: true,
      }),
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("si la lista cambió entre confirmar y aplicar, el diálogo queda abierto con el número nuevo", async () => {
    let count = 30;
    mocks.post.mockImplementation(async (url: string, body: Record<string, unknown>) => {
      if (url.endsWith("/selection")) return { data: summary(count) };
      if (body.preview) return { data: { affected: count, siblings: { total: 0, archived: 0 }, selection: { matching: count, eligible: count, skipped: [] } } };
      count = 31;
      throw new AxiosError("409", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 409,
        statusText: "Conflict",
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { error: "La lista cambió: ahora son 31 productos, no 30.", details: { code: "SELECTION_CHANGED", count: 31 } },
      });
    });
    renderList(30);
    selectFirstRow();
    fireEvent.click(within(bar()).getByRole("button", { name: "Seleccionar los 30 de este filtro" }));
    fireEvent.click(await within(bar()).findByRole("button", { name: "Destacar" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(await within(dialog).findByRole("button", { name: "Destacar 30 productos" }));
    await within(dialog).findByRole("button", { name: "Destacar 31 productos" });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("«Asignar marca» a todo el filtro manda la consulta y el número confirmado", async () => {
    mocks.post.mockImplementation(async (url: string, body: Record<string, unknown>) => {
      if (url.endsWith("/selection")) return { data: summary(30) };
      if (body.preview) return { data: { requested: 30, withOtherBrand: [], extraVariants: 0, groups: 0, matching: 30 } };
      return { data: { updatedProducts: 30 } };
    });
    render(<div />);
    cleanup();
    const query = parseProductListQuery(new URLSearchParams("q=lapicero&pagina=2"));
    render(
      <ProductClient
        data={[product(0), product(1)] as never}
        list={{ counts: zero, summary: zero, total: 30, page: 2, pageCount: 2, pageSize: 25, facets: { shape: [], brand: [], category: [], group: [] }, query, attributeName: null }}
        suppliers={[]}
        taxonomies={{ categories: [], sizes: [], colors: [], designs: [] }}
        lowStockThreshold={null}
        brands={[{ id: "b-kiut", name: "Kiut", logoUrl: null, logoPermission: "UNKNOWN", aliases: [], isArchived: false, parentBrandId: null, parentName: null }]}
      />,
    );
    selectFirstRow();
    fireEvent.click(within(bar()).getByRole("button", { name: "Seleccionar los 30 de este filtro" }));
    fireEvent.click(await within(bar()).findByRole("button", { name: "Asignar marca" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Asignar marca a 30 productos/)).toBeInTheDocument();
  });
});
