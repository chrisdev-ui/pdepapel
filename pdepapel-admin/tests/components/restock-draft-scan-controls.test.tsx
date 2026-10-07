// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  catalog: {
    "MAR-12": { id: "p-mar", name: "Marcadores Super Golden x12", sku: "MAR-12", stock: 6, price: 39000, acqPrice: 21000, images: [] },
    "CAR-AZU": { id: "p-car", name: "Carpeta Archivadora Fashion Pastel Azul pastel", sku: "CAR-AZU", stock: 2, price: 18000, acqPrice: 9500, images: [] },
  } as Record<string, { id: string; name: string; sku: string; stock: number; price: number; acqPrice: number; images: [] }>,
}));

vi.mock("axios", () => ({ default: { ...mocks.http, isAxiosError: () => false } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1", restockOrderId: "nuevo" }), useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("qrcode.react", () => ({ QRCodeSVG: () => <svg /> }));
vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    decodeFromStream = vi.fn().mockResolvedValue({ stop: vi.fn() });
  },
}));
// La búsqueda por código se prueba en su propio archivo; aquí importa a qué línea llega.
vi.mock("@/hooks/use-product-scan-lookup", () => ({
  useProductScanLookup: () => ({ resolve: async (code: string) => mocks.catalog[code] ?? null }),
}));
vi.mock("@/components/ui/async-product-select", () => ({
  AsyncProductSelect: ({ value, ariaLabel }: { value: string; ariaLabel?: string }) => <output aria-label={ariaLabel}>{value}</output>,
}));

import { RestockOrderDraftForm } from "@/app/(dashboard)/[storeId]/(routes)/aprovisionamiento/[restockOrderId]/components/restock-order-draft-form";
import { resetRemoteScannerControllers } from "@/hooks/use-remote-scanner";
import { resetScanFeedback } from "@/hooks/use-scan-feedback";
import { REMOTE_SCAN_POLL_MS } from "@/lib/scanner-pairing";

const SESSION = { code: "8MT5BQ", pairUrl: "http://localhost/store-1/escaner?codigo=8MT5BQ", expiresAt: new Date(Date.now() + 600_000).toISOString() };
const suppliers = [{ id: "s1", name: "Proveedor", leadTimeDays: null }];

let pendingScans: { id: string; code: string; createdAt: string }[] = [];

beforeEach(() => {
  resetRemoteScannerControllers();
  resetScanFeedback();
  window.localStorage.clear();
  window.sessionStorage.clear();
  pendingScans = [];
  mocks.toast.mockReset();
  mocks.http.get.mockReset().mockImplementation(async (url: string) => {
    if (url.includes("/scanner-sessions/")) {
      const scans = pendingScans;
      pendingScans = [];
      return { data: { code: SESSION.code, status: "paired", deviceLabel: "iPhone · Safari", pairedAt: new Date().toISOString(), expiresAt: SESSION.expiresAt, scans } };
    }
    return { data: {} };
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.sessionStorage.clear();
});

const addLines = (count: number) => {
  for (let i = 0; i < count; i += 1) fireEvent.click(screen.getByRole("button", { name: "Agregar producto" }));
};

/**
 * Issue #2: el texto «Escanear producto de la línea N» se pintaba desde `sm`
 * y, con el sonido y el celular repetidos en cada línea, dejaba el selector
 * de producto en 34 px. Ahora cada línea lleva solo el icono de la cámara y
 * el sonido y el celular viven una vez en la cabecera de «Líneas del pedido».
 */
describe("Aprovisionamiento · controles de escaneo de las líneas", () => {
  it("keeps the per-line accessible name without painting it as text", () => {
    render(<RestockOrderDraftForm initialData={null} suppliers={suppliers} />);
    addLines(2);

    const scan = screen.getByRole("button", { name: "Escanear producto de la línea 2" });
    expect(scan.textContent?.trim()).toBe("");
    expect(scan).toHaveAttribute("title", "Escanear producto de la línea 2");
    expect(screen.queryByText("Escanear producto de la línea 2")).toBeNull();
  });

  it("renders the sound and linked-phone toggles once, in the section header, whatever the number of lines", () => {
    render(<RestockOrderDraftForm initialData={null} suppliers={suppliers} />);
    addLines(3);

    expect(screen.getAllByRole("button", { name: /Escanear producto de la línea/ })).toHaveLength(3);
    const mute = screen.getAllByRole("button", { name: /sonido al escanear/ });
    const phone = screen.getAllByRole("button", { name: /celular/i });
    expect(mute).toHaveLength(1);
    expect(phone).toHaveLength(1);

    const header = document.getElementById("lineas-titulo")?.parentElement?.parentElement as HTMLElement;
    expect(within(header).getByRole("button", { name: /sonido al escanear/ })).toBe(mute[0]);
    expect(within(header).getByRole("button", { name: /celular/i })).toBe(phone[0]);
    // Ninguna línea repite los controles.
    document.querySelectorAll("[data-line-row]").forEach((row) => {
      expect(within(row as HTMLElement).queryByRole("button", { name: /sonido|celular/i })).toBeNull();
    });
  });

  it("sends linked-phone reads to the order: fills the first empty line, adds a unit to a repeated product, opens a new line otherwise", async () => {
    vi.useFakeTimers();
    window.sessionStorage.setItem("pdepapel:escaner:store-1", JSON.stringify({ ...SESSION, cursor: null }));
    render(<RestockOrderDraftForm initialData={null} suppliers={suppliers} />);
    addLines(1);

    const deliver = async (code: string, id: string) => {
      pendingScans = [{ id, code, createdAt: new Date().toISOString() }];
      await act(async () => {
        await vi.advanceTimersByTimeAsync(REMOTE_SCAN_POLL_MS + 50);
      });
    };

    await deliver("MAR-12", "scan-1");
    expect(screen.getByLabelText("Producto de la línea 1").textContent).toBe("p-mar");
    expect(screen.getByLabelText("Costo unitario de la línea 1")).toHaveDisplayValue(/21[.,]000/);

    await deliver("MAR-12", "scan-2");
    expect(screen.getAllByLabelText(/^Producto de la línea/)).toHaveLength(1);
    expect(screen.getByLabelText("Cantidad de la línea 1")).toHaveDisplayValue("2");

    await deliver("CAR-AZU", "scan-3");
    expect(screen.getByLabelText("Producto de la línea 2").textContent).toBe("p-car");
    expect(screen.getByLabelText("Cantidad de la línea 2")).toHaveDisplayValue("1");
    expect(screen.getByLabelText("Costo unitario de la línea 2")).toHaveDisplayValue(/9[.,]500/);
  });

  /**
   * Cada lectura del celular avisa qué entró y con cuántas unidades quedó la
   * línea, con «Deshacer» para revertir justo esa lectura (decisión de
   * Christian sobre #2): desde el celular no se ve el formulario.
   */
  describe("aviso y «Deshacer» de cada lectura", () => {
    const setup = async () => {
      vi.useFakeTimers();
      window.sessionStorage.setItem("pdepapel:escaner:store-1", JSON.stringify({ ...SESSION, cursor: null }));
      render(<RestockOrderDraftForm initialData={null} suppliers={suppliers} />);
      let n = 0;
      return async (code: string) => {
        n += 1;
        pendingScans = [{ id: `scan-${n}`, code, createdAt: new Date().toISOString() }];
        await act(async () => {
          await vi.advanceTimersByTimeAsync(REMOTE_SCAN_POLL_MS + 50);
        });
        const call = mocks.toast.mock.calls.filter((c) => c[0]?.action).at(-1)?.[0];
        return call as { title: string; description: string; action: { props: { onClick: () => void; altText: string } } };
      };
    };
    const undo = (aviso: { action: { props: { onClick: () => void } } }) => act(() => aviso.action.props.onClick());
    const productos = () => screen.queryAllByLabelText(/^Producto de la línea/).map((el) => el.textContent);

    it("fill: llena la primera línea vacía, avisa «ahora 1» y Deshacer la vacía con su costo de antes", async () => {
      const deliver = await setup();
      addLines(1);
      const aviso = await deliver("MAR-12");
      expect(aviso.title).toBe("+1 Marcadores Super Golden x12 — ahora 1");
      expect(aviso.action.props.altText).toMatch(/Deshacer la lectura de Marcadores/);
      expect(productos()).toEqual(["p-mar"]);

      await undo(aviso);
      expect(productos()).toEqual([""]);
      expect(screen.getByLabelText("Costo unitario de la línea 1")).toHaveDisplayValue(/^\$?\s?0$/);
    });

    it("increment: suma una unidad, avisa la cantidad nueva y Deshacer quita solo esa unidad", async () => {
      const deliver = await setup();
      addLines(1);
      await deliver("MAR-12");
      await deliver("MAR-12");
      const tercera = await deliver("MAR-12");
      expect(tercera.title).toBe("+1 Marcadores Super Golden x12 — ahora 3");
      expect(screen.getByLabelText("Cantidad de la línea 1")).toHaveDisplayValue("3");

      await undo(tercera);
      expect(screen.getByLabelText("Cantidad de la línea 1")).toHaveDisplayValue("2");
      expect(productos()).toEqual(["p-mar"]);
    });

    it("add: abre una línea nueva cuando no hay vacías y Deshacer la quita", async () => {
      const deliver = await setup();
      addLines(1);
      await deliver("MAR-12");
      const aviso = await deliver("CAR-AZU");
      expect(aviso.title).toBe("+1 Carpeta Archivadora Fashion Pastel Azul pastel — ahora 1");
      expect(aviso.description).toBe("Línea 2 del pedido.");
      expect(productos()).toEqual(["p-mar", "p-car"]);

      await undo(aviso);
      expect(productos()).toEqual(["p-mar"]);
      expect(screen.getByLabelText("Cantidad de la línea 1")).toHaveDisplayValue("1");
    });

    it("Deshacer después de otras lecturas revierte solo la suya", async () => {
      const deliver = await setup();
      addLines(1);
      const primera = await deliver("MAR-12");
      await deliver("CAR-AZU");
      await deliver("MAR-12");

      await undo(primera);
      expect(productos()).toEqual(["p-mar", "p-car"]);
      expect(screen.getByLabelText("Cantidad de la línea 1")).toHaveDisplayValue("1");
      expect(screen.getByLabelText("Cantidad de la línea 2")).toHaveDisplayValue("1");
    });
  });
});
