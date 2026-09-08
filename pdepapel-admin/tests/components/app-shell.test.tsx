// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
let pathname = "/store-1/pedidos";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ storeId: "store-1" }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@clerk/nextjs", () => ({ UserButton: () => <div data-testid="user-button" /> }));
vi.mock("next-themes", () => ({ useTheme: () => ({ setTheme: vi.fn(), theme: "light" }) }));
vi.mock("@/hooks/use-store-modal", () => ({ useStoreModal: () => ({ onOpen: vi.fn() }) }));

import { AppShell } from "@/components/shell/app-shell";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { useSidebarStore } from "@/hooks/use-sidebar-store";

const stores = [
  { id: "store-1", name: "Papelería P de Papel", userId: "u1" },
] as unknown as Parameters<typeof AppShell>[0]["stores"];

beforeEach(() => {
  useSidebarStore.setState({ collapsed: false });
  pathname = "/store-1/pedidos";
  push.mockClear();
});
afterEach(cleanup);

describe("AppShell", () => {
  it("renders the grouped sidebar with the active section, counts, and the page breadcrumb", () => {
    render(
      <AppShell storeId="store-1" stores={stores} storeUrl="https://papeleriapdepapel.com" counts={{ pendingOrders: 5, lowStock: 12 }}>
        <p>Contenido</p>
      </AppShell>,
    );

    const sidebar = screen.getByRole("navigation", { name: "Secciones del panel" });
    expect(within(sidebar).getByText("Ventas")).toBeInTheDocument();
    expect(within(sidebar).getByText("Reportes")).toBeInTheDocument();
    const pedidos = within(sidebar).getByRole("link", { name: /^Pedidos/ });
    expect(pedidos).toHaveAttribute("href", "/store-1/pedidos");
    expect(pedidos).toHaveAttribute("aria-current", "page");
    expect(within(pedidos).getByText("5")).toBeInTheDocument();
    expect(within(sidebar).getByRole("link", { name: /^Inventario/ })).toHaveTextContent("12");
    // Sibling routes stay reachable under their destination while they are separate pages.
    expect(within(sidebar).getByRole("link", { name: "Plantillas de cotización" })).toHaveAttribute("href", "/store-1/cotizaciones");

    expect(screen.getByRole("link", { name: /Ver tienda/ })).toHaveAttribute("href", "https://papeleriapdepapel.com");
    expect(screen.getByRole("link", { name: /Nuevo pedido/ })).toHaveAttribute("href", "/store-1/pedidos/nuevo");

    const crumbs = screen.getByRole("navigation", { name: "Ruta" });
    expect(crumbs).toHaveTextContent("Ventas");
    expect(within(crumbs).getByText("Pedidos")).toHaveAttribute("aria-current", "page");
  });

  it("collapses to an icon rail with the header button and ⌘ B", () => {
    render(
      <AppShell storeId="store-1" stores={stores}>
        <p>Contenido</p>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Contraer menú lateral" }));
    expect(useSidebarStore.getState().collapsed).toBe(true);
    const sidebar = screen.getByRole("navigation", { name: "Secciones del panel" });
    expect(within(sidebar).queryByText("Ventas")).toBeNull();
    expect(within(sidebar).getByRole("link", { name: "Pedidos" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "b", metaKey: true });
    expect(useSidebarStore.getState().collapsed).toBe(false);
  });

  it("opens the command bar with ⌘ K and navigates from an action", () => {
    render(
      <AppShell storeId="store-1" stores={stores}>
        <p>Contenido</p>
      </AppShell>,
    );

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const input = screen.getByPlaceholderText("Busca o escribe qué quieres hacer…");
    fireEvent.change(input, { target: { value: "verificar" } });
    fireEvent.click(screen.getByText("Verificar pagos por transferencia"));
    expect(push).toHaveBeenCalledWith("/store-1/pedidos?vista=por-verificar");
  });
});

describe("Breadcrumbs", () => {
  it("labels nested segments in Spanish and reads ids as Detalle", () => {
    pathname = "/store-1/productos/gestion-masiva";
    const { rerender } = render(<Breadcrumbs storeId="store-1" />);
    expect(screen.getByRole("navigation", { name: "Ruta" })).toHaveTextContent("CatálogoProductosGestión masiva");
    expect(screen.getByRole("link", { name: "Productos" })).toHaveAttribute("href", "/store-1/productos");

    pathname = "/store-1/pedidos/8ffbaa18-1b5d-4bc7-8fe6-ff298111564c";
    rerender(<Breadcrumbs storeId="store-1" />);
    expect(screen.getByRole("navigation", { name: "Ruta" })).toHaveTextContent("VentasPedidosDetalle");

    pathname = "/store-1";
    rerender(<Breadcrumbs storeId="store-1" />);
    expect(screen.queryByRole("navigation", { name: "Ruta" })).toBeNull();
  });
});
