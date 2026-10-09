// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import axios, { type AxiosAdapter } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import { ReadOnlyGuard } from "@/components/shell/read-only-guard";
import { ViewerAccessProvider } from "@/components/shell/viewer-access";
import api from "@/lib/api";

let sent: string[] = [];

function renderGuard(role: "viewer" | null) {
  render(
    <ViewerAccessProvider role={role}>
      <ReadOnlyGuard />
    </ViewerAccessProvider>,
  );
}

beforeEach(() => {
  sent = [];
  toast.mockReset();
  const adapter: AxiosAdapter = async (config) => {
    sent.push(`${(config.method ?? "get").toUpperCase()} ${config.baseURL ?? ""}${config.url}`);
    return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config };
  };
  axios.defaults.adapter = adapter;
  api.defaults.adapter = adapter;
});
afterEach(cleanup);

describe("guarda de solo lectura", () => {
  it("corta las acciones masivas (instancia de lib/api) con el mismo aviso", async () => {
    renderGuard("viewer");
    await expect(api.delete("/store-1/products/bulk")).rejects.toMatchObject({ readOnlyBlocked: true });
    expect(sent).toEqual([]);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Solo lectura" }));
  });

  it("corta también las escrituras con axios global", async () => {
    renderGuard("viewer");
    await expect(axios.patch("/api/store-1/products/p-1", {})).rejects.toMatchObject({ readOnlyBlocked: true });
    expect(sent).toEqual([]);
  });

  it("deja pasar las lecturas de una cuenta de solo lectura", async () => {
    renderGuard("viewer");
    await api.get("/store-1/products");
    expect(sent).toEqual(["GET /api/store-1/products"]);
  });

  it("la dueña escribe igual que siempre", async () => {
    renderGuard(null);
    await api.delete("/store-1/products/bulk");
    expect(sent).toEqual(["DELETE /api/store-1/products/bulk"]);
    expect(toast).not.toHaveBeenCalled();
  });
});
