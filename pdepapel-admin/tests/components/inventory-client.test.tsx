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
vi.mock("@/app/(dashboard)/[storeId]/(routes)/movimientos-inventario/components/adjust-inventory-modal", () => ({
  AdjustInventoryModal: (props: Record<string, unknown>) => {
    modalProps.last = props;
    return props.isOpen ? <div data-testid="adjust-modal">modal:{String(props.defaultProductId ?? "none")}</div> : null;
  },
}));

import { InventoryClient } from "@/app/(dashboard)/[storeId]/(routes)/inventario/components/inventory-client";
import type { InventoryRow } from "@/app/(dashboard)/[storeId]/(routes)/inventario/server/get-inventory";
import { useTableStore } from "@/hooks/use-table-store";

const row = (overrides: Partial<InventoryRow>): InventoryRow => ({
  id: "p1",
  name: "Cuaderno Snoopy",
  sku: "CUA-1",
  stock: 3,
  price: 32000,
  acqPrice: 18500,
  isKit: false,
  updatedAt: new Date("2026-09-01T12:00:00.000Z"),
  categoryName: "Cuadernos",
  supplier: { id: "sup-1", name: "Papelería Bogotá" },
  image: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
  lastMovement: null,
  ...overrides,
});

const data: InventoryRow[] = [
  row({ id: "p1", name: "Cuaderno Snoopy", stock: 3 }),
  row({ id: "p2", name: "Regla Kawaii", sku: "REG-1", stock: 8, supplier: null }),
  row({ id: "p3", name: "Sticker pack", sku: "STK-1", stock: 0 }),
];

beforeEach(() => {
  useTableStore.setState({ tables: {} });
  push.mockClear();
  modalProps.last = null;
});
afterEach(cleanup);

describe("InventoryClient", () => {
  it("shows the store threshold in the card note and counts critical stock with it", () => {
    render(<InventoryClient data={data} threshold={10} thresholdFromSettings />);
    expect(screen.getByText("10 unidades o menos · según Ajustes · 1 agotados")).toBeInTheDocument();
    const tab = screen.getByRole("tab", { name: /Stock crítico/ });
    expect(tab).toHaveTextContent("2");
  });

  it("says the default is in use when the store has not set a threshold", () => {
    render(<InventoryClient data={data} threshold={5} />);
    expect(screen.getByText("5 unidades o menos · valor por defecto · 1 agotados")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Stock crítico/ })).toHaveTextContent("1");
  });

  it("preselects the row product in the adjust modal, but not from the header button", async () => {
    const user = userEvent.setup();
    render(<InventoryClient data={data} threshold={5} />);
    expect(modalProps.last).toMatchObject({ isOpen: false, defaultProductId: null });

    const rowEl = screen.getByText("Regla Kawaii").closest("tr");
    expect(rowEl).not.toBeNull();
    await user.click(within(rowEl as HTMLElement).getByRole("button", { name: "Acciones" }));
    await user.click(await screen.findByRole("menuitem", { name: "Ajustar inventario" }));
    expect(screen.getByTestId("adjust-modal")).toHaveTextContent("modal:p2");
    expect(modalProps.last).toMatchObject({ isOpen: true, defaultProductId: "p2" });

    await user.click(screen.getByRole("button", { name: /Ajustar inventario/ }));
    expect(modalProps.last).toMatchObject({ isOpen: true, defaultProductId: null });
  });

  it("links restock and movements row actions with the product and supplier", async () => {
    const user = userEvent.setup();
    render(<InventoryClient data={data} threshold={5} />);
    const rowEl = screen.getByText("Cuaderno Snoopy").closest("tr") as HTMLElement;
    await user.click(within(rowEl).getByRole("button", { name: "Acciones" }));
    await user.click(await screen.findByRole("menuitem", { name: /Reponer con el proveedor/ }));
    expect(push).toHaveBeenCalledWith("/store-1/aprovisionamiento/nuevo?proveedor=sup-1&producto=p1");

    await user.click(within(rowEl).getByRole("button", { name: "Acciones" }));
    await user.click(await screen.findByRole("menuitem", { name: "Ver movimientos" }));
    expect(push).toHaveBeenCalledWith("/store-1/movimientos-inventario?producto=p1");
  });
});
