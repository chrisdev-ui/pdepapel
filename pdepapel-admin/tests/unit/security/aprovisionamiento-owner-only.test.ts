import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Aprovisionamiento es un módulo **solo de la dueña**: cada pedido lleva el
 * costo unitario de la compra, el costo puesto en bodega y el margen que sale
 * de ellos. `GET /api/[storeId]/restock-orders` ya se reserva por eso mismo
 * («costos de compra», en `read-access-routes` y en `store-read-access`), pero
 * la pantalla no comprobaba nada: una cuenta de solo lectura que escribiera la
 * URL veía por pantalla lo que la API le niega.
 */
const session = vi.hoisted(() => ({ userId: null as string | null, metadata: null as unknown }));
const OWNER = "user_owner";
const VIEWER = "user_viewer";
const STORE = "store-1";

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: session.metadata === null ? {} : { metadata: session.metadata } }),
  clerkClient: async () => ({ users: { getUser: async () => ({ publicMetadata: {} }) } }),
}));
vi.mock("next/headers", () => ({ headers: () => new Map() }));
vi.mock("@/lib/env.mjs", () => ({ env: new Proxy({}, { get: () => "test" }) }));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    static fromEnv() {
      return new this();
    }
    async get() {
      return null;
    }
    async set() {
      return "OK";
    }
  },
}));

const storeFindFirst = vi.fn(async (query: any) =>
  query?.where?.userId === OWNER && query?.where?.id === STORE ? { id: STORE } : null,
);
const restockFindMany = vi.fn(async () => []);

vi.mock("@/lib/prismadb", () => ({
  default: new Proxy({} as Record<string, unknown>, {
    get: (_t, model: string) => {
      if (model === "$transaction") return async () => [];
      if (model === "then") return undefined;
      return new Proxy({} as Record<string, unknown>, {
        get: (_m, method: string) => {
          if (model === "store" && method === "findFirst") return storeFindFirst;
          if (model === "restockOrder" && method === "findMany") return restockFindMany;
          if (method === "findMany" || method === "groupBy") return async () => [];
          if (method === "count") return async () => 0;
          return async () => null;
        },
      });
    },
  }),
}));

import { getRestockOrders } from "@/app/(dashboard)/[storeId]/(routes)/aprovisionamiento/server/get-restock-orders";

function signIn(role: "owner" | "viewer" | "stranger" | "anon") {
  if (role === "anon") {
    session.userId = null;
    session.metadata = null;
    return;
  }
  if (role === "owner") {
    session.userId = OWNER;
    session.metadata = null;
    return;
  }
  if (role === "viewer") {
    session.userId = VIEWER;
    session.metadata = { role: "viewer", allowedStoreIds: [STORE] };
    return;
  }
  session.userId = "user_x";
  session.metadata = { role: "viewer", allowedStoreIds: ["otra-tienda"] };
}

beforeEach(() => {
  storeFindFirst.mockClear();
  restockFindMany.mockClear();
  signIn("anon");
});

describe("la lista de aprovisionamiento exige ser la dueña", () => {
  it("la dueña sí lee los pedidos", async () => {
    signIn("owner");
    await expect(getRestockOrders(STORE)).resolves.toEqual([]);
    expect(restockFindMany).toHaveBeenCalled();
  });

  it("una cuenta de solo lectura recibe 403 y no llega a consultar los costos", async () => {
    signIn("viewer");
    await expect(getRestockOrders(STORE)).rejects.toMatchObject({ statusCode: 403 });
    expect(restockFindMany).not.toHaveBeenCalled();
  });

  it("una sesión de otra tienda recibe 403", async () => {
    signIn("stranger");
    await expect(getRestockOrders(STORE)).rejects.toMatchObject({ statusCode: 403 });
    expect(restockFindMany).not.toHaveBeenCalled();
  });

  it("sin sesión responde 401", async () => {
    await expect(getRestockOrders(STORE)).rejects.toMatchObject({ statusCode: 401 });
    expect(restockFindMany).not.toHaveBeenCalled();
  });

  it("el filtro por proveedor no abre una puerta aparte", async () => {
    signIn("viewer");
    await expect(getRestockOrders(STORE, "supplier-1")).rejects.toMatchObject({ statusCode: 403 });
  });
});

/**
 * Guardia de regresión: una carga o página nueva en el módulo sin guardia hace
 * fallar esta prueba, que es lo que faltó la primera vez.
 */
describe("todo archivo de servidor del módulo comprueba el permiso", () => {
  const ROOT = path.resolve(__dirname, "../../..");
  const MODULE_DIR = path.join(ROOT, "app", "(dashboard)", "[storeId]", "(routes)", "aprovisionamiento");
  const GUARDS = ["requireStoreOwner(", "getStoreAccess("];

  function walk(dir: string): string[] {
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
    return readdirSync(dir).flatMap((entry) => {
      const full = path.join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  }

  const serverFiles = walk(MODULE_DIR).filter((file) => {
    if (!file.endsWith(".ts") && !file.endsWith(".tsx")) return false;
    const source = readFileSync(file, "utf8");
    return !source.startsWith('"use client"') && /prismadb\./.test(source);
  });

  it("encuentra los archivos de servidor del módulo", () => {
    expect(serverFiles.length).toBeGreaterThanOrEqual(3);
  });

  it("ninguno consulta la base sin comprobar el permiso", () => {
    const unguarded = serverFiles
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return !GUARDS.some((guard) => source.includes(guard));
      })
      .map((file) => path.relative(MODULE_DIR, file));
    expect(unguarded).toEqual([]);
  });
});
