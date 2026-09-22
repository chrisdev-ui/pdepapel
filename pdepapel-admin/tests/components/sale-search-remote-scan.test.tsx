// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }));
vi.mock("axios", () => ({ default: { ...http, isAxiosError: () => false } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }) }));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <img alt={props.alt} /> }));
vi.mock("qrcode.react", () => ({ QRCodeSVG: () => <svg /> }));
// La cámara local no participa aquí; lo que se prueba es el camino del celular.
vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    decodeFromStream = vi.fn().mockResolvedValue({ stop: vi.fn() });
  },
}));

import { SaleSearch } from "@/components/sales/sale-search";
import { resetRemoteScannerControllers } from "@/hooks/use-remote-scanner";
import { resetScanFeedback } from "@/hooks/use-scan-feedback";
import { REMOTE_SCAN_POLL_MS } from "@/lib/scanner-pairing";
import type { SellLine } from "@/lib/sell-cart";

const PRODUCTO = {
  id: "ef5d23b8-644a-4bd6-ada2-070c5cc42093",
  name: "Separador kawaii imantado",
  sku: "SEP-KAW-PAS-XS-L-1854",
  gtin: null,
  stock: 25,
  price: 1500,
  offerPrice: 1500,
  available: true,
  images: [],
};
const QR = `PDP:${PRODUCTO.id}`;

const sesion = { code: "8MT5BQ", pairUrl: "http://localhost/store-1/escaner?codigo=8MT5BQ", expiresAt: new Date(Date.now() + 600_000).toISOString() };

/**
 * El camino que Paula usa de verdad y que ninguna prueba recorría: la lectura
 * entra por el celular vinculado, no por la cámara local ni por el teclado.
 *
 * La comprobación en producción del lote anterior se hizo sobre Movimientos
 * —una pantalla que por diseño resuelve y espera un clic—, así que el
 * «se agrega solo» de Vender por celular nunca se ejerció de punta a punta.
 * Aquí se ejerce entero: consulta del escáner → entrega al botón → búsqueda
 * por código → línea en la venta, sin un solo clic.
 */
describe("una lectura del celular vinculado en Vender", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRemoteScannerControllers();
    resetScanFeedback();
    window.localStorage.clear();
    http.post.mockReset().mockResolvedValue({ data: sesion });
    // El celular ya quedó vinculado antes: la sesión vive en `sessionStorage`
    // y el controlador la recupera al montar. Así no hace falta abrir la
    // ventana de vinculación, que al ser modal saca la casilla del árbol de
    // accesibilidad y no representa el momento que se quiere probar: Paula
    // con el celular ya vinculado, escaneando.
    window.sessionStorage.setItem(
      "pdepapel:escaner:store-1",
      JSON.stringify({ code: sesion.code, pairUrl: sesion.pairUrl, expiresAt: sesion.expiresAt, cursor: null }),
    );
    http.delete.mockReset().mockResolvedValue({ data: {} });
    http.get.mockReset().mockImplementation(async (url: string) => {
      if (url.includes("/products/search")) {
        const q = new URL(url, "https://x").searchParams.get("q") ?? "";
        // El catálogo por defecto trae el producto, igual que en el mostrador.
        const filas = !q || q === QR || PRODUCTO.sku.toLowerCase() === q.toLowerCase() ? [PRODUCTO] : [];
        return { data: { data: filas, metadata: { total: filas.length, truncated: false } } };
      }
      if (url.includes("/scanner-sessions/")) {
        return {
          data: {
            code: sesion.code,
            status: "paired",
            deviceLabel: "iPhone · Safari",
            pairedAt: new Date().toISOString(),
            expiresAt: sesion.expiresAt,
            scans: [{ id: "s-1", code: QR, createdAt: "2026-09-22T01:11:07.741Z" }],
          },
        };
      }
      return { data: {} };
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  async function montar() {
    const onAdd = vi.fn<(line: SellLine) => void>();
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SaleSearch onAdd={onAdd} />
      </SWRConfig>,
    );
    // El botón de escanear se registra como destino y la consulta arranca.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    return onAdd;
  }

  /** Deja que la consulta entregue la lectura y que se asiente todo lo async. */
  async function dejarLlegarLaLectura() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REMOTE_SCAN_POLL_MS + 500);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
  }

  it("se agrega sola a la venta, sin ningún clic", async () => {
    const onAdd = await montar();

    await dejarLlegarLaLectura();

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ productId: PRODUCTO.id, quantity: 1, price: 1500 }),
    );
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  /**
   * La causa real de «aparece pero hay que pulsarlo»: tras agregar se
   * devolvía el foco a la casilla y el foco abría la lista del catálogo, con
   * el producto escaneado dentro. Pulsar esa fila sumaba una segunda unidad.
   */
  it("no deja una lista de resultados encima invitando al clic", async () => {
    const onAdd = await montar();
    await dejarLlegarLaLectura();

    // Primero: que de verdad se agregó (si no, lo de abajo sería trivial).
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("la casilla queda enfocada y vacía, lista para el siguiente código", async () => {
    const onAdd = await montar();
    await dejarLlegarLaLectura();

    expect(onAdd).toHaveBeenCalledTimes(1);
    const casilla = screen.getByRole("combobox");
    expect(casilla).toHaveFocus();
    expect(casilla).toHaveValue("");
  });
});
