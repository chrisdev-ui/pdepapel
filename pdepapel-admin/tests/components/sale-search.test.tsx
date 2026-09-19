// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SaleSearch } from "@/components/sales/sale-search";
import type { SellLine } from "@/lib/sell-cart";

const mocks = vi.hoisted(() => ({ get: vi.fn(), detected: null as null | ((code: string) => void) }));

vi.mock("axios", () => ({ default: { get: mocks.get } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }) }));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <img alt={props.alt} /> }));
vi.mock("@/components/ui/barcode-scanner", () => ({
  BarcodeScanner: ({ onDetected, label, remoteStatusLabel }: { onDetected: (code: string) => void; label?: string; remoteStatusLabel?: boolean }) => {
    mocks.detected = onDetected;
    return <button type="button" data-remote-label={String(Boolean(remoteStatusLabel))}>{label ?? "Escanear"}</button>;
  },
}));

const rows = [
  { id: "p-1", name: "Libreta rosa", sku: "LIB-1", gtin: null, stock: 3, price: 10000, offerPrice: 8000, offerLabel: "20% OFF", color: { name: "Rosa" }, size: { name: "Único" }, available: true, images: [] },
  { id: "p-2", name: "Libreta agotada", sku: "LIB-2", gtin: null, stock: 0, price: 12000, offerPrice: 12000, available: false, images: [] },
];

function renderSearch(onAdd = vi.fn<(line: SellLine) => void>()) {
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <SaleSearch onAdd={onAdd} />
    </SWRConfig>,
  );
  return onAdd;
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockImplementation(async (url: string) => {
    const q = new URL(url, "https://x").searchParams.get("q") ?? "";
    return { data: { data: rows.filter((row) => !q || row.sku.toLowerCase() === q.toLowerCase() || row.name.toLowerCase().includes(q.toLowerCase())), metadata: { total: 2, truncated: false } } };
  });
});

/**
 * Vender: una sola entrada «Buscar o escanear». Se precarga al abrir, muestra
 * esqueletos mientras carga, chips por fila, agotados al final y deshabilitados,
 * y solo el código exacto entra sin elegir (Enter, cámara, celular).
 */
describe("SaleSearch", () => {
  it("preloads the first page on mount and shows skeleton rows while loading", async () => {
    let resolve: (value: unknown) => void = () => {};
    mocks.get.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    renderSearch();
    expect(mocks.get).toHaveBeenCalledWith("/api/store-1/products/search?mode=venta&q=&limit=30");
    fireEvent.focus(screen.getByRole("combobox", { name: "Buscar o escanear" }));
    expect(screen.getByRole("listbox", { name: "Resultados" })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(/Cargando/)).not.toBeInTheDocument();
    await act(async () => resolve({ data: { data: rows, metadata: {} } }));
    await screen.findByText("Libreta rosa");
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-busy", "false");
  });

  it("renders chips, the offer as before/after, and the sold-out row disabled with a plain notice on click", async () => {
    const onAdd = renderSearch();
    fireEvent.focus(screen.getByRole("combobox"));
    await screen.findByText("Libreta rosa");
    expect(screen.getByText("Rosa")).toBeInTheDocument();
    expect(screen.queryByText("Único")).not.toBeInTheDocument();
    expect(screen.getByText("$ 8.000")).toBeInTheDocument();
    expect(screen.getByText("$ 10.000")).toHaveClass("line-through");
    const soldOut = screen.getByRole("option", { name: /Libreta agotada/ });
    expect(soldOut).toHaveAttribute("aria-disabled", "true");
    expect(soldOut).toHaveTextContent("Agotado");
    fireEvent.click(soldOut);
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("«Libreta agotada» no tiene unidades: revisa Inventario antes de venderlo.");
  });

  it("adds the exact code on Enter, with the offer price, and clears the box", async () => {
    const onAdd = renderSearch();
    const input = screen.getByRole("combobox");
    await screen.findByText("Libreta rosa", { exact: false }, { timeout: 2000 }).catch(() => undefined);
    fireEvent.change(input, { target: { value: "lib-1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd.mock.calls[0][0]).toMatchObject({ productId: "p-1", price: 8000, originalPrice: 10000, chips: ["Rosa"], maxQuantity: 3 });
    expect(input).toHaveValue("");
  });

  it("adds the highlighted name match on Enter only once the list matches what was typed", async () => {
    const onAdd = renderSearch();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "rosa" } });
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith(expect.stringContaining("q=rosa")));
    await screen.findByRole("option", { name: /Libreta rosa/ });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ productId: "p-1" })));
  });

  it("routes camera and paired-phone reads through the same path and explains an unknown code", async () => {
    const onAdd = renderSearch();
    await waitFor(() => expect(mocks.detected).toBeTypeOf("function"));
    expect(screen.getByRole("button", { name: "Escanear" })).toHaveAttribute("data-remote-label", "true");
    await act(async () => mocks.detected?.("LIB-1"));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ productId: "p-1" })));
    await act(async () => mocks.detected?.("ZZZ-404"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("«ZZZ-404» no coincide con ningún producto a la venta."));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("shows a plain empty state for a query with no matches", async () => {
    renderSearch();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "nada" } });
    await screen.findByText("Nada coincide con «nada».");
  });
});
