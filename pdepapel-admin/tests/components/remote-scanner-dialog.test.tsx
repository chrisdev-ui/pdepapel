// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RemoteScannerDialog } from "@/components/ui/remote-scanner-dialog";
import type { RemoteScanner } from "@/hooks/use-remote-scanner";
import { PAIRED_DIALOG_AUTOCLOSE_MS } from "@/lib/scanner-pairing";

const base = {
  status: "waiting" as RemoteScanner["status"],
  code: "K7P4Q2",
  pairUrl: "http://localhost/store-1/escaner?codigo=K7P4Q2",
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
  deviceLabel: null,
  pairedAt: null,
  lastScan: null,
  activeTargetId: "uno",
  error: null,
  enabled: true,
  receiving: true,
  start: vi.fn(),
  stop: vi.fn(),
  claim: vi.fn(),
};

const remote = (overrides: Partial<RemoteScanner> = {}) => ({ ...base, ...overrides }) as RemoteScanner;

/**
 * La ventana de vincular el celular es modal y con velo: mientras está
 * abierta tapa la venta entera. Se quedaba abierta hasta que alguien pulsara
 * «Cerrar», así que se escaneaba contra un fondo oscuro —la unidad entraba,
 * pero no se veía— y parecía que el escáner no hacía nada.
 */
describe("la ventana de vincular el celular", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("al vincular se cierra sola, dejando ver un momento que quedó vinculado", () => {
    const onOpenChange = vi.fn();
    const view = render(<RemoteScannerDialog open onOpenChange={onOpenChange} remote={remote()} />);

    // Esperando: no se cierra nada.
    act(() => void vi.advanceTimersByTime(5000));
    expect(onOpenChange).not.toHaveBeenCalled();

    view.rerender(<RemoteScannerDialog open onOpenChange={onOpenChange} remote={remote({ status: "paired", deviceLabel: "iPhone" })} />);
    // El estado «vinculado» se alcanza a leer antes de salir.
    expect(screen.getByText("Celular vinculado")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(PAIRED_DIALOG_AUTOCLOSE_MS - 100));
    expect(onOpenChange).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(200));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  /** Si se vuelve a abrir a mano, se queda: para eso se abrió. */
  it("reabrirla a mano ya no la cierra sola", () => {
    const onOpenChange = vi.fn();
    const vinculado = remote({ status: "paired", deviceLabel: "iPhone" });
    const view = render(<RemoteScannerDialog open onOpenChange={onOpenChange} remote={vinculado} />);
    act(() => void vi.advanceTimersByTime(PAIRED_DIALOG_AUTOCLOSE_MS + 100));
    expect(onOpenChange).toHaveBeenCalledTimes(1);

    view.rerender(<RemoteScannerDialog open={false} onOpenChange={onOpenChange} remote={vinculado} />);
    view.rerender(<RemoteScannerDialog open onOpenChange={onOpenChange} remote={vinculado} />);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(onOpenChange).toHaveBeenCalledTimes(1);
  });

  it("los botones de siempre siguen ahí", () => {
    const onOpenChange = vi.fn();
    const stop = vi.fn();
    render(<RemoteScannerDialog open onOpenChange={onOpenChange} remote={remote({ status: "paired", stop })} />);

    act(() => void screen.getByText("Desvincular").click());
    expect(stop).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  describe("la última lectura", () => {
    const scan = { id: "s-1", code: "PDP:fc555542-87dc-45db-8c0c-54ff366b0a51", createdAt: new Date().toISOString() };

    it("mientras se resuelve enseña el código, que es lo único que se sabe", () => {
      render(<RemoteScannerDialog open onOpenChange={vi.fn()} remote={remote({ status: "paired", lastScan: scan })} />);
      expect(screen.getByText(scan.code)).toBeInTheDocument();
    });

    /**
     * Un `PDP:<uuid>` no le dice nada a nadie, y era lo único que se veía
     * mientras la ventana tapaba la venta. En cuanto la pantalla resuelve el
     * producto, manda el nombre.
     */
    it("resuelto, manda el nombre del producto y deja el código de apoyo", () => {
      render(
        <RemoteScannerDialog
          open
          onOpenChange={vi.fn()}
          remote={remote({ status: "paired", lastScan: { ...scan, label: "Guillotina cortes circulares", ok: true } })}
        />,
      );
      expect(screen.getByText("Guillotina cortes circulares")).toBeInTheDocument();
      expect(screen.getByText(scan.code)).toBeInTheDocument();
      expect(document.querySelector('[data-last-scan="accepted"]')).not.toBeNull();
    });

    it("rechazada, lo dice en vez de dejarlo en un código con pinta de correcto", () => {
      render(
        <RemoteScannerDialog open onOpenChange={vi.fn()} remote={remote({ status: "paired", lastScan: { ...scan, label: null, ok: false } })} />,
      );
      expect(screen.getByText(/No se reconoció/)).toBeInTheDocument();
      expect(document.querySelector('[data-last-scan="rejected"]')).not.toBeNull();
    });
  });
});
