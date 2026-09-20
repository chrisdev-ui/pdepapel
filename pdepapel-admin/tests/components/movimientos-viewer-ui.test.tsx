// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Movimientos de inventario: los botones que escriben no se pintan en una
 * cuenta de solo lectura, y la confirmación de «Conciliar feria anterior» dice
 * lo que de verdad va a pasar en vez de la copia por defecto de borrar.
 */
vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/store-1/movimientos-inventario",
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/env.mjs", () => ({ env: new Proxy({}, { get: () => "test" }) }));

import { AlertModal } from "@/components/modals/alert-modal";
import { ViewerAccessProvider } from "@/components/shell/viewer-access";
import { InventoryMovementClient } from "@/app/(dashboard)/[storeId]/(routes)/movimientos-inventario/components/client";
import { reconciliationConfirmCopy } from "@/app/(dashboard)/[storeId]/(routes)/movimientos-inventario/components/reconciliation-import-modal";

const asViewer = (node: React.ReactNode) => render(<ViewerAccessProvider role="viewer">{node}</ViewerAccessProvider>);
const asOwner = (node: React.ReactNode) => render(<ViewerAccessProvider role="owner">{node}</ViewerAccessProvider>);

const list = (
  <InventoryMovementClient
    data={[]}
    products={[]}
    scope={{ days: 90, hasMore: false, take: 500, showAll: false }}
    reference={null}
    product={null}
    fairContext={null}
    openImporter={false}
  />
);

afterEach(cleanup);

describe("botones que escriben en Movimientos", () => {
  it("la dueña ve «Ajustar Inventario» y «Conciliar feria anterior»", () => {
    asOwner(list);
    expect(screen.getByRole("button", { name: /Ajustar Inventario/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Conciliar feria anterior/i })).toBeInTheDocument();
  });

  it("una cuenta de solo lectura no ve ninguno de los dos", () => {
    asViewer(list);
    expect(screen.queryByRole("button", { name: /Ajustar Inventario/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Conciliar feria anterior/i })).not.toBeInTheDocument();
  });

  it("la lista se sigue viendo: lo que se apaga es escribir, no leer", () => {
    asViewer(list);
    expect(screen.getByText(/Movimientos de Inventario/i)).toBeInTheDocument();
  });
});

describe("confirmación de «Conciliar feria anterior»", () => {
  it("no hereda la copia de borrar", () => {
    const copy = reconciliationConfirmCopy(7);
    expect(copy.title).not.toMatch(/Eliminar/i);
    expect(copy.confirmLabel).not.toMatch(/eliminar/i);
    expect(copy.destructive).toBe(false);
  });

  it("nombra lo que va a pasar y cuántas filas son", () => {
    const copy = reconciliationConfirmCopy(7);
    expect(copy.title).toBe("¿Aplicar 7 ajustes de inventario?");
    expect(copy.confirmLabel).toBe("Sí, aplicar los 7 ajustes");
    expect(copy.description).toContain("7 productos");
    expect(copy.description).toContain("kardex");
    expect(copy.description).toContain("No se puede deshacer");
  });

  it("habla en singular cuando es una sola fila", () => {
    const copy = reconciliationConfirmCopy(1);
    expect(copy.title).toBe("¿Aplicar 1 ajuste de inventario?");
    expect(copy.confirmLabel).toBe("Sí, aplicar el ajuste");
    expect(copy.description).toContain("un producto");
  });

  it("el diálogo renderiza esa copia, no la de borrar", () => {
    asOwner(<AlertModal isOpen onClose={vi.fn()} onConfirm={vi.fn()} loading={false} {...reconciliationConfirmCopy(3)} />);
    expect(screen.getByText("¿Aplicar 3 ajustes de inventario?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sí, aplicar los 3 ajustes" })).toBeInTheDocument();
    expect(screen.queryByText("¿Eliminar de forma definitiva?")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sí, eliminar" })).not.toBeInTheDocument();
  });
});
