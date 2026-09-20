// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Aprovisionamiento en una cuenta de solo lectura: se puede mirar lo que se
 * pidió, no cambiarlo. Defensa en profundidad — con el guardia del servidor
 * una cuenta de solo lectura ya ni siquiera llega a estas pantallas.
 */
vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1", restockOrderId: "po-1" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/store-1/aprovisionamiento",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("axios", () => {
  // `lib/api.ts` crea su propia instancia al importarse desde DataTable.
  const instance = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } };
  return { default: { ...instance, create: () => instance, isAxiosError: () => false } };
});
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/env.mjs", () => ({ env: new Proxy({}, { get: () => "test" }) }));

import RestockOrderClient from "@/app/(dashboard)/[storeId]/(routes)/aprovisionamiento/components/client";
import { RestockOrderWorkspace } from "@/app/(dashboard)/[storeId]/(routes)/aprovisionamiento/[restockOrderId]/components/restock-order-workspace";
import { ViewerAccessProvider } from "@/components/shell/viewer-access";
import type { RestockOrderWithRelations } from "@/lib/restock-orders-db";
import { RestockOrderStatus } from "@prisma/client";

const asViewer = (node: React.ReactNode) => render(<ViewerAccessProvider role="viewer">{node}</ViewerAccessProvider>);
const asOwner = (node: React.ReactNode) => render(<ViewerAccessProvider role="owner">{node}</ViewerAccessProvider>);

const row = {
  id: "po-1",
  orderNumber: "PO-0036",
  status: RestockOrderStatus.ORDERED,
  supplier: { id: "sup-1", name: "Henko Importaciones" },
  supplierId: "sup-1",
  supplierLeadTimeDays: 10,
  totalAmount: 60000,
  shippingCost: 6000,
  total: 66000,
  createdAt: new Date("2026-09-09T15:00:00.000Z"),
  updatedAt: new Date("2026-09-09T15:00:00.000Z"),
  progress: { orderedUnits: 5, receivedUnits: 0, remainingUnits: 5, lineCount: 2, linesComplete: 0 },
};

const product = (name: string, sku: string) => ({ id: sku, name, sku, stock: 2, acqPrice: 14000, transportationCost: 0, supplierId: null });
const order: RestockOrderWithRelations = {
  id: "po-1",
  storeId: "store-1",
  supplierId: "sup-1",
  orderNumber: "PO-0036",
  status: RestockOrderStatus.ORDERED,
  totalAmount: 60000,
  shippingCost: 6000,
  notes: "Llegan en dos entregas",
  createdAt: new Date("2026-09-09T15:00:00.000Z"),
  updatedAt: new Date("2026-09-09T15:00:00.000Z"),
  supplier: { id: "sup-1", name: "Henko Importaciones", leadTimeDays: 10 },
  items: [
    { id: "l1", restockOrderId: "po-1", productId: "CUA-AZU", index: 0, quantity: 2, quantityReceived: 0, cost: 15000, subtotal: 30000, product: product("Cuaderno azul", "CUA-AZU") },
  ],
  receipts: [],
};

afterEach(cleanup);

describe("la lista en solo lectura", () => {
  it("la dueña ve «Crear pedido»", () => {
    asOwner(<RestockOrderClient data={[row]} supplierFilter={null} />);
    expect(screen.getByRole("link", { name: /Crear pedido/i })).toBeInTheDocument();
  });

  it("una cuenta de solo lectura no lo ve", () => {
    asViewer(<RestockOrderClient data={[row]} supplierFilter={null} />);
    expect(screen.queryByRole("link", { name: /Crear pedido/i })).not.toBeInTheDocument();
  });

  it("los pedidos se siguen viendo: lo que se apaga es escribir, no leer", () => {
    asViewer(<RestockOrderClient data={[row]} supplierFilter={null} />);
    expect(screen.getAllByText("PO-0036").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Henko Importaciones").length).toBeGreaterThan(0);
  });
});

describe("la columna «Cuándo llega» sin plazo del proveedor", () => {
  it("muestra el texto corto y guarda la frase completa en el título", () => {
    // A 1280 la frase entera quedaba pegada al borde de la columna. Hoy 28 de
    // los 29 proveedores no tienen plazo, así que es el caso corriente.
    const sinPlazo = { ...row, supplierLeadTimeDays: null };
    asOwner(<RestockOrderClient data={[sinPlazo]} supplierFilter={null} />);
    const cells = screen.getAllByTitle("Sin plazo del proveedor");
    expect(cells.length).toBeGreaterThan(0);
    expect(cells[0]).toHaveTextContent("Sin plazo");
    // La frase larga ya no se pinta como texto visible.
    expect(screen.queryAllByText("Sin plazo del proveedor")).toHaveLength(0);
  });
});

describe("el pedido en solo lectura", () => {
  it("la dueña conserva recibir, guardar notas y cerrar", () => {
    asOwner(<RestockOrderWorkspace order={order} />);
    expect(screen.getByRole("button", { name: /Recibir mercancía/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Guardar notas/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Cerrar pedido/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancelar pedido/i })).toBeInTheDocument();
  });

  it("una cuenta de solo lectura no ve ninguna acción que cambie el pedido", () => {
    asViewer(<RestockOrderWorkspace order={order} />);
    for (const name of [/Recibir mercancía/i, /Guardar notas/i, /Cerrar pedido/i, /Cancelar pedido/i, /Volver a borrador/i, /Eliminar/i]) {
      expect(screen.queryAllByRole("button", { name })).toHaveLength(0);
    }
    // La zona de cuidado lo dice en vez de quedarse vacía.
    expect(screen.getByText("Sin acciones disponibles.")).toBeInTheDocument();
  });

  it("las notas se leen pero no se editan", () => {
    asViewer(<RestockOrderWorkspace order={order} />);
    expect(screen.getByLabelText("Notas del pedido")).toBeDisabled();
  });

  it("lo que se pidió sigue a la vista", () => {
    asViewer(<RestockOrderWorkspace order={order} />);
    expect(screen.getByRole("heading", { name: "Pedido PO-0036" })).toBeInTheDocument();
    expect(screen.getByText("Cuaderno azul")).toBeInTheDocument();
  });
});
