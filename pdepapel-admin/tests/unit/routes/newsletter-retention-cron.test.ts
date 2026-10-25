import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ record: vi.fn(), deleteMany: vi.fn() }));

vi.mock("@/lib/env.mjs", () => ({ env: { CRON_SECRET: "cron-secret" } }));
vi.mock("@/lib/job-runs", () => ({ recordJobRun: mocks.record }));
vi.mock("@/lib/prismadb", () => ({ default: { newsletterSubscriber: { deleteMany: mocks.deleteMany } } }));

import { GET } from "@/app/api/cron/newsletter-retention/route";

const call = (secret?: string) =>
  GET(new NextRequest("https://admin.test/api/cron/newsletter-retention", { headers: secret ? { authorization: `Bearer ${secret}` } : {} }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteMany.mockResolvedValue({ count: 3 });
});

describe("cron newsletter-retention", () => {
  it("sin el secreto del cron no borra nada", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await call()).status).toBe(403);
    expect((await call("otro")).status).toBe(403);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("borra las pendientes vencidas y deja su fila en Sistemas", async () => {
    const response = await call("cron-secret");
    expect(response.status).toBe(200);
    expect(mocks.deleteMany.mock.calls[0][0].where.status).toBe("PENDING");
    expect(mocks.record).toHaveBeenCalledWith("newsletter-retention", {
      ok: true,
      detail: "3 alta(s) del boletín sin confirmar eliminadas (más de 7 días)",
    });
  });
});
