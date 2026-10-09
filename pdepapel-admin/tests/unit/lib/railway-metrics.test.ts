import { describe, expect, it, vi } from "vitest";

import { readMysqlContainerMemory } from "@/lib/railway-metrics";

const NOW = new Date("2026-10-10T13:00:00.000Z");
const TOKEN = "railway-project-token-value";
const ts = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

function fakeFetch(metrics: { measurement: string; values: { ts: number; value: number }[] }[]) {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { query: string };
    const data = body.query.includes("projectToken")
      ? {
          projectToken: {
            projectId: "project-1",
            environmentId: "env-1",
            project: { services: { edges: [{ node: { id: "old", name: "MySQL Database" } }, { node: { id: "svc-east", name: "MySQL US East" } }] } },
          },
        }
      : { metrics };
    return new Response(JSON.stringify({ data }), { status: 200, headers: { "content-type": "application/json" } });
  });
}

describe("memoria del contenedor de MySQL en Railway", () => {
  it("sin token no consulta nada y lo dice", async () => {
    const fetch = vi.fn();
    expect(await readMysqlContainerMemory({ token: undefined, fetch, now: NOW })).toEqual({ ok: false, reason: "sin lectura de Railway (falta RAILWAY_METRICS_TOKEN)" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("lee el valor actual, el de hace 24 h y el límite del servicio «MySQL US East»", async () => {
    const fetch = fakeFetch([
      { measurement: "MEMORY_USAGE_GB", values: [{ ts: ts("2026-10-09T12:55:00Z"), value: 0.46 }, { ts: ts("2026-10-09T13:00:00Z"), value: 0.5 }, { ts: ts("2026-10-10T12:55:00Z"), value: 0.62 }] },
      { measurement: "MEMORY_LIMIT_GB", values: [{ ts: ts("2026-10-10T12:55:00Z"), value: 8 }] },
    ]);
    const result = await readMysqlContainerMemory({ token: TOKEN, fetch, now: NOW });
    expect(result).toEqual({ ok: true, currentGb: 0.62, limitGb: 8, dayAgoGb: 0.46, growthGb: expect.closeTo(0.16, 5), at: new Date("2026-10-10T12:55:00Z") });
    const [url, init] = fetch.mock.calls[1];
    expect(url).toBe("https://backboard.railway.com/graphql/v2");
    expect((init.headers as Record<string, string>)["Project-Access-Token"]).toBe(TOKEN);
    expect(JSON.parse(String(init.body)).variables).toMatchObject({ projectId: "project-1", environmentId: "env-1", serviceId: "svc-east" });
  });

  it("si no hay dato de hace 24 h (reinicio o servicio nuevo) no inventa el crecimiento", async () => {
    const fetch = fakeFetch([
      { measurement: "MEMORY_USAGE_GB", values: [{ ts: ts("2026-10-10T12:50:00Z"), value: 0.4 }] },
      { measurement: "MEMORY_LIMIT_GB", values: [] },
    ]);
    expect(await readMysqlContainerMemory({ token: TOKEN, fetch, now: NOW })).toMatchObject({ ok: true, currentGb: 0.4, limitGb: null, dayAgoGb: null, growthGb: null });
  });

  it("un error de Railway no tumba la revisión y nunca muestra el token", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: `Not Authorized for ${TOKEN}` }] }), { status: 200 }));
    const result = await readMysqlContainerMemory({ token: TOKEN, fetch, now: NOW });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect((result as { reason: string }).reason).toMatch(/^sin lectura de Railway/);

    const down = vi.fn(async () => { throw new Error("fetch failed"); });
    expect(await readMysqlContainerMemory({ token: TOKEN, fetch: down, now: NOW })).toEqual({ ok: false, reason: "sin lectura de Railway (fetch failed)" });
  });

  it("si el servicio no aparece con su nombre, lo dice", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: { projectToken: { projectId: "p", environmentId: "e", project: { services: { edges: [] } } } } })));
    expect(await readMysqlContainerMemory({ token: TOKEN, fetch, now: NOW })).toEqual({ ok: false, reason: "sin lectura de Railway (no aparece el servicio «MySQL US East»)" });
  });
});
