// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerMocks = vi.hoisted(() => ({ push: vi.fn(), pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => routerMocks.pathname,
  useRouter: () => ({ push: routerMocks.push }),
}));
vi.mock("@clerk/nextjs", () => ({
  SignedIn: () => null,
  SignedOut: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img {...(props as Record<string, string>)} />
  ),
}));
vi.mock("@/lib/customer-analytics", () => ({ trackCustomerEvent: vi.fn() }));

import { CategoryChips } from "@/components/category-chips";
import { CategoryDrawer } from "@/components/category-drawer";
import { MegaMenu } from "@/components/mega-menu";
import { buildNavigationTypes } from "@/lib/catalog-navigation";
import type { Category, Type } from "@/types";

const types = buildNavigationTypes(
  [
    { id: "t-esc", name: "🖊️ Escritura", slug: "escritura", categories: [] },
    { id: "t-cua", name: "📒 Cuadernos", slug: "cuadernos", categories: [] },
    { id: "t-kit", name: "🎁 Kits", slug: "kits", categories: [] },
  ] as Type[],
  [
    { id: "c1", typeId: "t-esc", name: "Marcadores", slug: "marcadores" },
    { id: "c2", typeId: "t-esc", name: "Resaltadores", slug: "resaltadores" },
    { id: "c3", typeId: "t-cua", name: "Argollados", slug: "argollados" },
  ] as Category[],
);

describe("CategoryDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterEach(cleanup);

  it("opens from the menu button and lists emoji-free categories with their subcategories", async () => {
    render(<CategoryDrawer types={types} logoSrc="/logo.webp" />);

    fireEvent.click(screen.getByRole("button", { name: "Abrir menú de categorías" }));

    const drawer = await screen.findByRole("dialog");
    expect(drawer).toHaveTextContent("Escritura");
    expect(drawer).not.toHaveTextContent("🖊️");
    expect(screen.getByRole("link", { name: "Kits" })).toHaveAttribute(
      "href",
      "/tienda?typeId=t-kit",
    );

    fireEvent.click(screen.getByRole("button", { name: /Escritura/ }));

    expect(await screen.findByRole("link", { name: "Marcadores" })).toHaveAttribute(
      "href",
      "/categoria/marcadores",
    );
    expect(screen.getByRole("link", { name: /Ver todo Escritura/ })).toHaveAttribute(
      "href",
      "/tienda?typeId=t-esc",
    );
    expect(screen.getByRole("link", { name: "Ofertas" })).toHaveAttribute(
      "href",
      "/tienda?isOnSale=true",
    );
    expect(screen.getByRole("link", { name: /Iniciar sesión/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Favoritos/ })).toBeInTheDocument();
  });
});

describe("MegaMenu", () => {
  afterEach(cleanup);

  it("toggles the panel, switches the active type on hover, and shows the featured tile", () => {
    render(
      <MegaMenu
        types={types}
        featuredByType={{
          "t-cua": {
            id: "p1",
            slug: "cuaderno-cosido",
            name: "Cuaderno cosido",
            price: 18000,
            imageUrl: "https://img/cuaderno.png",
          },
        }}
      />,
    );
    const trigger = screen.getByRole("button", { name: /Todas las categorías/ });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    // Cuadernos comes first in the merchandising order and has a featured tile.
    expect(screen.getByRole("link", { name: "Argollados" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cuaderno cosido, producto destacado/ })).toHaveAttribute(
      "href",
      "/producto/cuaderno-cosido",
    );

    fireEvent.mouseEnter(screen.getByRole("link", { name: /Escritura/ }));

    expect(screen.getByRole("link", { name: "Marcadores" })).toBeInTheDocument();
    expect(screen.queryByText("Cuaderno cosido")).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});

describe("CategoryChips", () => {
  afterEach(cleanup);

  it("renders one chip per type up to the limit plus the catalog shortcut", () => {
    render(<CategoryChips types={types} limit={2} />);

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Cuadernos",
      "Escritura",
      "Todas",
    ]);
    expect(links[2]).toHaveAttribute("href", "/tienda");
  });
});
