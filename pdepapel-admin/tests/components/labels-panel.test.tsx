// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { labelPrintUrl, printJobStorageKey } from "@/components/labels/qr-label-print-sheet";
import { labelDraftStorageKey } from "@/lib/label-sheet-draft";

const picker = vi.hoisted(() => ({
  onChange: null as null | ((value: string, product?: unknown) => void),
  onSelectGroup: null as null | ((group: { id: string; name: string; count: number }) => void),
  opened: 0,
}));
const scanner = vi.hoisted(() => ({ onDetected: null as null | ((code: string) => void) }));

vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }) }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span aria-label={alt} /> }));
vi.mock("@/components/ui/async-product-select", () => ({
  AsyncProductSelect: ({
    id,
    onChange,
    onSelectGroup,
  }: {
    id?: string;
    onChange: (value: string, product?: unknown) => void;
    onSelectGroup?: (group: { id: string; name: string; count: number }) => void;
  }) => {
    picker.onChange = onChange;
    picker.onSelectGroup = onSelectGroup ?? null;
    return (
      <button type="button" id={id} onClick={() => { picker.opened += 1; }}>
        picker
      </button>
    );
  },
}));
vi.mock("@/components/ui/barcode-scanner", () => ({
  BarcodeScanner: ({ onDetected, compact }: { onDetected: (code: string) => void; compact?: boolean }) => {
    scanner.onDetected = onDetected;
    return <button type="button" aria-label="Escanear" data-compact={compact ? "1" : "0"}>scan</button>;
  },
}));
vi.mock("axios", () => ({
  default: {
    get: vi.fn(async (url: string, options?: { params?: { q?: string } }) => {
      if (url.includes("/products/search")) {
        const q = options?.params?.q ?? "";
        return {
          data: {
            data: q === "AGOTADO-1" ? [{ id: "p0", name: "Washi tape nube", sku: "AGOTADO-1", gtin: null, stock: 0, price: 6500, images: [] }] : [],
            metadata: { hasMore: false },
          },
        };
      }
      return {
        data: {
          name: "Cartuchera Wisdom",
          products: [
            { id: "v1", name: "Cartuchera Wisdom", sku: "CAR-ROS", price: 13000, stock: 1, color: { name: "Rosa pastel" }, size: { name: "S" }, images: [] },
            { id: "v2", name: "Cartuchera Wisdom", sku: "CAR-AZU", price: 13000, stock: 1, color: { name: "Azul pastel" }, size: { name: "S" }, images: [] },
            { id: "v3", name: "Cartuchera Wisdom", sku: "CAR-OLD", price: 13000, stock: 0, isArchived: true, images: [] },
          ],
        },
      };
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
    // La vista previa es la hoja real: dos posiciones ocupadas de 60.
    expect(document.querySelectorAll("[data-label-sheet-preview] [data-label-id]")).toHaveLength(2);
    expect(screen.getByText(/2 etiquetas · 1 hoja carta/)).toBeInTheDocument();
  });

  it("restores a saved sheet after a tab switch and starts at the chosen position", async () => {
    window.localStorage.setItem(
      labelDraftStorageKey("store-1"),
      JSON.stringify({ batches: [{ product: { id: "p9", name: "Resaltador pastel", sku: "RES-1", price: 4500, variant: null, imageUrl: null, productGroupId: null }, copies: 4 }], startAt: 58 }),
    );
    render(<LabelsPanel />);
    expect(await screen.findByText("4 etiquetas")).toBeInTheDocument();
    expect(screen.getByLabelText("Empezar en la etiqueta nº")).toHaveValue(58);
    // 4 etiquetas desde la posición 58: 3 en la primera hoja (58, 59, 60) y 1 en la segunda.
    expect(screen.getByText(/4 etiquetas · 2 hojas carta · desde la posición 58/)).toBeInTheDocument();
    const slots = document.querySelectorAll('[data-label-sheet-preview] .label-sheet[data-page="1"] .label-sheet__slot');
    expect(slots).toHaveLength(60);
    expect(slots[56].classList.contains("label-sheet__slot--empty")).toBe(true);
    expect(slots[57].getAttribute("data-label-id")).toBe("p9");
  });

  it("shows named horizontal and vertical offset fields with ± steppers and persists them", async () => {
    render(<LabelsPanel />);
    const vertical = await screen.findByLabelText("Vertical");
    expect(screen.getByLabelText("Horizontal")).toHaveValue(0);
    fireEvent.click(screen.getByRole("button", { name: "Vertical: sumar 0.5 mm" }));
    fireEvent.click(screen.getByRole("button", { name: "Vertical: sumar 0.5 mm" }));
    expect(vertical).toHaveValue(1);
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(labelDraftStorageKey("store-1")) ?? "{}");
      expect(saved.sheet).toMatchObject({ offsetXMm: 0, offsetYMm: 1 });
    });
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

  it("shows the «Elegido» card with thumbnail, «SKU · stock · precio» and a «Cambiar» button that reopens the picker", async () => {
    render(<LabelsPanel />);
    picker.onChange!("p1", product);
    const card = await screen.findByTestId("label-pick");
    expect(card.textContent).toContain("Elegido");
    expect(card.textContent).toContain("Agenda casas escudos Hogwarts · Lila · Kawaii");
    expect(card.textContent).toMatch(/OF-2 · 2 und · \$\s?19\.000/);
    expect(card.querySelector('[aria-label="Agenda casas escudos Hogwarts"]')).not.toBeNull();
    const before = picker.opened;
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }));
    expect(screen.queryByTestId("label-pick")).toBeNull();
    expect(picker.opened).toBe(before + 1);
  });

  it("explains how to search or scan under the field", async () => {
    render(<LabelsPanel />);
    expect(
      await screen.findByText(/Escribe y elige de la lista, o pulsa Escanear y apunta al código de barras del empaque\. Un grupo agrega una etiqueta por variante\./),
    ).toBeInTheDocument();
  });

  it("lists what the label carries: name always on, group name optional and persisted", async () => {
    render(<LabelsPanel />);
    expect(await screen.findByText("Qué lleva cada etiqueta")).toBeInTheDocument();
    const always = screen.getByRole("checkbox", { name: "Nombre (siempre)" });
    expect(always).toBeDisabled();
    expect(always).toHaveAttribute("data-state", "checked");
    expect(screen.getByRole("checkbox", { name: "Variante: color y tamaño" })).toHaveAttribute("data-state", "checked");
    expect(screen.getByText(/zona de silencio y el SKU nunca se corta/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Nombre del grupo" }));
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(labelDraftStorageKey("store-1")) ?? "{}");
      expect(saved.content).toMatchObject({ showGroupName: true });
    });
  });

  /**
   * El caso que rompía con el endpoint de Vender: un producto con stock 0
   * respondía 409. Aquí se resuelve por la búsqueda y queda elegido.
   */
  it("scan resolves a zero-stock product and leaves it picked", async () => {
    render(<LabelsPanel />);
    expect(await screen.findByRole("button", { name: "Escanear" })).toHaveAttribute("data-compact", "1");
    scanner.onDetected!("AGOTADO-1");
    const card = await screen.findByTestId("label-pick");
    expect(card.textContent).toContain("Washi tape nube");
    expect(card.textContent).toContain("AGOTADO-1 · 0 und");
    fireEvent.click(screen.getByRole("button", { name: "Agregar a la hoja" }));
    expect(screen.getByText("1 etiqueta")).toBeInTheDocument();
  });

  it("adds the whole group from the picker's «todas las variantes» row and prints the group name on those labels", async () => {
    render(<LabelsPanel />);
    await screen.findByText("Qué lleva cada etiqueta");
    picker.onSelectGroup!({ id: "g1", name: "Cartuchera Wisdom", count: 2 });
    await waitFor(() => expect(screen.getByText("2 etiquetas")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox", { name: "Nombre del grupo" }));
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    fireEvent.click(screen.getByRole("button", { name: "Imprimir o guardar PDF" }));
    const job = JSON.parse(window.localStorage.getItem(printJobStorageKey("store-1")) ?? "{}");
    expect(job.labels.map((label: { group?: string | null }) => label.group)).toEqual(["Cartuchera Wisdom", "Cartuchera Wisdom"]);
    expect(job.content).toMatchObject({ showGroupName: true });
    expect(document.querySelectorAll("[data-label-sheet-preview] .label-sheet__group")).toHaveLength(2);
    open.mockRestore();
  });

  it("shows the four-state legend under the sheet and tints used and next-free positions", async () => {
    window.localStorage.setItem(
      labelDraftStorageKey("store-1"),
      JSON.stringify({ batches: [{ product: { id: "p9", name: "Resaltador pastel", sku: "RES-1", price: 4500, variant: null, imageUrl: null, productGroupId: null, groupName: null }, copies: 2 }], startAt: 3 }),
    );
    render(<LabelsPanel />);
    const legend = await screen.findByRole("list", { name: "Leyenda de la hoja" });
    expect(Array.from(legend.querySelectorAll("li")).map((li) => li.textContent?.trim())).toEqual(["Se imprime", "Siguiente libre", "Ya usada", "Libre"]);
    const slots = document.querySelectorAll('[data-label-sheet-preview] .label-sheet[data-page="1"] .label-sheet__slot');
    expect(slots[0].classList.contains("label-sheet__slot--used")).toBe(true);
    expect(slots[1].classList.contains("label-sheet__slot--used")).toBe(true);
    expect(slots[2].getAttribute("data-label-id")).toBe("p9");
    expect(slots[4].classList.contains("label-sheet__slot--next")).toBe(true);
  });

  it("shows a thumbnail per sheet row and opens the real-size preview without the print dialog", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    render(<LabelsPanel />);
    picker.onChange!("p1", product);
    fireEvent.click(await screen.findByRole("button", { name: "Agregar a la hoja" }));
    const row = screen.getByRole("button", { name: "Menos etiquetas de Agenda casas escudos Hogwarts" }).closest("li") as HTMLElement;
    expect(row.querySelector('[aria-label="Agenda casas escudos Hogwarts"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Vista previa a tamaño real" }));
    expect(open).toHaveBeenLastCalledWith(labelPrintUrl("store-1", "vista"), "_blank", "noopener");
    expect(labelPrintUrl("store-1", "vista")).toBe("/store-1/etiquetas/imprimir?modo=vista");
  });
});
