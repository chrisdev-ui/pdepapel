import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { MONITOREO_PUSH_SECRET: undefined as string | undefined },
  findStore: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: mocks.env }));
vi.mock("@/lib/prismadb", () => ({ default: { store: { findUnique: mocks.findStore } } }));
vi.mock("@/lib/web-push", () => ({ sendWebPushToStore: mocks.send }));

import { POST } from "@/app/api/[storeId]/monitoring/alert/route";

const SECRET = "s".repeat(40);
const call = (body: unknown, token?: string) =>
  POST(
    new Request("https://admin.example/api/store-1/monitoring/alert", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: { storeId: "store-1" } },
  );

describe("POST /api/[storeId]/monitoring/alert", () => {
  beforeEach(() => {
    mocks.env.MONITOREO_PUSH_SECRET = SECRET;
    mocks.findStore.mockReset().mockResolvedValue({ id: "store-1" });
    mocks.send.mockReset().mockResolvedValue({ configured: true, devices: 1, delivered: 1, removed: 0, failed: 0 });
  });

  it("no existe sin el secreto configurado", async () => {
    mocks.env.MONITOREO_PUSH_SECRET = undefined;
    const res = await call({ title: "t", body: "b" }, SECRET);
    expect(res.status).toBe(404);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rechaza sin secreto o con uno equivocado, sin tocar la base", async () => {
    expect((await call({ title: "t", body: "b" })).status).toBe(403);
    expect((await call({ title: "t", body: "b" }, "x".repeat(40))).status).toBe(403);
    expect(mocks.findStore).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("valida el cuerpo y la tienda", async () => {
    expect((await call({ title: "", body: "b" }, SECRET)).status).toBe(400);
    expect((await call({ title: "t", body: "b".repeat(241) }, SECRET)).status).toBe(400);
    expect((await call({ title: "t", body: "b", tag: "Etiqueta Rara" }, SECRET)).status).toBe(400);
    mocks.findStore.mockResolvedValueOnce(null);
    expect((await call({ title: "t", body: "b" }, SECRET)).status).toBe(404);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("manda el push a la tienda con el enlace fijo al panel, ignorando cualquier url del cuerpo", async () => {
    const res = await call({ title: "Monitoreo", body: "2 problemas", tag: "monitoreo-diario-2026-11-02", url: "https://evil.example" }, SECRET);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ delivered: 1 });
    expect(mocks.send).toHaveBeenCalledWith("store-1", {
      title: "Monitoreo",
      body: "2 problemas",
      url: "/store-1",
      tag: "monitoreo-diario-2026-11-02",
    });
  });
});
