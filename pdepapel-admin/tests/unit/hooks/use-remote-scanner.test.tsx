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

function Target({ id, onScan }: { id: string; onScan: (code: string) => void }) {
  const remote = useRemoteScanner("store-1", onScan);
  return (
    <div>
      <span data-testid={`${id}-status`}>{remote.status}</span>
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
});
