// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { labelPrintUrl, printJobStorageKey } from "@/components/labels/qr-label-print-sheet";
import { labelDraftStorageKey } from "@/lib/label-sheet-draft";

const picker = vi.hoisted(() => ({ onChange: null as null | ((value: string, product?: unknown) => void) }));

vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }) }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span aria-label={alt} /> }));
vi.mock("@/components/ui/async-product-select", () => ({
  AsyncProductSelect: ({ onChange }: { onChange: (value: string, product?: unknown) => void }) => {
    picker.onChange = onChange;
    return <button type="button">picker</button>;
  },
}));
vi.mock("axios", () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: {
        products: [
          { id: "v1", name: "Cartuchera Wisdom", sku: "CAR-ROS", price: 13000, color: { name: "Rosa pastel" }, size: { name: "S" }, images: [] },
          { id: "v2", name: "Cartuchera Wisdom", sku: "CAR-AZU", price: 13000, color: { name: "Azul pastel" }, size: { name: "S" }, images: [] },
          { id: "v3", name: "Cartuchera Wisdom", sku: "CAR-OLD", price: 13000, isArchived: true, images: [] },
        ],
      },
    }),
  },
}));

import { LabelsPanel } from "@/app/(dashboard)/[storeId]/(routes)/ventas-rapidas/components/labels-panel";

const product = {
  id: "p1",
  name: "Agenda casas escudos Hogwarts",
  sku: "OF-2",
  price: 19000,
  stock: 2,
  color: { name: "Lila" },
  size: { name: "Único" },
  design: { name: "Kawaii" },
  productGroupId: "g1",
  images: [{ url: "https://res.cloudinary.com/demo/image/upload/v1/a.jpg" }],
};

beforeEach(() => {
  window.localStorage.clear();
  // jsdom no trae ResizeObserver; la vista previa se conforma con la primera medida.
  (window as unknown as { ResizeObserver?: unknown }).ResizeObserver = undefined;
});
afterEach(cleanup);

/**
 * Antes: las copias sólo se quitaban y se volvían a agregar, la hoja se
 * vaciaba al cambiar de pestaña y no había vista previa real ni forma de
 * empezar en una posición de la hoja.
 */
describe("LabelsPanel", () => {
  it("adds a product, edits its copies inline and keeps the sheet in localStorage", async () => {
    render(<LabelsPanel />);
    picker.onChange!("p1", product);
    fireEvent.click(await screen.findByRole("button", { name: "Agregar a la hoja" }));

    expect(screen.getByText("1 etiqueta")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Más etiquetas de Agenda casas escudos Hogwarts" }));
    fireEvent.click(screen.getByRole("button", { name: "Más etiquetas de Agenda casas escudos Hogwarts" }));
    expect(screen.getByText("3 etiquetas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Menos etiquetas de Agenda casas escudos Hogwarts" }));
    expect(screen.getByText("2 etiquetas")).toBeInTheDocument();

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(labelDraftStorageKey("store-1")) ?? "{}");
      expect(saved.batches).toEqual([expect.objectContaining({ copies: 2, product: expect.objectContaining({ id: "p1", variant: "Lila · Kawaii" }) })]);
    });
    // La vista previa es la hoja real: dos posiciones ocupadas de 65.
    expect(document.querySelectorAll("[data-label-sheet-preview] [data-label-id]")).toHaveLength(2);
    expect(screen.getByText(/2 etiquetas · 1 hoja carta/)).toBeInTheDocument();
  });

  it("restores a saved sheet after a tab switch and starts at the chosen position", async () => {
    window.localStorage.setItem(
      labelDraftStorageKey("store-1"),
      JSON.stringify({ batches: [{ product: { id: "p9", name: "Resaltador pastel", sku: "RES-1", price: 4500, variant: null, imageUrl: null, productGroupId: null }, copies: 4 }], startAt: 63 }),
    );
    render(<LabelsPanel />);
    expect(await screen.findByText("4 etiquetas")).toBeInTheDocument();
    expect(screen.getByLabelText("Empezar en la etiqueta nº")).toHaveValue(63);
    // 4 etiquetas desde la posición 63: 3 en la primera hoja y 1 en la segunda.
    expect(screen.getByText(/4 etiquetas · 2 hojas carta · desde la posición 63/)).toBeInTheDocument();
    const slots = document.querySelectorAll('[data-label-sheet-preview] .label-sheet[data-page="1"] .label-sheet__slot');
    expect(slots[61].classList.contains("label-sheet__slot--empty")).toBe(true);
    expect(slots[62].getAttribute("data-label-id")).toBe("p9");
  });

  it("adds every live variant of the group at once", async () => {
    render(<LabelsPanel />);
    picker.onChange!("p1", product);
    fireEvent.click(await screen.findByRole("button", { name: "Todas las variantes del grupo" }));
    await waitFor(() => expect(screen.getByText("2 etiquetas")).toBeInTheDocument());
    expect(screen.getByText("CAR-ROS · Rosa pastel · S")).toBeInTheDocument();
    expect(screen.queryByText(/CAR-OLD/)).toBeNull();
  });

  it("hands the sheet to the print page instead of opening a popup document", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    render(<LabelsPanel />);
    picker.onChange!("p1", product);
    fireEvent.click(await screen.findByRole("button", { name: "Agregar a la hoja" }));
    fireEvent.click(screen.getByRole("button", { name: "Imprimir o guardar PDF" }));
    expect(open).toHaveBeenCalledWith(labelPrintUrl("store-1"), "_blank", "noopener");
    const job = JSON.parse(window.localStorage.getItem(printJobStorageKey("store-1")) ?? "{}");
    expect(job.labels).toEqual([expect.objectContaining({ code: "PDP:p1", sku: "OF-2", variant: "Lila · Kawaii", price: 19000 })]);
    expect(job.content).toMatchObject({ showSku: true, showVariant: true, showPrice: false });
  });
});
