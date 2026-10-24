// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LowMarginView } from "@/app/(dashboard)/[storeId]/(routes)/productos/margen-bajo/components/low-margin-view";
import type { LowMarginPage } from "@/lib/low-margin-list";
import { classifyLowMargin } from "@/lib/pricing/low-margin";

afterEach(cleanup);

const offerRow = classifyLowMargin({ id: "p1", name: "Cartuchera", categoryName: "Cartucheras", price: 8_000, effectivePrice: 5_000, offerLabel: "Feria", cost: 6_000, isKit: false }, 40);
const boldRow = classifyLowMargin({ id: "p2", name: "Sticker", categoryName: null, price: 10_000, effectivePrice: 10_000, offerLabel: null, cost: 6_000, isKit: false }, 40);

const page = (overrides: Partial<LowMarginPage>): LowMarginPage => ({
  minimoPct: 40,
  evaluados: 10,
  sinCosto: 2,
  counts: { "oferta-bajo-costo": 1, "bajo-costo": 0, "bajo-minimo": 3, "solo-bold": 7, kits: 1 },
  section: "oferta-bajo-costo",
  total: 1,
  page: 1,
  pageCount: 1,
  pageSize: 50,
  rows: [offerRow],
  ...overrides,
});

describe("«Margen bajo»", () => {
  it("guía sin cambios de precio, secciones con conteo y «solo por Bold» plegado con el fijo de Bold", () => {
    render(<LowMarginView storeId="s" data={page({})} />);
    expect(screen.getByText("Esto es solo una guía: ningún precio se cambia solo.")).toBeTruthy();
    expect(screen.getByText(/2 productos no tienen costo/)).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Secciones de margen bajo" });
    expect(within(nav).getByRole("link", { name: "Ofertas que venden bajo el costo (1)" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Bajo 40 % antes de Bold (3)" }).getAttribute("href")).toBe("/s/productos/margen-bajo?seccion=bajo-minimo");
    expect(within(nav).queryByRole("link", { name: /solo por Bold/ })).toBeNull();

    const folded = screen.getByText("Bajo 40 % solo por Bold (7)").closest("details")!;
    expect(folded.open).toBe(false);
    expect(folded.textContent).toContain("$1.071");
    expect(within(folded).getByRole("link", { name: "Ver la lista (7)" }).getAttribute("href")).toBe("/s/productos/margen-bajo?seccion=solo-bold");
  });

  it("la fila con oferta: precio de hoy, el normal tachado con la etiqueta y enlace a la ficha", () => {
    render(<LowMarginView storeId="s" data={page({})} />);
    const row = screen.getAllByRole("row").find((element) => element.textContent?.includes("Cartuchera"))!;
    expect(row.textContent).toContain("$5.000");
    expect(row.querySelector("s")?.textContent).toBe("$8.000");
    expect(row.textContent).toContain("Feria");
    expect(within(row).getByRole("link", { name: "Cartuchera" }).getAttribute("href")).toBe("/s/productos/p1");
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Producto", "Precio", "Costo", "Margen", "Con Bold (1 unidad)", "Para 40 %"]);
  });

  it("en «solo por Bold» la columna del mínimo es la de Bold en una sola unidad y la sección aparece en la barra", () => {
    render(<LowMarginView storeId="s" data={page({ section: "solo-bold", total: 7, rows: [boldRow] })} />);
    expect(screen.getByRole("heading", { level: 2, name: "Bajo 40 % solo por Bold (7)" })).toBeTruthy();
    expect(screen.getAllByText("Para 40 % con Bold (1 unidad)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$12.900").length).toBeGreaterThan(0);
    const nav = screen.getByRole("navigation", { name: "Secciones de margen bajo" });
    expect(within(nav).getByRole("link", { name: "Bajo 40 % solo por Bold (7)" }).getAttribute("aria-current")).toBe("page");
    expect(document.querySelector("details")).toBeNull();
  });

  it("sin mínimo en Configuración: solo bajo el costo y kits, sin columna de mínimo", () => {
    render(<LowMarginView storeId="s" data={page({ minimoPct: null })} />);
    expect(screen.getByText(/No tienes un margen mínimo en Configuración/)).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Secciones de margen bajo" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Ofertas que venden bajo el costo (1)", "Bajo el costo (0)", "Kits (1)"]);
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).not.toContain("Para 40 %");
  });

  it("varias páginas: Anterior y Siguiente conservan la sección", () => {
    render(<LowMarginView storeId="s" data={page({ section: "bajo-minimo", page: 2, pageCount: 3, total: 120 })} />);
    const pages = screen.getByRole("navigation", { name: "Páginas" });
    expect(within(pages).getByRole("link", { name: "Anterior" }).getAttribute("href")).toBe("/s/productos/margen-bajo?seccion=bajo-minimo");
    expect(within(pages).getByRole("link", { name: "Siguiente" }).getAttribute("href")).toBe("/s/productos/margen-bajo?seccion=bajo-minimo&pagina=3");
    expect(pages.textContent).toContain("Página 2 de 3");
  });
});
