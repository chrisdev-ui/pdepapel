// @vitest-environment jsdom

import type { Table } from "@tanstack/react-table";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BulkActions } from "@/app/(dashboard)/[storeId]/(routes)/envios/components/bulk-actions";
import type { ShipmentColumn } from "@/app/(dashboard)/[storeId]/(routes)/envios/components/columns";
import type { DispatchShipment } from "@/app/(dashboard)/[storeId]/(routes)/envios/server/get-shipments";
import { OrderStatus, OrderType, PaymentMethod, ShippingStatus } from "@prisma/client";

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(cleanup);

const dispatchShipment = (id: string): DispatchShipment => ({
  id,
  trackingCode: null,
  carrierName: null,
  courier: null,
  status: ShippingStatus.Preparing,
  createdAt: new Date(),
  updatedAt: new Date(),
  order: {
    orderNumber: `ORD-${id}`,
    fullName: "Ana",
    city: "Cali",
    status: OrderStatus.PAID,
    type: OrderType.STANDARD,
    paymentMethod: PaymentMethod.Bold,
    orderItems: [],
  },
});

const row = (id: string, guideUrl: string | null = null) => ({ original: { id, guideUrl } as ShipmentColumn });

function fakeTable(selected: ReturnType<typeof row>[]): Table<ShipmentColumn> {
  return {
    getFilteredSelectedRowModel: () => ({ rows: selected }),
    resetRowSelection: vi.fn(),
  } as unknown as Table<ShipmentColumn>;
}

describe("BulkActions", () => {
  it("counts in the picking button only the selected shipments that are in the dispatch queue", () => {
    const dispatch = [dispatchShipment("s1"), dispatchShipment("s2"), dispatchShipment("s3")];
    render(<BulkActions table={fakeTable([row("s1"), row("s3"), row("s9", "https://guias.test/9.pdf")])} dispatch={dispatch} />);
    expect(screen.getByRole("button", { name: /Lista de recogida/ })).toHaveTextContent("Lista de recogida (2)");
    expect(screen.getByRole("button", { name: /Abrir guías/ })).toHaveTextContent("Abrir guías (1)");
  });

  it("hides the picking button when nothing selected is ready to dispatch", () => {
    render(<BulkActions table={fakeTable([row("s9")])} dispatch={[dispatchShipment("s1")]} />);
    expect(screen.queryByRole("button", { name: /Lista de recogida/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Cambiar estado/ })).toBeInTheDocument();
  });

  it("names the selection count and the target status in the confirmation", async () => {
    render(<BulkActions table={fakeTable([row("s1"), row("s2")])} dispatch={[]} />);
    // Radix abre el menú con teclado en jsdom (no hay PointerEvent real).
    fireEvent.keyDown(screen.getByRole("button", { name: /Cambiar estado/ }), { key: "Enter" });
    expect(await screen.findByText("2 envíos")).toBeInTheDocument();
    fireEvent.keyDown(await screen.findByRole("menuitem", { name: "Marcar como despachado" }), { key: "Enter" });
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("¿Cambiar el estado de 2 envíos?");
    expect(dialog).toHaveTextContent("Quedarán como «Despachado»");
    expect(screen.getByRole("button", { name: "Sí, cambiar" })).toBeInTheDocument();
  });
});
