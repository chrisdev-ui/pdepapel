// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * La lista de Movimientos después del rework: tono por tipo, origen en el que
 * se puede hacer clic y vistas en la URL.
 */
const mocks = vi.hoisted(() => ({ replaceState: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
  usePathname: () => "/store-1/movimientos-inventario",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/env.mjs", () => ({ env: new Proxy({}, { get: () => "test" }) }));
vi.mock("@/components/ui/product-scan-button", () => ({ ProductScanButton: () => <button type="button">Escanear</button> }));

import { InventoryMovementClient } from "@/app/(dashboard)/[storeId]/(routes)/movimientos-inventario/components/client";
import { ViewerAccessProvider } from "@/components/shell/viewer-access";

const base = {
  productSku: "SKU-1",
  productImage: null,
  description: "",
  userName: "Paula",
  userImage: "",
  isOwner: false,
  cost: 0,
  price: 0,
  previousStock: 0,
};

const rows = [
  {
    ...base,
    id: "m1",
    productId: "p1",
    productName: "Cuaderno argollado A5",
    type: "ORDER_PLACED",
    quantity: -2,
    newStock: 1234,
    reason: "Bold: pago confirmado",
    referenceId: "o1",
    reference: { kind: "order", label: "ORD-1787", secondary: "Ana · Bogotá", href: "/store-1/pedidos/o1" },
    createdAt: new Date("2026-09-19T17:58:00.000Z"),
    userName: "Tienda en línea",
  },
  {
    ...base,
    id: "m2",
    productId: "p2",
    productName: "Stickers Nostalgia",
    type: "RESTOCK_RECEIVED",
    quantity: 24,
    newStock: 96,
    reason: "Recepción del pedido PO-0018",
    referenceId: "r1",
    reference: { kind: "restock", label: "PO-0018", secondary: "Distribuidora", href: "/store-1/aprovisionamiento/r1" },
    createdAt: new Date("2026-09-18T21:12:00.000Z"),
  },
  {
    ...base,
    id: "m3",
    productId: "p3",
    productName: "Lápiz mecánico",
    type: "DAMAGE",
    quantity: -1,
    newStock: 11,
    reason: "Daño · Se dañó en la bodega",
    referenceId: null,
    reference: { kind: "note", label: "“Daño · Se dañó en la bodega”", secondary: null, href: null },
    createdAt: new Date("2026-09-17T14:22:00.000Z"),
  },
] as never[];

const list = (data = rows) =>
  render(
    <ViewerAccessProvider role="owner">
      <InventoryMovementClient
        data={data}
        scope={{ days: 90, hasMore: false, take: 500, showAll: false }}
        reference={null}
        product={null}
        fairContext={null}
        openImporter={false}
        issuesPanel={<div data-testid="panel-incidencias">Incidencias</div>}
        openIssues={20}
      />
    </ViewerAccessProvider>,
  );

afterEach(cleanup);

describe("lista de movimientos", () => {
  it("el tono del movimiento sale del tipo, no del signo de la cantidad", () => {
    list();
    // La tabla y las tarjetas de teléfono conviven en el DOM (las esconde el
    // CSS), así que cada etiqueta aparece dos veces; las dos llevan el tono.
    // Venta (−2) y recepción (+24) tienen signos opuestos y tonos propios.
    for (const badge of screen.getAllByText("Venta")) expect(badge).toHaveClass("bg-tint-sky");
    for (const badge of screen.getAllByText("Recepción")) expect(badge).toHaveClass("bg-tint-mint");
    for (const badge of screen.getAllByText("Daño")) expect(badge).toHaveClass("bg-tint-pink");
  });

  it("el origen es un enlace al pedido, a la orden o a la feria", () => {
    list();
    expect(screen.getByRole("link", { name: "ORD-1787" })).toHaveAttribute("href", "/store-1/pedidos/o1");
    expect(screen.getByRole("link", { name: "PO-0018" })).toHaveAttribute("href", "/store-1/aprovisionamiento/r1");
  });

  it("un movimiento sin referencia deja la razón escrita, sin enlace", () => {
    list();
    const note = screen.getByText("“Daño · Se dañó en la bodega”");
    expect(note.closest("a")).toBeNull();
  });

  it("las pestañas cuentan las filas de cada vista", () => {
    list();
    const tabs = screen.getByRole("tablist", { name: "Vistas de movimientos" });
    expect(within(tabs).getByRole("tab", { name: /Todo/ })).toHaveTextContent("3");
    expect(within(tabs).getByRole("tab", { name: /Ventas/ })).toHaveTextContent("1");
    expect(within(tabs).getByRole("tab", { name: /Entradas/ })).toHaveTextContent("1");
    expect(within(tabs).getByRole("tab", { name: /Ajustes y pérdidas/ })).toHaveTextContent("1");
    // Las incidencias se cuentan aparte: no son movimientos.
    expect(within(tabs).getByRole("tab", { name: /Pendientes/ })).toHaveTextContent("20");
  });

  it("elegir una vista filtra la tabla", () => {
    list();
    fireEvent.click(screen.getByRole("tab", { name: /Ventas/ }));
    expect(screen.getAllByText("Cuaderno argollado A5").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Stickers Nostalgia")).toHaveLength(0);
  });

  it("«Pendientes» cambia la tabla por el panel de incidencias", () => {
    list();
    fireEvent.click(screen.getByRole("tab", { name: /Pendientes/ }));
    expect(screen.getByTestId("panel-incidencias")).toBeInTheDocument();
    expect(screen.queryAllByText("Cuaderno argollado A5")).toHaveLength(0);
  });

  it("la lista vacía explica qué es un movimiento y ofrece registrarlo", () => {
    list([] as never[]);
    expect(screen.getByText("Todavía no hay movimientos aquí")).toBeInTheDocument();
    expect(screen.getByText(/deja una fila con su motivo y de dónde viene/)).toBeInTheDocument();
  });
});
