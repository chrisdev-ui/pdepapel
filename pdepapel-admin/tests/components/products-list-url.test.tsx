// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: vi.fn() }),
  usePathname: () => "/store-1/productos",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/modals/product-batch-import-modal", () => ({ ProductBatchImportModal: () => null }));
vi.mock("@/components/ui/product-scan-button", () => ({ ProductScanButton: () => null }));
vi.mock("@/components/shell/viewer-access", () => ({ useCanWrite: () => true }));

import ProductClient from "@/app/(dashboard)/[storeId]/(routes)/productos/components/client";
import { parseProductListQuery } from "@/lib/product-list-query";
import { PRODUCT_VIEWS } from "@/lib/product-readiness";

const zero = Object.fromEntries(PRODUCT_VIEWS.map((view) => [view.id, 0])) as Record<(typeof PRODUCT_VIEWS)[number]["id"], number>;

function renderList(search = "") {
  return render(listElement(search));
}

function listElement(search: string) {
  nav.search = search;
  window.history.replaceState(null, "", `/store-1/productos${search ? `?${search}` : ""}`);
  const query = parseProductListQuery(new URLSearchParams(search));
  return (
    <ProductClient
      data={[]}
      list={{
        counts: { ...zero, activos: 30, todos: 40 },
        summary: { ...zero, activos: 30, todos: 40 },
        total: 30,
        page: query.page,
        pageCount: 2,
        pageSize: 25,
        facets: { shape: [], brand: [{ value: "__none__", label: "Sin marca", count: 12 }], category: [], group: [{ value: "g-1", label: "Hadas", count: 3 }] },
        query,
        attributeName: query.attribute ? "Rosa" : null,
      }}
      suppliers={[]}
      taxonomies={{ categories: [], sizes: [], colors: [], designs: [] }}
      lowStockThreshold={null}
    />
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  nav.push.mockReset();
  nav.replace.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Productos · la lista vive en la URL", () => {
  it("la búsqueda espera 350 ms sin escribir y reemplaza la entrada del historial una sola vez", () => {
    renderList("vista=agotados&pagina=2");
    const input = screen.getByPlaceholderText("Nombre, SKU, GTIN o grupo…");
    for (const value of ["l", "la", "lap", "lapiz"]) {
      fireEvent.change(input, { target: { value } });
      act(() => vi.advanceTimersByTime(100));
    }
    expect(nav.replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(350));
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith("/store-1/productos?vista=agotados&q=lapiz", { scroll: false });
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("pestaña y página dejan entrada en el historial para volver con Atrás", () => {
    renderList("q=kiut&pagina=2");
    fireEvent.click(screen.getByRole("tab", { name: /Agotados/ }));
    expect(nav.push).toHaveBeenLastCalledWith("/store-1/productos?q=kiut&vista=agotados", { scroll: false });
    cleanup();
    renderList("vista=agotados");
    fireEvent.click(screen.getAllByRole("button", { name: /siguiente/i })[0]);
    expect(nav.push).toHaveBeenLastCalledWith("/store-1/productos?vista=agotados&pagina=2", { scroll: false });
  });

  it("al volver con Atrás el buscador muestra la búsqueda de la URL, sin pisar lo que se está escribiendo", () => {
    const { rerender } = renderList("q=kiut");
    const input = () => screen.getByPlaceholderText("Nombre, SKU, GTIN o grupo…") as HTMLInputElement;
    expect(input().value).toBe("kiut");
    // Escribiendo: la URL alcanza a cambiar con lo de hace un momento y el buscador no se pisa.
    fireEvent.change(input(), { target: { value: "kiut rosa" } });
    rerender(listElement("q=kiut+ros"));
    expect(input().value).toBe("kiut rosa");
    // Atrás: la búsqueda de la URL vuelve al buscador.
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    rerender(listElement("q=norma"));
    expect(input().value).toBe("norma");
  });

  it("con un solo grupo en el filtro ofrece «Editar grupo seleccionado», y el atributo de Atributos se puede quitar", () => {
    renderList("grupo=g-1&color=col-1");
    expect(screen.getByText(/30 productos con color/)).toBeInTheDocument();
    expect(screen.getByText("«Rosa»")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quitar filtro" }));
    expect(nav.push).toHaveBeenLastCalledWith("/store-1/productos?grupo=g-1", { scroll: false });
  });
});
