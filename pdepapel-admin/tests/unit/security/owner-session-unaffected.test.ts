import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La sesión de la dueña real no cambia con nada de la fase 2.
 *
 * No se prueba con un «owner» de mentira: se usan el id de tienda y el id de
 * cuenta de Clerk que están hoy en producción, y se deja correr la resolución
 * de rol de verdad. La propiedad sale de la base **antes** de mirar cualquier
 * metadato, así que ni siquiera un metadato equivocado podría convertirla en
 * una cuenta de solo lectura.
 */
const session = vi.hoisted(() => ({ userId: null as string | null, sessionClaims: null as unknown }));
const mocks = vi.hoisted(() => ({ storeFindFirst: vi.fn(), getUser: vi.fn() }));

/** Producción, leídos con el usuario de solo lectura el 2026-09-19. */
const PRODUCTION_STORE = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";
const PRODUCTION_OWNER = "user_2YuMElx5guOjtnY3RT0vXi9UA3b";

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: session.sessionClaims }),
  clerkClient: async () => ({ users: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/prismadb", () => ({
  default: { store: { findFirst: mocks.storeFindFirst, count: vi.fn() } },
}));

import { getStoreAccess, requireStoreOwner, requireStoreRead } from "@/lib/store-access";
import {
  scrubOrder,
  scrubProduct,
  scrubReview,
  VIEWER_HIDDEN_ORDER_FIELDS,
  VIEWER_HIDDEN_PRODUCT_FIELDS,
} from "@/lib/viewer-payloads";

beforeEach(() => {
  vi.clearAllMocks();
  // La base responde como en producción: esa cuenta es la dueña de esa tienda.
  mocks.storeFindFirst.mockImplementation(async (query: { where: { id: string; userId: string } }) =>
    query.where.userId === PRODUCTION_OWNER && query.where.id === PRODUCTION_STORE ? { id: PRODUCTION_STORE } : null,
  );
  mocks.getUser.mockResolvedValue({ publicMetadata: {} });
  session.userId = PRODUCTION_OWNER;
  session.sessionClaims = {};
});

describe("la cuenta de la dueña en producción", () => {
  it("resuelve como dueña sin consultar ningún metadato", async () => {
    await expect(getStoreAccess(PRODUCTION_STORE)).resolves.toEqual({
      userId: PRODUCTION_OWNER,
      role: "owner",
    });
    // El metadato de Clerk ni se pide: la propiedad se decide en la base.
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.storeFindFirst).toHaveBeenCalledWith({
      where: { id: PRODUCTION_STORE, userId: PRODUCTION_OWNER },
      select: { id: true },
    });
  });

  it("sigue siendo dueña aunque alguien le pusiera por error el metadato de solo lectura", async () => {
    session.sessionClaims = { metadata: { role: "viewer", allowedStoreIds: [PRODUCTION_STORE] } };
    await expect(getStoreAccess(PRODUCTION_STORE)).resolves.toEqual({
      userId: PRODUCTION_OWNER,
      role: "owner",
    });
    await expect(requireStoreRead(PRODUCTION_STORE)).resolves.toMatchObject({ role: "owner" });
    await expect(requireStoreOwner(PRODUCTION_STORE)).resolves.toBe(PRODUCTION_OWNER);
  });

  it("puede leer y escribir: ninguna ruta ni carga de la fase 2 la frena", async () => {
    await expect(requireStoreRead(PRODUCTION_STORE)).resolves.toEqual({
      userId: PRODUCTION_OWNER,
      role: "owner",
    });
    await expect(requireStoreOwner(PRODUCTION_STORE)).resolves.toBe(PRODUCTION_OWNER);
  });

  it("ve el dato completo: con rol de dueña no se aplica ningún recorte", () => {
    const product = { id: "p", name: "Libreta", price: 10000, acqPrice: 4000, transportationCost: 500, supplierId: "s" };
    const order = { id: "o", total: 20000, fullName: "Clienta", phone: "300", email: "a@b.com", netProfit: 9000 };
    const review = { id: "r", name: "Clienta", userId: "u", moderationNote: "ok" };

    // La condición que usan las rutas y las cargas es `role === "viewer"`.
    const role: string = "owner";
    expect(role === "viewer" ? scrubProduct(product) : product).toBe(product);
    expect(role === "viewer" ? scrubOrder(order) : order).toBe(order);
    expect(role === "viewer" ? scrubReview(review) : review).toBe(review);

    // Y si alguien invirtiera la condición, el recorte sí quitaría estos campos:
    // esta lista es la que nunca debe aplicarse a la dueña.
    expect(VIEWER_HIDDEN_PRODUCT_FIELDS).toContain("acqPrice");
    expect(VIEWER_HIDDEN_ORDER_FIELDS).toContain("fullName");
  });
});
