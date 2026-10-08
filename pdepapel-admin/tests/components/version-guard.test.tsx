// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axios, { type AxiosAdapter } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ViewerAccessProvider } from "@/components/shell/viewer-access";
import { VersionGuard } from "@/components/shell/version-guard";
import api from "@/lib/api";
import { useVersionGuard } from "@/lib/version-guard";

const reload = vi.fn();
const originalFetch = window.fetch;
let deployedSha = "sha-nuevo";
let panelWrites: string[] = [];
let fetchSpy: ReturnType<typeof vi.fn>;

function respond(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function renderGuard({ buildSha = "sha-viejo", role = null as "viewer" | null } = {}) {
  return render(
    <ViewerAccessProvider role={role}>
      <VersionGuard buildSha={buildSha} />
    </ViewerAccessProvider>,
  );
}

beforeEach(() => {
  reload.mockReset();
  deployedSha = "sha-nuevo";
  panelWrites = [];
  useVersionGuard.setState({ stale: false, acknowledged: false, prompt: null, reload });
  fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/api/version")) return respond({ sha: deployedSha });
    panelWrites.push(`${(init?.method ?? "GET").toUpperCase()} ${url}`);
    return respond({ ok: true });
  });
  window.fetch = fetchSpy as typeof window.fetch;
  const adapter: AxiosAdapter = async (config) => {
    panelWrites.push(`${(config.method ?? "get").toUpperCase()} ${config.baseURL ?? ""}${config.url}`);
    return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config };
  };
  axios.defaults.adapter = adapter;
  api.defaults.adapter = adapter;
});

afterEach(() => {
  cleanup();
  window.fetch = originalFetch;
  vi.useRealTimers();
});

describe("aviso de versión nueva del panel", () => {
  it("muestra el aviso fijo cuando el commit desplegado es otro, y «Recargar» recarga", async () => {
    renderGuard();
    expect(await screen.findByText("Hay una versión nueva del panel. Recarga para usarla")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Recargar" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("no avisa con la misma versión", async () => {
    deployedSha = "sha-viejo";
    renderGuard();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(screen.queryByText(/Hay una versión nueva/)).toBeNull();
  });

  it("en desarrollo local, sin commit propio, ni siquiera pregunta", async () => {
    renderGuard({ buildSha: "" });
    await act(async () => {});
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/Hay una versión nueva/)).toBeNull();
  });

  it("un error de /api/version no avisa nada", async () => {
    fetchSpy = vi.fn(async () => {
      throw new Error("sin red");
    });
    window.fetch = fetchSpy as typeof window.fetch;
    renderGuard();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(useVersionGuard.getState().stale).toBe(false);
  });

  it("vuelve a mirar al volver a la pestaña y cada cinco minutos", async () => {
    vi.useFakeTimers();
    deployedSha = "sha-viejo";
    renderGuard();
    await act(async () => {});
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    deployedSha = "sha-nuevo";
    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(useVersionGuard.getState().stale).toBe(true);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("antes de guardar con una versión vieja", () => {
  it("pregunta; «Continuar sin recargar» guarda y no vuelve a preguntar", async () => {
    renderGuard();
    await screen.findByText(/Hay una versión nueva/);

    const save = axios.patch("/api/store-1/products/p-1", { name: "Nuevo" });
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(panelWrites).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Continuar sin recargar" }));
    await expect(save).resolves.toMatchObject({ status: 200 });
    expect(panelWrites).toEqual(["PATCH /api/store-1/products/p-1"]);
    expect(reload).not.toHaveBeenCalled();

    await axios.delete("/api/store-1/products/p-2");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(panelWrites).toHaveLength(2);
  });

  it("«Recargar» no envía el cambio y recarga la página", async () => {
    renderGuard();
    await screen.findByText(/Hay una versión nueva/);

    const save = axios.post("/api/store-1/products", { name: "Nuevo" });
    save.catch(() => {});
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Recargar" }));

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(panelWrites).toEqual([]);
  });

  it("también cubre las escrituras con fetch a la API del panel, y deja pasar las lecturas", async () => {
    renderGuard();
    await screen.findByText(/Hay una versión nueva/);

    await window.fetch("/api/store-1/shipments");
    expect(panelWrites).toEqual(["GET /api/store-1/shipments"]);

    const write = window.fetch("/api/store-1/shipments/s-1", { method: "PATCH" });
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Continuar sin recargar" }));
    await write;
    expect(panelWrites).toEqual(["GET /api/store-1/shipments", "PATCH /api/store-1/shipments/s-1"]);
  });

  it("también cubre las acciones masivas, que usan la instancia de lib/api", async () => {
    renderGuard();
    await screen.findByText(/Hay una versión nueva/);

    const bulk = api.delete("/store-1/products/bulk");
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Continuar sin recargar" }));
    await bulk;
    expect(panelWrites).toEqual(["DELETE /api/store-1/products/bulk"]);
  });

  it("no pregunta nada a una cuenta de solo lectura", async () => {
    renderGuard({ role: "viewer" });
    await screen.findByText(/Hay una versión nueva/);
    await axios.patch("/api/store-1/products/p-1", {});
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
