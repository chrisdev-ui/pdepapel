import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Comprobación de punta a punta contra MySQL local: una cuenta de solo
 * lectura entra a las lecturas abiertas en la fase 1 y sigue fuera de las
 * reservadas (proveedores, ajustes con cuentas bancarias, costos de compra).
 * Aquí no hay ayudantes simulados: corre el guardia real contra la base.
 */
const session = vi.hoisted(() => ({ userId: null as string | null, metadata: null as unknown }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({
    userId: session.userId,
    sessionClaims: session.metadata === null ? {} : { metadata: session.metadata },
  }),
  clerkClient: async () => ({ users: { getUser: async () => ({ publicMetadata: {} }) } }),
}));
vi.mock("@/lib/prismadb", async () => {
  const { testPrisma } = await import("./helpers/database");
  return { default: testPrisma };
});

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

const VIEWER = "user_viewer_agencia";
const STRANGER = "user_intruso";

const OPEN_ROUTES = [
  { name: "cajas", load: () => import("@/app/api/[storeId]/boxes/route") },
  { name: "respuestas del bot", load: () => import("@/app/api/[storeId]/bot-replies/route") },
  { name: "ferias", load: () => import("@/app/api/[storeId]/fair-events/route") },
  { name: "preventas", load: () => import("@/app/api/[storeId]/presales/route") },
  { name: "ofertas", load: () => import("@/app/api/[storeId]/offers/route") },
];

const RESERVED_ROUTES = [
  { name: "proveedores", load: () => import("@/app/api/[storeId]/suppliers/route"), reason: "NIT y contacto del proveedor" },
  { name: "ajustes", load: () => import("@/app/api/[storeId]/settings/route"), reason: "cuentas bancarias de la tienda" },
  { name: "aprovisionamiento", load: () => import("@/app/api/[storeId]/restock-orders/route"), reason: "costos de compra" },
];

describe("acceso de solo lectura contra MySQL", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });

  beforeEach(async () => {
    fixture = await createInventoryFixture();
  });

  afterEach(async () => {
    if (fixture) {
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    session.userId = null;
    session.metadata = null;
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  const call = async (entry: { load: () => Promise<Record<string, unknown>> }) => {
    const mod = await entry.load();
    const GET = mod.GET as (req: Request, ctx: { params: { storeId: string } }) => Promise<Response>;
    const response = await GET(new Request("https://admin.test/api/store/x"), {
      params: { storeId: fixture!.store.id },
    });
    return response.status;
  };

  const asViewer = () => {
    session.userId = VIEWER;
    session.metadata = { role: "viewer", allowedStoreIds: [fixture!.store.id] };
  };

  it("la cuenta de solo lectura entra a las lecturas abiertas", async () => {
    asViewer();
    for (const entry of OPEN_ROUTES) {
      expect(await call(entry), entry.name).toBe(200);
    }
  });

  it("la cuenta de solo lectura sigue fuera de las lecturas reservadas", async () => {
    asViewer();
    for (const entry of RESERVED_ROUTES) {
      expect(await call(entry), `${entry.name} (${entry.reason})`).toBe(403);
    }
  });

  it("la dueña entra a todo", async () => {
    session.userId = fixture!.store.userId;
    for (const entry of [...OPEN_ROUTES, ...RESERVED_ROUTES]) {
      expect(await call(entry), entry.name).toBe(200);
    }
  });

  it("una cuenta de solo lectura de otra tienda no entra a nada", async () => {
    session.userId = STRANGER;
    session.metadata = { role: "viewer", allowedStoreIds: ["otra-tienda"] };
    for (const entry of [...OPEN_ROUTES, ...RESERVED_ROUTES]) {
      expect(await call(entry), entry.name).toBe(403);
    }
  });

  it("sin sesión no entra a nada", async () => {
    session.userId = null;
    for (const entry of [...OPEN_ROUTES, ...RESERVED_ROUTES]) {
      expect(await call(entry), entry.name).toBe(401);
    }
  });
});
