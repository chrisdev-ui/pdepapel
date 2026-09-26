// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * La conciliación rediseñada: contar, no confirmar.
 *
 * Lo que se fija aquí es lo que hacía daño antes: que el formulario llegara ya
 * «cuadrado» y un envío sin tocar devolviera al stock lo dañado y lo perdido.
 */
vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/store-1/ferias/f1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/env.mjs", () => ({ env: new Proxy({}, { get: () => "test" }) }));

import { PhaseReconcile } from "@/app/(dashboard)/[storeId]/(routes)/ferias/[fairEventId]/components/phase-reconcile";
import { summarizeReconciliation, type ReconciliationCount } from "@/lib/fair-phases";

const items = [
  {
    id: "i1",
    productId: "p1",
    allocatedQuantity: 10,
    soldQuantity: 4,
    packedQuantity: 0,
    returnedQuantity: 0,
    damagedQuantity: 0,
    lostQuantity: 0,
    product: { name: "Agenda Hadas", sku: "VIEW-1" },
  },
  {
    id: "i2",
    productId: "p2",
    allocatedQuantity: 5,
    soldQuantity: 5,
    packedQuantity: 0,
    returnedQuantity: 0,
    damagedQuantity: 0,
    lostQuantity: 0,
    product: { name: "Libreta gatitos", sku: "VIEW-2" },
  },
];

const zeroed: Record<string, ReconciliationCount> = {
  p1: { returnedQuantity: 0, damagedQuantity: 0, lostQuantity: 0 },
  p2: { returnedQuantity: 0, damagedQuantity: 0, lostQuantity: 0 },
};

const view = (counts: Record<string, ReconciliationCount>, canWrite = true) =>
  render(
    <PhaseReconcile
      storeId="store-1"
      fairEventId="f1"
      items={items}
      counts={counts}
      summary={summarizeReconciliation(items, counts)}
      packedCapsules={0}
      canWrite={canWrite}
      isReconciling={false}
      onChange={vi.fn()}
      onAssumeIntact={vi.fn()}
      onClose={vi.fn()}
    />,
  );

afterEach(cleanup);

describe("conciliación: contar, no confirmar", () => {
  it("dice cuántas unidades faltan por contar al abrir", () => {
    view(zeroed);
    expect(screen.getByText(/Faltan 6 unidades por contar/i)).toBeInTheDocument();
  });

  it("la fila sin tocar se marca «Sin contar»", () => {
    view(zeroed);
    expect(screen.getAllByText("Sin contar").length).toBeGreaterThan(0);
  });

  it("un producto vendido entero no pide cuenta", () => {
    view(zeroed);
    expect(screen.getAllByText("Todo vendido").length).toBeGreaterThan(0);
  });

  it("no se puede cerrar con unidades sin contar", () => {
    view(zeroed);
    expect(screen.getByRole("button", { name: /Cerrar la feria/i })).toBeDisabled();
  });

  it("el pie dice qué va a pasar: vuelven, se dan de baja y sin contar", () => {
    view(zeroed);
    expect(screen.getAllByText(/Vuelven a bodega/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Se dan de baja/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Sin contar$/i).length).toBeGreaterThan(0);
  });

  it("repartido entre las tres columnas, ya se puede cerrar", () => {
    view({
      p1: { returnedQuantity: 4, damagedQuantity: 1, lostQuantity: 1 },
      p2: { returnedQuantity: 0, damagedQuantity: 0, lostQuantity: 0 },
    });
    expect(screen.getByRole("button", { name: /Cerrar la feria/i })).toBeEnabled();
    expect(screen.getAllByText("Cuadra").length).toBeGreaterThan(0);
  });

  it("contar de menos no cuadra: dice cuántas faltan", () => {
    view({
      p1: { returnedQuantity: 2, damagedQuantity: 0, lostQuantity: 0 },
      p2: { returnedQuantity: 0, damagedQuantity: 0, lostQuantity: 0 },
    });
    expect(screen.getAllByText("Faltan 4").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Cerrar la feria/i })).toBeDisabled();
  });

  it("«Todo volvió intacto» es un botón, no el estado inicial", () => {
    view(zeroed);
    expect(screen.getByRole("button", { name: /Todo volvió intacto/i })).toBeEnabled();
  });

  it("una cuenta de solo lectura no puede contar ni cerrar", () => {
    view(zeroed, false);
    expect(screen.getByRole("button", { name: /Todo volvió intacto/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Cerrar la feria/i })).toBeDisabled();
  });

  it("una fila de kit dice cuántas piezas lleva y cuáles", () => {
    const kitItems = [
      {
        ...items[0],
        product: { name: "Kit de arte básico", sku: "KIT-1" },
        kitComponents: [
          { name: "Acuarelas", quantityPerKit: 1 },
          { name: "Pinceles", quantityPerKit: 2 },
        ],
      },
    ];
    render(
      <PhaseReconcile
        storeId="store-1"
        fairEventId="f1"
        items={kitItems}
        counts={zeroed}
        summary={summarizeReconciliation(kitItems, zeroed)}
        packedCapsules={0}
        canWrite
        isReconciling={false}
        onChange={vi.fn()}
        onAssumeIntact={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Kit · 3 piezas")).toBeInTheDocument();
    expect(screen.getByText("1 × Acuarelas · 2 × Pinceles")).toBeInTheDocument();
    // La fila sigue contando kits enteros: reservados y vendidos no cambian.
    expect(screen.getByRole("spinbutton", { name: "Unidades que volvieron bien de Kit de arte básico" })).toBeInTheDocument();
  });
});
