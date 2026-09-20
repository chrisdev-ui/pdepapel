// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Fase 2 del acceso de solo lectura, en las pantallas que faltaban:
 * Inventario, Envíos, Preventas y Clientes.
 *
 * Lo que se comprueba aquí es la promesa del aviso de solo lectura —«los
 * botones que crean, editan o borran están apagados»— y que el dinero de la
 * casa no se pinta. El servidor ya manda la fila depurada; esto evita que la
 * interfaz vuelva a ofrecer lo que la cuenta no puede usar.
 */
vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/store-1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/env.mjs", () => ({ env: new Proxy({}, { get: () => "test" }) }));

import { ViewerAccessProvider } from "@/components/shell/viewer-access";
import { InventoryClient } from "@/app/(dashboard)/[storeId]/(routes)/inventario/components/inventory-client";
import { CustomerOverviewPanel } from "@/app/(dashboard)/[storeId]/(routes)/clientes/components/customer-overview-panel";
import { buildColumns } from "@/app/(dashboard)/[storeId]/(routes)/envios/components/columns";

const asViewer = (node: React.ReactNode) => render(<ViewerAccessProvider role="viewer">{node}</ViewerAccessProvider>);
const asOwner = (node: React.ReactNode) => render(<ViewerAccessProvider role="owner">{node}</ViewerAccessProvider>);

const inventory = <InventoryClient data={[]} threshold={5} />;

afterEach(cleanup);

describe("Inventario en una cuenta de solo lectura", () => {
  it("la dueña ve las acciones que escriben", () => {
    asOwner(inventory);
    expect(screen.getAllByRole("button", { name: /Ajustar inventario/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Nueva orden de aprovisionamiento/i }).length).toBeGreaterThan(0);
  });

  it("la cuenta de solo lectura no ve ninguna de las dos", () => {
    asViewer(inventory);
    expect(screen.queryAllByRole("button", { name: /Ajustar inventario/i })).toHaveLength(0);
    expect(screen.queryAllByRole("link", { name: /Nueva orden de aprovisionamiento/i })).toHaveLength(0);
  });

  it("cambia «Valor a costo» por las unidades, sin enseñar el costo", () => {
    asOwner(inventory);
    expect(screen.getAllByText(/Valor a costo/i).length).toBeGreaterThan(0);
    cleanup();
    asViewer(inventory);
    expect(screen.queryAllByText(/Valor a costo/i)).toHaveLength(0);
    expect(screen.getAllByText(/Unidades en stock/i).length).toBeGreaterThan(0);
  });

  it("esconde la vista «Sin costo», que solo sirve para cuadrar costos", () => {
    asOwner(inventory);
    expect(screen.getAllByRole("tab", { name: /Sin costo/i }).length).toBeGreaterThan(0);
    cleanup();
    asViewer(inventory);
    expect(screen.queryAllByRole("tab", { name: /Sin costo/i })).toHaveLength(0);
  });

  it("la lista se sigue leyendo: lo que se apaga es escribir", () => {
    asViewer(inventory);
    expect(screen.getAllByText(/Inventario/i).length).toBeGreaterThan(0);
  });
});

describe("Envíos: las columnas de dinero y guía", () => {
  const idsFor = (canWrite: boolean) =>
    buildColumns("store-1", canWrite).map((column) =>
      "id" in column && column.id ? column.id : "accessorKey" in column ? String(column.accessorKey) : "",
    );

  it("la dueña ve el costo del despacho y la guía", () => {
    const ids = idsFor(true);
    expect(ids).toContain("cost");
    expect(ids).toContain("trackingCode");
  });

  it("la cuenta de solo lectura no ve ninguna de las dos", () => {
    const ids = idsFor(false);
    expect(ids).not.toContain("cost");
    expect(ids).not.toContain("trackingCode");
  });

  it("le quedan el estado y la fecha, que es como se sigue la operación", () => {
    const ids = idsFor(false);
    expect(ids).toContain("updatedAt");
  });
});

describe("Clientes: el agregado no identifica a nadie", () => {
  const overview = {
    summary: { total: 12, buyers: 9, vip: 2, inactive: 3, withoutPurchase: 3 },
    cities: [
      { city: "Bogotá", customers: 7 },
      { city: "Medellín", customers: 5 },
    ],
  };

  it("enseña cuántos hay y de dónde compran", () => {
    asViewer(<CustomerOverviewPanel overview={overview} />);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Bogotá")).toBeInTheDocument();
    expect(screen.getByText("Medellín")).toBeInTheDocument();
  });

  it("dice por qué no está la lista, en vez de dejar la pantalla vacía", () => {
    asViewer(<CustomerOverviewPanel overview={overview} />);
    expect(screen.getByText(/solo la ve la dueña de la tienda/i)).toBeInTheDocument();
  });

  it("no hay teléfonos ni nombres de personas en el agregado", () => {
    const { container } = asViewer(<CustomerOverviewPanel overview={overview} />);
    expect(container.textContent).not.toMatch(/\d{3}\s?\d{3}\s?\d{4}/);
  });
});
