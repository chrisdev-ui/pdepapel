// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios, { type AxiosAdapter } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ViewerAccessProvider } from "@/components/shell/viewer-access";
import { VersionGuard } from "@/components/shell/version-guard";
import api from "@/lib/api";
import { useVersionGuard } from "@/lib/version-guard";

const navigation = vi.hoisted(() => ({ pathname: "/store-1/productos" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

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
  navigation.pathname = "/store-1/productos";
  useVersionGuard.setState({ stale: false, staleAtPath: null, reload });
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
    expect(await screen.findByText("Hay una versión nueva del panel. Se carga sola al cambiar de pantalla.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Recargar" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("no avisa con la misma versión", async () => {
    deployedSha = "sha-viejo";
    renderGuard();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(screen.queryByText(/Hay una versión nueva/)).toBeNull();
  });

  it("en desarrollo local, sin commit propio, ni siquiera consulta", async () => {
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

describe("con una versión vieja nada se frena", () => {
  it("las escrituras (axios, lib/api y fetch) salen al instante, sin preguntar", async () => {
    renderGuard();
    await screen.findByText(/Hay una versión nueva/);

    await axios.patch("/api/store-1/products/p-1", { name: "Nuevo" });
    await api.delete("/store-1/products/bulk");
    await window.fetch("/api/store-1/shipments/s-1", { method: "PATCH" });
    expect(panelWrites).toEqual(["PATCH /api/store-1/products/p-1", "DELETE /api/store-1/products/bulk", "PATCH /api/store-1/shipments/s-1"]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it("al pasar a otra pantalla recarga entera; cambiar filtros en la misma no", async () => {
    navigation.pathname = "/store-1/pedidos";
    const view = renderGuard();
    await screen.findByText(/Hay una versión nueva/);
    expect(useVersionGuard.getState().staleAtPath).toBe("/store-1/pedidos");

    navigation.pathname = "/store-1/pedidos";
    view.rerender(
      <ViewerAccessProvider role={null}>
        <VersionGuard buildSha="sha-viejo" />
      </ViewerAccessProvider>,
    );
    expect(reload).not.toHaveBeenCalled();

    navigation.pathname = "/store-1/productos";
    view.rerender(
      <ViewerAccessProvider role={null}>
        <VersionGuard buildSha="sha-viejo" />
      </ViewerAccessProvider>,
    );
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });
});
