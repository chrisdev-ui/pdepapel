import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireStoreOwner: vi.fn() }));

vi.mock("@/lib/store-access", () => ({ requireStoreOwner: mocks.requireStoreOwner }));

import { POST } from "@/app/api/[storeId]/team-browser-link/route";
import { ErrorFactory } from "@/lib/api-errors";

const call = () => POST(new Request("https://admin.example.com/api/store-1/team-browser-link", { method: "POST" }), { params: { storeId: "store-1" } });

describe("POST /team-browser-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("REVALIDATION_SECRET", "secreto");
    vi.stubEnv("FRONTEND_STORE_URL", "https://papeleriapdepapel.com");
  });

  it("solo la dueña recibe el enlace", async () => {
    mocks.requireStoreOwner.mockRejectedValue(ErrorFactory.Unauthorized());
    const response = await call();
    expect(response.status).toBe(403);
  });

  it("devuelve el enlace firmado y el de quitar la marca, sin caché", async () => {
    mocks.requireStoreOwner.mockResolvedValue("owner");
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.markUrl).toMatch(/^https:\/\/papeleriapdepapel\.com\/equipo\?t=\d+\./);
    expect(body.unmarkUrl).toBe("https://papeleriapdepapel.com/equipo?salir=1");
    expect(mocks.requireStoreOwner).toHaveBeenCalledWith("store-1");
  });
});
