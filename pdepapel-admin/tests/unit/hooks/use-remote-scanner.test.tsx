// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("axios", () => ({ default: { ...http, isAxiosError: () => false } }));

import { resetRemoteScannerControllers, useRemoteScanner } from "@/hooks/use-remote-scanner";
import { REMOTE_SCAN_ACTIVE_POLL_MS, REMOTE_SCAN_POLL_MS } from "@/lib/scanner-pairing";
import { scanAccepted, scanRejected } from "@/lib/scan-outcome";

function Target({ id, onScan }: { id: string; onScan: (code: string) => unknown }) {
  const remote = useRemoteScanner("store-1", onScan);
  return (
    <div>
      <span data-testid={`${id}-status`}>{remote.status}</span>
      <span data-testid={`${id}-last`}>{remote.lastScan ? `${remote.lastScan.label ?? "—"}|${String(remote.lastScan.ok)}` : "nada"}</span>
      <span data-testid={`${id}-receiving`}>{String(remote.receiving)}</span>
      <button type="button" onClick={() => void remote.start()}>
        {id}-start
      </button>
      <button type="button" onClick={() => remote.claim()}>
        {id}-claim
      </button>
    </div>
  );
}

const session = { code: "K7P4Q2", pairUrl: "http://localhost/store-1/escaner?codigo=K7P4Q2", expiresAt: new Date(Date.now() + 600_000).toISOString() };
const status = (overrides: Record<string, unknown>) => ({
  data: { code: "K7P4Q2", status: "waiting", deviceLabel: null, pairedAt: null, expiresAt: session.expiresAt, scans: [], ...overrides },
});

/**
 * La pantalla pregunta cada 1,5 s. Una lectura nueva llega al botón que
 * recibe, una sola vez, y la siguiente consulta pide solo lo posterior.
 */
describe("useRemoteScanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRemoteScannerControllers();
    window.sessionStorage.clear();
    http.post.mockReset().mockResolvedValue({ data: session });
    http.get.mockReset().mockResolvedValue(status({}));
    http.delete.mockReset().mockResolvedValue({ data: { status: "revoked" } });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("polls, delivers a new scan once and advances the cursor", async () => {
    const onScan = vi.fn();
    render(<Target id="a" onScan={onScan} />);
    await act(async () => {
      screen.getByText("a-start").click();
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(http.post).toHaveBeenCalledWith("/api/store-1/scanner-sessions");
    expect(screen.getByTestId("a-status").textContent).toBe("waiting");

    http.get.mockResolvedValueOnce(
      status({ status: "paired", deviceLabel: "iPhone · Safari", pairedAt: new Date().toISOString(), scans: [{ id: "s1", code: "CAR-1", createdAt: "2026-09-19T12:00:00.500Z" }] }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith("CAR-1");
    expect(screen.getByTestId("a-status").textContent).toBe("paired");

    // La siguiente consulta pide lo posterior a la última lectura y no la repite.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    const lastCall = http.get.mock.calls.at(-1)!;
    expect(lastCall[1]).toEqual({ params: { after: "2026-09-19T12:00:00.500Z" } });
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.sessionStorage.getItem("pdepapel:escaner:store-1") ?? "{}")).toMatchObject({ code: "K7P4Q2", cursor: "2026-09-19T12:00:00.500Z" });
  });

  it("delivers to the first mounted button until another one claims the phone, and stops polling on unlink", async () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <>
        <Target id="a" onScan={first} />
        <Target id="b" onScan={second} />
      </>,
    );
    await act(async () => {
      screen.getByText("a-start").click();
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByTestId("a-receiving").textContent).toBe("true");
    expect(screen.getByTestId("b-receiving").textContent).toBe("false");

    http.get.mockResolvedValueOnce(status({ status: "paired", scans: [{ id: "s1", code: "ONE", createdAt: "2026-09-19T12:00:00.000Z" }] }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect(first).toHaveBeenCalledWith("ONE");
    expect(second).not.toHaveBeenCalled();

    await act(async () => {
      screen.getByText("b-claim").click();
    });
    http.get.mockResolvedValueOnce(status({ status: "paired", scans: [{ id: "s2", code: "TWO", createdAt: "2026-09-19T12:00:01.000Z" }] }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect(second).toHaveBeenCalledWith("TWO");
    expect(first).toHaveBeenCalledTimes(1);

    const calls = http.get.mock.calls.length;
    await act(async () => {
      // «Desvincular»: DELETE y fin de la consulta.
      const { getRemoteScannerController } = await import("@/hooks/use-remote-scanner");
      await getRemoteScannerController("store-1").stop();
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(http.delete).toHaveBeenCalledWith("/api/store-1/scanner-sessions/K7P4Q2");
    expect(http.get.mock.calls.length).toBe(calls);
    expect(screen.getByTestId("a-status").textContent).toBe("idle");
  });

  /**
   * La ventana de vinculación enseñaba el código crudo (`PDP:<uuid>`), que no
   * le dice nada a nadie y era lo único visible mientras la ventana tapaba la
   * venta. La pantalla que recibe la lectura ya resuelve el producto, así que
   * devuelve el nombre y aquí solo se guarda: sin repetir la búsqueda.
   */
  describe("el nombre de la última lectura", () => {
    async function vincularYLeer(onScan: (code: string) => unknown) {
      render(<Target id="a" onScan={onScan} />);
      await act(async () => {
        screen.getByText("a-start").click();
        await vi.advanceTimersByTimeAsync(10);
      });
      http.get.mockResolvedValueOnce(status({ status: "paired", scans: [{ id: "s1", code: "PDP:p-1", createdAt: "2026-09-21T12:00:00.000Z" }] }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(REMOTE_SCAN_POLL_MS + 100);
      });
    }

    it("se queda con el nombre que resolvió la pantalla", async () => {
      await vincularYLeer(() => scanAccepted("Guillotina cortes circulares"));
      expect(screen.getByTestId("a-last").textContent).toBe("Guillotina cortes circulares|true");
    });

    it("una lectura rechazada queda marcada como tal", async () => {
      await vincularYLeer(() => scanRejected());
      expect(screen.getByTestId("a-last").textContent).toBe("—|false");
    });

    it("la pantalla que no contesta deja el código, que es lo único que se sabe", async () => {
      await vincularYLeer(() => undefined);
      expect(screen.getByTestId("a-last").textContent).toBe("—|true");
    });

    /**
     * Una pantalla que revienta no puede tumbar la consulta: si lo hiciera, el
     * celular dejaría de entregar y no habría forma de saber por qué.
     */
    it("una pantalla que revienta no detiene el escáner", async () => {
      await vincularYLeer(() => {
        throw new Error("sin red");
      });
      expect(screen.getByTestId("a-last").textContent).toBe("—|false");
      expect(screen.getByTestId("a-status").textContent).toBe("paired");
    });
  });

  /**
   * Con el celular vinculado se consulta más seguido: ahí es donde se nota la
   * espera entre leer y ver la unidad en la venta. Mientras solo se espera el
   * emparejamiento no hay nada que correr.
   */
  describe("el ritmo de la consulta", () => {
    it("va lento esperando y rápido con el celular vinculado", async () => {
      render(<Target id="a" onScan={() => undefined} />);
      await act(async () => {
        screen.getByText("a-start").click();
        await vi.advanceTimersByTimeAsync(10);
      });

      const esperando = http.get.mock.calls.length;
      await act(async () => void (await vi.advanceTimersByTimeAsync(REMOTE_SCAN_ACTIVE_POLL_MS + 50)));
      // Todavía sin vincular: a ese paso no ha tocado consultar otra vez.
      expect(http.get.mock.calls.length).toBe(esperando);

      http.get.mockResolvedValue(status({ status: "paired" }));
      await act(async () => void (await vi.advanceTimersByTimeAsync(REMOTE_SCAN_POLL_MS)));
      expect(screen.getByTestId("a-status").textContent).toBe("paired");

      const vinculado = http.get.mock.calls.length;
      await act(async () => void (await vi.advanceTimersByTimeAsync(REMOTE_SCAN_ACTIVE_POLL_MS + 50)));
      expect(http.get.mock.calls.length).toBeGreaterThan(vinculado);
    });
  });
});
