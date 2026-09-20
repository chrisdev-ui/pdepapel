import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Movimientos de inventario es un módulo **solo de la dueña**: el kardex lleva
 * el costo de compra y el precio de venta de cada fila y, en los movimientos de
 * un pedido, el nombre y el correo de la clienta. El menú ya lo marcaba
 * `ownerOnly`, pero esa bandera solo esconde el enlace: quien escribiera la URL
 * entraba igual. Estas pruebas comprueban que el permiso se exige en el
 * servidor, no en el menú.
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
const movementFindMany = vi.fn(async () => []);

vi.mock("@/lib/prismadb", () => ({
  default: new Proxy({} as Record<string, unknown>, {
    get: (_t, model: string) => {
      if (model === "$transaction") return async () => [];
      if (model === "then") return undefined;
      return new Proxy({} as Record<string, unknown>, {
        get: (_m, method: string) => {
          if (model === "store" && method === "findFirst") return storeFindFirst;
          if (model === "inventoryMovement" && method === "findMany") return movementFindMany;
          if (method === "findMany" || method === "groupBy") return async () => [];
          if (method === "count") return async () => 0;
          return async () => null;
        },
      });
    },
  }),
}));

import { getInventoryMovements } from "@/app/(dashboard)/[storeId]/(routes)/movimientos-inventario/server/get-movements";
import { getProductKardex } from "@/app/(dashboard)/[storeId]/(routes)/movimientos-inventario/producto/[productId]/server/get-product-kardex";

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
  movementFindMany.mockClear();
  signIn("anon");
});

describe("las cargas de Movimientos exigen ser la dueña", () => {
  it("la dueña sí lee la lista", async () => {
    signIn("owner");
    const result = await getInventoryMovements(STORE);
    expect(result.movements).toEqual([]);
    expect(movementFindMany).toHaveBeenCalled();
  });

  it("una cuenta de solo lectura recibe 403 y no llega a consultar", async () => {
    signIn("viewer");
    await expect(getInventoryMovements(STORE)).rejects.toMatchObject({ statusCode: 403 });
    expect(movementFindMany).not.toHaveBeenCalled();
  });

  it("una sesión de otra tienda recibe 403", async () => {
    signIn("stranger");
    await expect(getInventoryMovements(STORE)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("sin sesión responde 401", async () => {
    await expect(getInventoryMovements(STORE)).rejects.toMatchObject({ statusCode: 401 });
    expect(movementFindMany).not.toHaveBeenCalled();
  });

  it("el kardex del producto se cierra igual", async () => {
    signIn("viewer");
    await expect(getProductKardex(STORE, "p-1")).rejects.toMatchObject({ statusCode: 403 });
    signIn("anon");
    await expect(getProductKardex(STORE, "p-1")).rejects.toMatchObject({ statusCode: 401 });
  });
});

/**
 * Guardia de regresión: si alguien agrega otra carga o página al módulo sin el
 * guardia, esta prueba lo dice. Se mira el código porque una carga nueva no
 * está en la lista de arriba hasta que alguien se acuerde de agregarla.
 */
describe("todo archivo de servidor del módulo comprueba el permiso", () => {
  const ROOT = path.resolve(__dirname, "../../..");
  const MODULE_DIR = path.join(ROOT, "app", "(dashboard)", "[storeId]", "(routes)", "movimientos-inventario");
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
    // Solo los archivos de servidor que consultan la base.
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

  it("la plantilla de conciliación también es solo de la dueña", () => {
    const route = path.join(ROOT, "app", "api", "[storeId]", "inventory", "reconciliation-template", "route.ts");
    const source = readFileSync(route, "utf8");
    expect(source).toContain("requireStoreOwner(");
    expect(source).not.toContain("requireStoreRead(");
  });
});
