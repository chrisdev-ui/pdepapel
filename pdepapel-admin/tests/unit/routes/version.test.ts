import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, dynamic } from "@/app/api/version/route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/version", () => {
  it("devuelve solo el commit desplegado y nunca se guarda en caché", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc123");
    const response = await GET();
    expect(await response.json()).toEqual({ sha: "abc123" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(dynamic).toBe("force-dynamic");
  });

  it("sin commit (desarrollo local) responde null", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    const response = await GET();
    expect(await response.json()).toEqual({ sha: null });
  });
});
