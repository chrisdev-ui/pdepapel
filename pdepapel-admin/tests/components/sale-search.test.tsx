// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SaleSearch, describeUnresolvedCode } from "@/components/sales/sale-search";
import type { SellLine } from "@/lib/sell-cart";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  // `resolveCode` ya contesta cómo terminó la lectura: es lo que hace que el
  // lector suene a aceptado o a rechazo.
  detected: null as null | ((code: string) => Promise<{ ok: boolean; label?: string | null }> | void),
}));

vi.mock("axios", () => ({ default: { get: mocks.get } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }) }));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <img alt={props.alt} /> }));
vi.mock("@/components/ui/barcode-scanner", () => ({
  BarcodeScanner: ({ onDetected, label, remoteStatusLabel }: { onDetected: (code: string) => Promise<{ ok: boolean }> | void; label?: string; remoteStatusLabel?: boolean }) => {
    mocks.detected = onDetected;
    return <button type="button" data-remote-label={String(Boolean(remoteStatusLabel))}>{label ?? "Escanear"}</button>;
  },
}));

const rows = [
  { id: "p-1", name: "Libreta rosa", sku: "LIB-1", gtin: null, stock: 3, price: 10000, offerPrice: 8000, offerLabel: "20% OFF", color: { name: "Rosa" }, size: { name: "Único" }, available: true, images: [] },
  { id: "p-2", name: "Libreta agotada", sku: "LIB-2", gtin: null, stock: 0, price: 12000, offerPrice: 12000, available: false, images: [] },
];

type AddMock = ReturnType<typeof vi.fn<(line: SellLine) => void | boolean | Promise<void | boolean>>>;

function renderSearch(onAdd: AddMock = vi.fn<(line: SellLine) => void>()) {
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
    // El texto ya no dice «no está a la venta»: dice qué se miró. Aquel mensaje
    // mandaba a buscar un problema de datos incluso cuando el producto estaba
    // activo y con unidades, que es lo que pasaba con el QR de una etiqueta.
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("«ZZZ-404» no coincide con ningún SKU, código de barras ni QR de etiqueta."));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  /**
   * Lo que el lector necesita para sonar distinto. El tono no se decide en el
   * lector —allí no se sabe nada— sino aquí, que es donde se sabe si la unidad
   * entró en la venta.
   */
  describe("lo que se le contesta al lector", () => {
    it("un código exacto contesta aceptado, con el nombre para nombrarlo", async () => {
      renderSearch();
      await waitFor(() => expect(mocks.detected).toBeTypeOf("function"));
      let outcome: unknown;
      await act(async () => {
        outcome = await mocks.detected?.("LIB-1");
      });
      expect(outcome).toEqual({ ok: true, label: "Libreta rosa" });
    });

    it("un código que no existe contesta rechazado", async () => {
      renderSearch();
      await waitFor(() => expect(mocks.detected).toBeTypeOf("function"));
      let outcome: unknown;
      await act(async () => {
        outcome = await mocks.detected?.("ZZZ-404");
      });
      expect(outcome).toEqual({ ok: false, label: null });
    });

    it("un producto agotado contesta rechazado, no aceptado", async () => {
      renderSearch();
      await waitFor(() => expect(mocks.detected).toBeTypeOf("function"));
      let outcome: unknown;
      await act(async () => {
        outcome = await mocks.detected?.("LIB-2");
      });
      expect(outcome).toEqual({ ok: false, label: "Libreta agotada" });
    });

    /**
     * El caso de escanear la misma etiqueta para sumar unidades: la venta
     * rechaza la que pasa del stock. Sonar «aceptado» ahí sería peor que no
     * sonar, porque diría que la cuenta subió cuando no subió.
     */
    it("si la venta rechaza la línea por el tope, la lectura es un rechazo", async () => {
      const onAdd = vi.fn().mockResolvedValue(false);
      renderSearch(onAdd);
      await waitFor(() => expect(mocks.detected).toBeTypeOf("function"));
      let outcome: unknown;
      await act(async () => {
        outcome = await mocks.detected?.("LIB-1");
      });
      expect(onAdd).toHaveBeenCalled();
      expect(outcome).toEqual({ ok: false, label: "Libreta rosa" });
    });

    it("una venta que no contesta nada se da por buena", async () => {
      const onAdd = vi.fn();
      renderSearch(onAdd);
      await waitFor(() => expect(mocks.detected).toBeTypeOf("function"));
      let outcome: unknown;
      await act(async () => {
        outcome = await mocks.detected?.("LIB-1");
      });
      expect(outcome).toEqual({ ok: true, label: "Libreta rosa" });
    });
  });

  /**
   * Lo que de verdad le pasaba a Paula con el celular vinculado.
   *
   * El código exacto SÍ entraba solo —eso nunca estuvo roto—, pero al agregar
   * se devolvía el foco a la casilla y el foco abría la lista con los treinta
   * más vendidos, con el producto recién escaneado dentro. En pantalla eso es
   * idéntico a un resultado esperando un clic, así que ella pulsaba la fila y
   * sumaba una segunda unidad de algo que escaneó una vez: cobraba de más y
   * descontaba de más.
   */
  describe("después de escanear no queda una lista pidiendo clic", () => {
    it("el código exacto entra solo y la lista NO se despliega", async () => {
      const onAdd = renderSearch();
      await waitFor(() => expect(mocks.detected).toBeTypeOf("function"));
      await act(async () => void (await mocks.detected?.("LIB-1")));

      await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ productId: "p-1" })));
      // La casilla conserva el foco: el lector de mano escribe ahí.
      expect(screen.getByRole("combobox")).toHaveFocus();
      // Pero sin lista encima, que es lo que invitaba al clic de más.
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
    });

    it("volver a escribir trae la lista de vuelta", async () => {
      renderSearch();
      await waitFor(() => expect(mocks.detected).toBeTypeOf("function"));
      await act(async () => void (await mocks.detected?.("LIB-1")));
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "lib" } });
      await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
    });

    it("pulsar la casilla a propósito también la trae", async () => {
      renderSearch();
      await waitFor(() => expect(mocks.detected).toBeTypeOf("function"));
      await act(async () => void (await mocks.detected?.("LIB-1")));
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

      fireEvent.pointerDown(screen.getByRole("combobox"));
      fireEvent.focus(screen.getByRole("combobox"));
      await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
    });

    /** Elegir de la lista a mano tampoco debe dejarla abierta detrás. */
    it("elegir una fila con el ratón cierra la lista", async () => {
      const onAdd = renderSearch();
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "rosa" } });
      const fila = await screen.findByRole("option", { name: /Libreta rosa/ });
      fireEvent.click(fila);
      await waitFor(() => expect(onAdd).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    });
  });

  it("shows a plain empty state for a query with no matches", async () => {
    renderSearch();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "nada" } });
    await screen.findByText("Nada coincide con «nada».");
  });

  /**
   * El aviso cuando lo leído no entra solo. El texto viejo decía siempre «no
   * coincide con ningún producto a la venta», también con el QR de un producto
   * activo y con unidades: mandaba a Paula a buscar un problema que no existía.
   */
  describe("el aviso de un código que no entra solo", () => {
    const fila = (over: Record<string, unknown> = {}) =>
      ({ id: "p-9", name: "Guillotina cortes circulares", sku: "GUI-1", gtin: null, stock: 3, price: 25000, ...over }) as never;

    it("sin candidatos, dice qué se miró y no habla de «a la venta»", () => {
      const texto = describeUnresolvedCode("ZZZ-404", []);
      expect(texto).toBe("«ZZZ-404» no coincide con ningún SKU, código de barras ni QR de etiqueta.");
      expect(texto).not.toContain("a la venta");
    });

    it("con un solo candidato, lo nombra en vez de dejar el código solo", () => {
      expect(describeUnresolvedCode("guillo", [fila()])).toBe(
        "«guillo» no es un código exacto. ¿Buscabas «Guillotina cortes circulares»?",
      );
    });

    it("con varios, manda a elegir de la lista", () => {
      expect(describeUnresolvedCode("lib", [fila(), fila({ id: "p-8", name: "Libreta" })])).toBe(
        "«lib» no es un código exacto: elige el producto de la lista.",
      );
    });
  });

  /**
   * Un agotado NO cae en el aviso genérico: lo atrapa `add()` antes, con su
   * propio mensaje, que es el que le dice a Paula dónde mirar.
   */
  it("un producto sin unidades conserva su propio aviso, distinto del genérico", async () => {
    const onAdd = renderSearch();
    await waitFor(() => expect(mocks.detected).toBeTypeOf("function"));
    await act(async () => mocks.detected?.("LIB-2"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "«Libreta agotada» no tiene unidades: revisa Inventario antes de venderlo.",
      ),
    );
    expect(onAdd).not.toHaveBeenCalled();
  });
});
