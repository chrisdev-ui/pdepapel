import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Crear una tienda exige autorización explícita del dueño
 * (`ADMIN_ALLOWED_USER_IDS`). Antes bastaba con tener ya una tienda, así que
 * cualquier dueña podía crear tiendas nuevas sin que nadie lo autorizara; la
 * única barrera real era que la lista estuviera vacía.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  storeCount: vi.fn(),
  storeFindFirst: vi.fn(),
  storeCreate: vi.fn(),
  storeFindMany: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/env.mjs", () => ({ env: new Proxy({}, { get: () => "test" }) }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    store: {
      count: mocks.storeCount,
      findFirst: mocks.storeFindFirst,
      create: mocks.storeCreate,
      findMany: mocks.storeFindMany,
    },
  },
}));

import { GET, POST } from "@/app/api/stores/route";

const OWNER = "user_owner";
const post = (body: unknown) =>
  POST(new Request("https://admin.test/api/stores", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/stores", () => {
  const originalAllowlist = process.env.ADMIN_ALLOWED_USER_IDS;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_ALLOWED_USER_IDS;
    mocks.auth.mockResolvedValue({ userId: OWNER });
    mocks.storeFindFirst.mockResolvedValue(null);
    mocks.storeCount.mockResolvedValue(1);
    mocks.storeCreate.mockResolvedValue({ id: "store-nueva", name: "Otra", createdAt: new Date("2026-09-19T12:00:00Z") });
  });

  afterEach(() => {
    if (originalAllowlist === undefined) delete process.env.ADMIN_ALLOWED_USER_IDS;
    else process.env.ADMIN_ALLOWED_USER_IDS = originalAllowlist;
  });

  it("rechaza a quien ya tiene una tienda pero no está en la lista (antes lo dejaba pasar)", async () => {
    const response = await post({ name: "Otra tienda" });
    expect(response.status).toBe(403);
    expect(mocks.storeCreate).not.toHaveBeenCalled();
    // Ni siquiera pregunta a la base si tiene tiendas: la lista es la única fuente.
    expect(mocks.storeCount).not.toHaveBeenCalled();
  });

  it("rechaza sin sesión", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await post({ name: "Otra" })).status).toBe(401);
    expect(mocks.storeCreate).not.toHaveBeenCalled();
  });

  it("deja crear a quien el dueño autorizó en la lista", async () => {
    process.env.ADMIN_ALLOWED_USER_IDS = OWNER;
    const response = await post({ name: "  Tienda nueva  " });
    expect(response.status).toBe(200);
    expect(mocks.storeCreate).toHaveBeenCalledWith({ data: { name: "Tienda nueva", userId: OWNER } });
  });

  it("sigue pidiendo nombre y sigue rechazando un nombre repetido", async () => {
    process.env.ADMIN_ALLOWED_USER_IDS = OWNER;
    expect((await post({ name: "   " })).status).toBe(400);
    mocks.storeFindFirst.mockResolvedValue({ id: "ya-existe" });
    expect((await post({ name: "Repetida" })).status).toBe(409);
    expect(mocks.storeCreate).not.toHaveBeenCalled();
  });

  it("la lista de tiendas propias no cambia: cualquier sesión ve las suyas", async () => {
    mocks.storeFindMany.mockResolvedValue([{ id: "store-1" }]);
    const response = await GET(new Request("https://admin.test/api/stores"));
    expect(response.status).toBe(200);
    expect(mocks.storeFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: OWNER } }));
  });
});
