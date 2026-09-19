// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AttributesClient, { filterByView, readAttributeQuery } from "@/app/(dashboard)/[storeId]/(routes)/atributos/components/client";
import { useTableStore } from "@/hooks/use-table-store";

// La URL es mutable entre renders para simular un clic en el menú lateral
// (`/atributos?tab=colores`) con la página ya abierta.
const navigation = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ storeId: "store-1" }),
  usePathname: () => "/store-1/atributos",
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const createdAt = new Date("2026-09-01T15:00:00.000Z");
const base = { createdAt, updatedAt: createdAt, isArchived: false, archivedAt: null as Date | null };
const types = [{ id: "t1", name: "Papelería", slug: "papeleria", icon: null, iconSvg: null, ...base, _count: { categories: 1 }, productsCount: 2, activeCategoriesCount: 1 }];
const categories = [{ id: "c1", name: "Agendas", slug: "agendas", typeId: "t1", seoEnabled: true, seoFeatured: false, ...base, type: { id: "t1", name: "Papelería" }, _count: { products: 2 } }];
const colors = [{ id: "k1", name: "Rosa", value: "#ffc0cb", ...base, _count: { products: 1 } }];
const designs = [{ id: "d1", name: "Osito", ...base, isArchived: true, archivedAt: createdAt, _count: { products: 0 } }];

function renderHub(overrides: Partial<Parameters<typeof AttributesClient>[0]> = {}) {
  return render(
    <AttributesClient types={types} categories={categories} sizes={[]} colors={colors} designs={designs} options={[]} {...overrides} />,
  );
}

const mainTabs = () => screen.getByRole("tablist", { name: "Clases de atributo" });
const selectedTab = () => within(mainTabs()).getAllByRole("tab").find((tab) => tab.getAttribute("aria-selected") === "true");

beforeEach(() => {
  navigation.search = "";
  useTableStore.setState({ tables: {} });
  window.history.replaceState(null, "", "/store-1/atributos");
});
afterEach(cleanup);

describe("readAttributeQuery / filterByView", () => {
  it("falls back to the first tab and the active view for unknown values", () => {
    expect(readAttributeQuery(new URLSearchParams(""))).toEqual({ tab: "categorias", view: "activos", typeId: null });
    expect(readAttributeQuery(new URLSearchParams("tab=colores&vista=archivados"))).toEqual({ tab: "colores", view: "archivados", typeId: null });
    expect(readAttributeQuery(new URLSearchParams("tab=otra&vista=x"))).toEqual({ tab: "categorias", view: "activos", typeId: null });
    expect(readAttributeQuery(new URLSearchParams("tab=subcategorias&categoria=t1"))).toMatchObject({ tab: "subcategorias", typeId: "t1" });
  });

  it("splits rows by archive state", () => {
    expect(filterByView(designs, "activos")).toEqual([]);
    expect(filterByView(designs, "archivados")).toHaveLength(1);
  });
});

describe("AttributesClient", () => {
  it("labels the tabs with «Subcategorías» and opens the tab the URL asks for", () => {
    navigation.search = "tab=subcategorias";
    renderHub();

    expect(within(mainTabs()).getByRole("tab", { name: /Subcategorías/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText(/Sub-Categor/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Agendas").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Nueva subcategoría/ })).toHaveAttribute("href", "/store-1/categorias/nuevo");
  });

  it("follows a later change of ?tab= (sidebar click while the page is open)", () => {
    const view = renderHub();
    expect(selectedTab()).toHaveTextContent("Categorías");

    navigation.search = "tab=colores";
    view.rerender(<AttributesClient types={types} categories={categories} sizes={[]} colors={colors} designs={designs} options={[]} />);
    expect(selectedTab()).toHaveTextContent("Colores");
    expect(screen.getAllByText("Rosa").length).toBeGreaterThan(0);

    navigation.search = "tab=disenos&vista=archivados";
    view.rerender(<AttributesClient types={types} categories={categories} sizes={[]} colors={colors} designs={designs} options={[]} />);
    expect(selectedTab()).toHaveTextContent("Diseños");
    expect(within(screen.getByRole("tablist", { name: "Estado de los atributos" })).getByRole("tab", { name: /Archivados/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("Osito").length).toBeGreaterThan(0);
  });

  it("switches tabs on click, writes the URL with replaceState and keeps the view", () => {
    navigation.search = "vista=archivados";
    renderHub();
    fireEvent.click(within(mainTabs()).getByRole("tab", { name: /Tamaños/ }));

    expect(selectedTab()).toHaveTextContent("Tamaños");
    expect(window.location.search).toBe("?vista=archivados&tab=tamanos");
    expect(screen.getByText("Nada archivado aquí")).toBeInTheDocument();

    fireEvent.click(within(mainTabs()).getByRole("tab", { name: /Categorías/ }));
    expect(window.location.search).toBe("?vista=archivados");
  });

  it("offers to create the first item from every empty active tab", () => {
    navigation.search = "tab=tamanos";
    renderHub();
    expect(screen.getByText("Aún no hay tamaños")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Crear el primer tamaño/ })).toHaveAttribute("href", "/store-1/tamanos/nuevo");

    navigation.search = "tab=subcategorias";
    cleanup();
    renderHub({ categories: [] });
    expect(screen.getByRole("link", { name: /Crear la primera subcategoría/ })).toHaveAttribute("href", "/store-1/categorias/nuevo");

    navigation.search = "";
    cleanup();
    renderHub({ types: [] });
    expect(screen.getByRole("link", { name: /Crear la primera categoría/ })).toHaveAttribute("href", "/store-1/tipos/nuevo");
  });

  it("shows cleanup hints, offers the review filter and «Unir con…» on a mergeable active row", () => {
    navigation.search = "tab=colores";
    renderHub({
      colors: [
        ...colors,
        { id: "k2", name: "Rosado", value: "#F472B6", ...base, _count: { products: 3 } },
        { id: "k3", name: "Morado", value: "#8E44AD ", ...base, _count: { products: 0 } },
      ],
    });
    // «Rosa» ~ «Rosado» (raíz), «Morado» sin productos y con espacio en el valor.
    expect(screen.getAllByText("Parecido a «Rosado»").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sin productos").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Valor con espacio al final").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Revisar/ })).toBeInTheDocument();

    // Radix abre el menú con el teclado en jsdom (el clic real llega por pointerdown).
    const trigger = screen.getAllByRole("button", { name: "Abrir menú de Rosa" })[0];
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByRole("menuitem", { name: /Unir con…/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Ver sus producto/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Eliminar · tiene 1 producto/ })).toHaveAttribute("aria-disabled", "true");
  });

  it("filters subcategories by the category the URL asks for and offers to see all", () => {
    navigation.search = "tab=subcategorias&categoria=t1";
    renderHub({ categories: [...categories, { ...categories[0], id: "c2", name: "Libretas", typeId: "t2", type: { id: "t2", name: "Oficina" } }] });
    expect(screen.getByRole("status")).toHaveTextContent("Subcategorías de «Papelería»");
    expect(screen.getAllByText("Agendas").length).toBeGreaterThan(0);
    expect(screen.queryByText("Libretas")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ver todas/ }));
    expect(screen.getAllByText("Libretas").length).toBeGreaterThan(0);
  });

  it("disables «Nuevo tamaño» once every dimension × weight combination exists", () => {
    navigation.search = "tab=tamanos";
    const all = ["XS-L", "XS-P", "S-L", "S-P", "M-L", "M-P", "L-L", "L-P", "XL-L", "XL-P"];
    renderHub({ sizes: all.map((value, index) => ({ id: `s${index}`, name: value, value, ...base, _count: { products: index } })) });
    expect(screen.getByRole("button", { name: /Nuevo tamaño/ })).toBeDisabled();
    expect(screen.getByText(/10 combinaciones/)).toBeInTheDocument();
    expect(screen.getAllByText("Pequeño").length).toBeGreaterThan(0);
  });

  it("offers a tab picker for small screens with the same tabs and counts", () => {
    renderHub();
    expect(screen.getByRole("combobox", { name: "Qué atributo ver" })).toHaveTextContent("Categorías");
  });
});
