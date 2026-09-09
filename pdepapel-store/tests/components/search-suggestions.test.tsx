// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  track: vi.fn(),
  search: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/customer-analytics", () => ({ trackCustomerEvent: mocks.track }));
vi.mock("@/hooks/use-search-products", () => ({
  default: (term: string) => {
    mocks.search(term);
    return term
      ? { status: "success", data: [{ id: "p1", slug: "cuaderno-snoopy", name: "Cuaderno Snoopy A5", price: 21000, image: { url: "", isMain: true, id: "i" } }] }
      : { status: "success", data: [] };
  },
}));
vi.mock("@/hooks/use-debounce", () => ({ useDebounce: (value: string) => value }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <img alt={alt} /> }));

import { SearchBar } from "@/components/search-bar";

const types = [
  { id: "t1", name: "📒 Cuadernos", slug: "cuadernos", label: "Cuadernos", categories: [], subcategories: [{ id: "c1", typeId: "t1", name: "Cuadernos argollados", slug: "cuadernos-argollados" }] },
  { id: "t2", name: "🖊️ Escritura", slug: "escritura", label: "Escritura", categories: [], subcategories: [] },
];

describe("SearchBar suggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });
  afterEach(cleanup);

  it("offers recent searches and type shortcuts on focus, and forgets a recent", () => {
    window.localStorage.setItem("pdp:busquedas-recientes", JSON.stringify(["snoopy"]));
    render(<SearchBar types={types} />);
    const input = screen.getByRole("combobox", { name: "Buscar productos" });

    fireEvent.focus(input);
    expect(screen.getByText("Recientes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "snoopy" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cuadernos" })).toHaveAttribute("href", "/tienda?typeId=t1");
    expect(screen.getByRole("link", { name: "Ofertas" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Olvidar búsqueda snoopy" }));
    expect(screen.queryByText("Recientes")).not.toBeInTheDocument();
  });

  it("lists matching categories before products and links to the full results", () => {
    render(<SearchBar types={types} />);
    const input = screen.getByRole("combobox", { name: "Buscar productos" });
    fireEvent.change(input, { target: { value: "cuad" } });

    expect(screen.getByRole("link", { name: /Cuadernos argollados/ })).toHaveAttribute("href", "/categoria/cuadernos-argollados");
    expect(screen.getByRole("link", { name: /Cuaderno Snoopy A5/ })).toHaveAttribute("href", "/producto/cuaderno-snoopy");
    expect(screen.getByRole("link", { name: /Ver todos los resultados para «cuad»/ })).toHaveAttribute("href", "/tienda?search=cuad");
  });

  it("moves through the options with the keyboard and remembers submitted searches", () => {
    render(<SearchBar types={types} />);
    const input = screen.getByRole("combobox", { name: "Buscar productos" });
    fireEvent.change(input, { target: { value: "cuad" } });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mocks.push).toHaveBeenCalledWith("/producto/cuaderno-snoopy");

    fireEvent.change(input, { target: { value: "agenda" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(mocks.push).toHaveBeenCalledWith("/tienda?search=agenda");
    expect(JSON.parse(window.localStorage.getItem("pdp:busquedas-recientes") ?? "[]")).toEqual(["agenda"]);
  });
});
