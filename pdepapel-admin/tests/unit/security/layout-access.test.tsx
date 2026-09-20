import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Las dos puertas del panel: la raíz (que reparte a la tienda) y el armazón
 * de la tienda. Entran la dueña y una cuenta de solo lectura con esa tienda
 * permitida; cualquier otra sesión sale redirigida. La escritura sigue
 * cerrada en cada ruta: esto solo decide si se pinta el panel.
 */
const session = vi.hoisted(() => ({ userId: null as string | null, metadata: null as unknown }));
const mocks = vi.hoisted(() => ({ redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }) }));

const OWNER = "user_owner";
const VIEWER = "user_viewer";
const STRANGER = "user_stranger";
const STORE = "store-1";

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: session.metadata === null ? {} : { metadata: session.metadata } }),
  clerkClient: async () => ({ users: { getUser: async () => ({ publicMetadata: {} }) } }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/env.mjs", () => ({ env: new Proxy({}, { get: () => "test" }) }));
vi.mock("@/components/shell/app-shell", () => ({ AppShell: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/store-initializer", () => ({ StoreInitializer: () => null }));

const store = { id: STORE, userId: OWNER, name: "P de Papel", logoUrl: null };

vi.mock("@/lib/prismadb", () => ({
  default: {
    store: {
      findFirst: vi.fn(async (query: any) => {
        const where = query?.where ?? {};
        if (where.userId && where.userId !== OWNER) return null;
        if (where.id?.in) return where.id.in.includes(STORE) ? store : null;
        if (where.id && where.id !== STORE) return null;
        return store;
      }),
      findMany: vi.fn(async (query: any) => (query?.where?.userId === OWNER ? [store] : [])),
      count: vi.fn(async (query: any) => (query?.where?.userId === OWNER ? 1 : 0)),
    },
    order: { count: vi.fn(async () => 0) },
    product: { count: vi.fn(async () => 0) },
    conversation: { count: vi.fn(async () => 0) },
    productPresale: { count: vi.fn(async () => 0) },
  },
}));

import DashboardLayout from "@/app/(dashboard)/[storeId]/layout";
import SetupLayout from "@/app/(root)/layout";

function signIn(role: "owner" | "viewer" | "stranger" | "anon") {
  if (role === "anon") { session.userId = null; session.metadata = null; return; }
  if (role === "owner") { session.userId = OWNER; session.metadata = null; return; }
  if (role === "viewer") { session.userId = VIEWER; session.metadata = { role: "viewer", allowedStoreIds: [STORE] }; return; }
  session.userId = STRANGER;
  session.metadata = { role: "viewer", allowedStoreIds: ["otra-tienda"] };
}

/** Devuelve la ruta a la que redirigió, o `null` si el layout se pintó. */
async function renderLayout(layout: () => Promise<unknown>): Promise<string | null> {
  try {
    await layout();
    return null;
  } catch (error) {
    const message = (error as Error).message ?? "";
    if (message.startsWith("REDIRECT:")) return message.slice("REDIRECT:".length);
    throw error;
  }
}

const dashboard = () => renderLayout(() => DashboardLayout({ children: null, params: { storeId: STORE } }) as Promise<unknown>);
const root = () => renderLayout(() => SetupLayout({ children: null }) as Promise<unknown>);

beforeEach(() => {
  mocks.redirect.mockClear();
  session.userId = null;
  session.metadata = null;
});

describe("armazón de la tienda", () => {
  it("se pinta para la dueña", async () => {
    signIn("owner");
    await expect(dashboard()).resolves.toBeNull();
  });

  it("se pinta para una cuenta de solo lectura con esta tienda permitida", async () => {
    signIn("viewer");
    await expect(dashboard()).resolves.toBeNull();
  });

  it("echa a una cuenta de solo lectura de otra tienda", async () => {
    signIn("stranger");
    await expect(dashboard()).resolves.toBe("/");
  });

  it("manda a iniciar sesión sin sesión", async () => {
    signIn("anon");
    await expect(dashboard()).resolves.toBe("/iniciar-sesion");
  });
});

describe("raíz del panel", () => {
  it("lleva a la dueña a su tienda", async () => {
    signIn("owner");
    await expect(root()).resolves.toBe(`/${STORE}`);
  });

  it("lleva a una cuenta de solo lectura a la primera tienda que tiene permitida", async () => {
    signIn("viewer");
    await expect(root()).resolves.toBe(`/${STORE}`);
  });

  it("manda a «sin acceso» a una sesión sin tienda propia ni permitida", async () => {
    signIn("stranger");
    await expect(root()).resolves.toBe("/sin-acceso");
  });

  it("manda a iniciar sesión sin sesión", async () => {
    signIn("anon");
    await expect(root()).resolves.toBe("/iniciar-sesion");
  });
});
