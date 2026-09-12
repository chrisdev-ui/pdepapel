// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const modalProps = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ storeId: "store-1" }),
  usePathname: () => "/store-1/inventario",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <img alt={props.alt} /> }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("axios", () => {
  const post = vi.fn();
  const instance = { get: vi.fn(), post, interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } };
  return { default: { post, get: vi.fn(), create: () => instance, isAxiosError: () => false }, isAxiosError: () => false, AxiosError: class extends Error {} };
});
vi.mock("@/app/(dashboard)/[storeId]/(routes)/movimientos-inventario/components/adjust-inventory-modal", () => ({
  AdjustInventoryModal: (props: Record<string, unknown>) => {
    modalProps.last = props;
    return props.isOpen ? <div data-testid="adjust-modal">modal:{String(props.defaultProductId ?? "none")}</div> : null;
  },
}));

import { InventoryClient } from "@/app/(dashboard)/[storeId]/(routes)/inventario/components/inventory-client";
import type { InventoryRow } from "@/app/(dashboard)/[storeId]/(routes)/inventario/server/get-inventory";
import { useTableStore } from "@/hooks/use-table-store";
import { computeReplenishment } from "@/lib/replenishment";

const row = (overrides: Partial<InventoryRow> & { sold30?: number; sold90?: number; onOrder?: number }): InventoryRow => {
  const stock = overrides.stock ?? 3;
  const sold30 = overrides.sold30 ?? 0;
  const sold90 = overrides.sold90 ?? sold30;
  const onOrder = overrides.onOrder ?? 0;
  return {
    id: "p1",
    name: "Cuaderno Snoopy",
    sku: "CUA-1",
    price: 32000,
    acqPrice: 18500,
    isKit: false,
    updatedAt: new Date("2026-09-01T12:00:00.000Z"),
    categoryName: "Cuadernos",
    supplier: { id: "sup-1", name: "Papelería Bogotá" },
    image: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    lastCost: 18500,
    lastCostSource: "product",
    lastCostAt: null,
    limitingComponent: null,
    ...overrides,
    stock,
    sold30,
    sold90,
    soldViaKits30: overrides.soldViaKits30 ?? 0,
    onOrder,
    signal: computeReplenishment({ stock, sold30, sold90, onOrder, threshold: 5 }),
  };
};

/** Vende 14 en 30 días con 3 en stock (6 días); una durmiente; una agotada que vendía. */
const data: InventoryRow[] = [
  row({ id: "p1", name: "Cuaderno Snoopy", stock: 3, sold30: 14, sold90: 30 }),
  row({ id: "p2", name: "Regla Kawaii", sku: "REG-1", stock: 8, supplier: null, sold30: 0, sold90: 0 }),
  row({ id: "p3", name: "Sticker pack", sku: "STK-1", stock: 0, sold30: 0, sold90: 6, supplier: null }),
];

beforeEach(() => {
  useTableStore.setState({ tables: {} });
  push.mockClear();
  modalProps.last = null;
});
afterEach(cleanup);

describe("InventoryClient", () => {
  it("opens on «Por reponer», counts by cover and explains the rule with the store threshold", () => {
    render(<InventoryClient data={data} threshold={5} thresholdFromSettings />);
    expect(screen.getByRole("tab", { name: /Por reponer/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Por reponer/ })).toHaveTextContent("2");
    expect(screen.getByText("Se acaban esta semana").parentElement?.parentElement).toHaveTextContent("1");
    expect(screen.getByText("Agotados que se vendían").parentElement?.parentElement).toHaveTextContent("1");
    expect(screen.getByText(/Sin movimiento en 90 días/).parentElement?.parentElement).toHaveTextContent("1");
    expect(screen.getByText(/5 unidades o menos \(umbral de Ajustes\)/)).toBeInTheDocument();
    // La durmiente no aparece en la vista por defecto; la agotada que vendía va primero.
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Sticker pack");
    expect(rows[0]).toHaveTextContent("Agotado");
    expect(rows[1]).toHaveTextContent("Cuaderno Snoopy");
    expect(rows[1]).toHaveTextContent("6 días");
    expect(screen.queryByText("Regla Kawaii")).toBeNull();
  });

  it("offers an offer instead of a restock for a dormant product in «Todo»", async () => {
    const user = userEvent.setup();
    render(<InventoryClient data={data} threshold={5} initialView="todo" />);
    const rowEl = screen.getByText("Regla Kawaii").closest("tr") as HTMLElement;
    expect(within(rowEl).getByRole("link", { name: "Poner en oferta" })).toHaveAttribute("href", "/store-1/ofertas/nuevo");
    const selling = screen.getByText("Cuaderno Snoopy").closest("tr") as HTMLElement;
    // 14 en 30 días con 3 en stock: 4 semanas ≈ 13,1 unidades − 3 = 11 sugeridas.
    expect(within(selling).getByRole("link", { name: "Reponer" })).toHaveAttribute("href", "/store-1/aprovisionamiento/nuevo?proveedor=sup-1&producto=p1&cantidad=11");
    await user.click(within(selling).getByRole("button", { name: "Acciones" }));
    await user.click(await screen.findByRole("menuitem", { name: "Ver kardex" }));
    expect(push).toHaveBeenCalledWith("/store-1/movimientos-inventario/producto/p1");
  });

  it("preselects the row product in the adjust modal, but not from the header button", async () => {
    const user = userEvent.setup();
    render(<InventoryClient data={data} threshold={5} initialView="todo" />);
    const rowEl = screen.getByText("Regla Kawaii").closest("tr") as HTMLElement;
    await user.click(within(rowEl).getByRole("button", { name: "Acciones" }));
    await user.click(await screen.findByRole("menuitem", { name: "Ajustar inventario" }));
    expect(modalProps.last).toMatchObject({ isOpen: true, defaultProductId: "p2" });
    await user.click(screen.getByRole("button", { name: /Ajustar inventario/ }));
    expect(modalProps.last).toMatchObject({ isOpen: true, defaultProductId: null });
  });

  it("never offers a restock for a kit: it points to its components and shows no cost value", () => {
    const kit = row({ id: "k1", name: "Kit resaltadores", sku: "KIT-1", stock: 2, sold30: 8, sold90: 20, isKit: true, lastCost: null, lastCostSource: null, limitingComponent: "Marcador lila" });
    render(<InventoryClient data={[...data, kit]} threshold={5} initialView="todo" />);
    const rowEl = screen.getByText("Kit resaltadores").closest("tr") as HTMLElement;
    expect(within(rowEl).queryByRole("link", { name: "Reponer" })).toBeNull();
    expect(within(rowEl).getByRole("link", { name: "Ver componentes" })).toHaveAttribute("href", "/store-1/productos/k1");
    expect(within(rowEl).getByText(/limita Marcador lila/)).toBeInTheDocument();
    expect(within(rowEl).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("groups by supplier with a draft button per supplier and a separate group for products without one", async () => {
    const user = userEvent.setup();
    render(<InventoryClient data={data} threshold={5} />);
    await user.click(screen.getByRole("button", { name: "Agrupar por proveedor" }));
    expect(screen.getByRole("heading", { name: "Papelería Bogotá" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crear borrador con 1 línea/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sin proveedor asignado" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Incluir Cuaderno Snoopy" })).toBeChecked();
    expect(screen.getByLabelText("Cantidad a pedir de Cuaderno Snoopy")).toHaveValue("11");
  });
});
