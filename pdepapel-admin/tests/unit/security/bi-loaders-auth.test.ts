import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Los cargadores de análisis comprueban el acceso ellos mismos, no solo la
 * página que los llama: una pantalla nueva, una ruta o el copiloto pueden
 * llamarlos sin pasar por esa página. Ventas sin costo → dueña o solo lectura;
 * márgenes, costos y clientas → solo la dueña.
 */
const session = vi.hoisted(() => ({ userId: null as string | null, metadata: null as unknown }));
const OWNER = "user_owner";
const VIEWER = "user_viewer";
const STORE = "store-1";

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({
    userId: session.userId,
    sessionClaims: session.metadata === null ? {} : { metadata: session.metadata },
  }),
  clerkClient: async () => ({ users: { getUser: async () => ({ publicMetadata: {} }) } }),
}));
vi.mock("next/headers", () => ({ headers: () => new Map(), cookies: () => new Map() }));
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

const order = {
  id: "o-1",
  orderNumber: "ORD-1",
  status: "PAID",
  type: "STANDARD",
  total: 50000,
  subtotal: 50000,
  discount: 0,
  couponDiscount: 0,
  fullName: "Ana Prueba",
  email: "ana@prueba.test",
  phone: "3000000000",
  netProfit: 20000,
  totalProductCost: 30000,
  createdAt: new Date(),
  paidAt: new Date(),
  orderItems: [{ quantity: 1, price: 50000, product: { acqPrice: 30000, category: { name: "Libretas" } } }],
  payment: null,
  shipping: null,
};

const storeFindFirst = vi.fn(async (query: any) =>
  query?.where?.userId === OWNER && (query?.where?.id === undefined || query?.where?.id === STORE)
    ? { id: STORE, userId: OWNER }
    : null,
);

vi.mock("@/lib/prismadb", () => ({
  default: new Proxy({} as Record<string, unknown>, {
    get: (_t, model: string) => {
      if (model === "$transaction") return async () => [];
      if (model === "then") return undefined;
      return new Proxy({} as Record<string, unknown>, {
        get: (_m, method: string) => {
          if (model === "store" && method === "findFirst") return storeFindFirst;
          if (model === "order" && method === "findMany") return async () => [order];
          if (method === "findMany" || method === "groupBy") return async () => [];
          if (method === "count") return async () => 0;
          if (method === "aggregate") return async () => ({ _sum: {}, _count: 0 });
          return async () => null;
        },
      });
    },
  }),
}));

function signIn(role: "owner" | "viewer" | "stranger" | "anon") {
  session.metadata = null;
  if (role === "anon") session.userId = null;
  else if (role === "owner") session.userId = OWNER;
  else if (role === "viewer") {
    session.userId = VIEWER;
    session.metadata = { role: "viewer", allowedStoreIds: [STORE] };
  } else {
    session.userId = "user_other_store";
    session.metadata = { role: "viewer", allowedStoreIds: ["otra-tienda"] };
  }
}

beforeEach(() => {
  storeFindFirst.mockClear();
  signIn("anon");
});

type Loader = { name: string; call: () => Promise<unknown> };

const ownerOnly: Loader[] = [
  { name: "getMonthlyFinancialSummary", call: async () => (await import("@/actions/get-financial-analytics")).getMonthlyFinancialSummary(STORE, 2026, 9) },
  { name: "getDailyFinancialBreakdown", call: async () => (await import("@/actions/get-financial-analytics")).getDailyFinancialBreakdown(STORE, 2026, 9) },
  { name: "getMonthOverMonthComparison", call: async () => (await import("@/actions/get-financial-analytics")).getMonthOverMonthComparison(STORE, 2026, 9) },
  { name: "getInventoryRisk", call: async () => (await import("@/actions/get-inventory-risk")).getInventoryRisk(STORE) },
  { name: "getProductProfitRanking", call: async () => (await import("@/actions/get-product-profitability")).getProductProfitRanking(STORE) },
  { name: "getDeadInventory", call: async () => (await import("@/actions/get-product-profitability")).getDeadInventory(STORE) },
  { name: "getCustomerIntelligence", call: async () => (await import("@/actions/get-customer-intelligence")).getCustomerIntelligence(STORE) },
  {
    name: "getInactiveCustomersEligibleForReactivation",
    call: async () => (await import("@/actions/get-customer-intelligence")).getInactiveCustomersEligibleForReactivation(STORE),
  },
  { name: "getAverageOrderValue", call: async () => (await import("@/actions/get-average-order-value")).getAverageOrderValue(STORE, 2026) },
  { name: "getTotalRevenue", call: async () => (await import("@/actions/get-total-revenue")).getTotalRevenue(STORE, 2026) },
  { name: "getOrdersWithoutGuide", call: async () => (await import("@/actions/get-orders-without-guide")).getOrdersWithoutGuide(STORE) },
  { name: "getProducts (actions)", call: async () => (await import("@/actions/get-products")).getProducts(STORE) },
  { name: "getBusinessGrowthOverview", call: async () => (await import("@/lib/business-growth-data")).getBusinessGrowthOverview(STORE, new Date()) },
];

const readable: Loader[] = [
  { name: "getSalesData", call: async () => (await import("@/actions/get-sales-data")).getSalesData(STORE, new Date().getFullYear()) },
  { name: "getCategorySales", call: async () => (await import("@/actions/get-category-sales")).getCategorySales(STORE, new Date().getFullYear()) },
];

describe("cargadores con márgenes, costos o clientas: solo la dueña", () => {
  it.each(ownerOnly)("$name rechaza sin sesión, a otra tienda y a la cuenta de solo lectura", async ({ call }) => {
    signIn("anon");
    await expect(call()).rejects.toMatchObject({ statusCode: 401 });
    signIn("stranger");
    await expect(call()).rejects.toMatchObject({ statusCode: 403 });
    signIn("viewer");
    await expect(call()).rejects.toMatchObject({ statusCode: 403 });
  });

  it.each(ownerOnly)("$name responde a la dueña", async ({ call }) => {
    signIn("owner");
    await expect(call()).resolves.toBeDefined();
  });
});

describe("cargadores de ventas sin costo: dueña y solo lectura", () => {
  it.each(readable)("$name rechaza sin sesión y a otra tienda", async ({ call }) => {
    signIn("anon");
    await expect(call()).rejects.toMatchObject({ statusCode: 401 });
    signIn("stranger");
    await expect(call()).rejects.toMatchObject({ statusCode: 403 });
  });

  it.each(readable)("$name le da a la cuenta de solo lectura ventas, sin costo, utilidad ni clientas", async ({ call }) => {
    signIn("viewer");
    const result = await call();
    const text = JSON.stringify(result);
    expect(text.length).toBeGreaterThan(2);
    for (const hidden of ["acqPrice", "netProfit", "totalProductCost", "Ana Prueba", "ana@prueba.test", "3000000000"]) {
      expect(text, hidden).not.toContain(hidden);
    }
  });
});

describe("las variantes internas no se usan en el panel", () => {
  const ROOT = path.resolve(__dirname, "../../..");

  function walk(dir: string): string[] {
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
    return readdirSync(dir).flatMap((entry) => {
      const full = path.join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(entry) ? [full] : [];
    });
  }

  it("ningún archivo del panel importa una función «ForSystemJob»", () => {
    const offenders = [...walk(path.join(ROOT, "app", "(dashboard)")), ...walk(path.join(ROOT, "components"))].filter(
      (file) => /\w+ForSystemJob\b/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});

/**
 * Cuerpo de una función exportada. La firma puede traer llaves en el tipo de
 * retorno (`Promise<{ ok: boolean }>`), así que el cuerpo empieza en la primera
 * llave que cierra una línea después de los parámetros.
 */
export function exportedFunctionBodies(source: string): Map<string, string> {
  const bodies = new Map<string, string>();
  const signature = /export\s+(?:async\s+function\s+(\w+)|function\s+(\w+)|const\s+(\w+)\s*=\s*async\s*)\(/g;
  for (const match of Array.from(source.matchAll(signature))) {
    const name = match[1] ?? match[2] ?? match[3];
    let index = (match.index ?? 0) + match[0].length;
    let depth = 1;
    while (index < source.length && depth > 0) {
      if (source[index] === "(") depth += 1;
      else if (source[index] === ")") depth -= 1;
      index += 1;
    }
    const open = source.slice(index).search(/\{[ \t]*\n/);
    if (open === -1) continue;
    let start = index + open;
    let braces = 1;
    let cursor = start + 1;
    while (cursor < source.length && braces > 0) {
      if (source[cursor] === "{") braces += 1;
      else if (source[cursor] === "}") braces -= 1;
      cursor += 1;
    }
    bodies.set(name, source.slice(start, cursor));
  }
  return bodies;
}

describe("todo cargador de análisis lleva su guardia", () => {
  const ROOT = path.resolve(__dirname, "../../..");
  const GUARD = /\b(requireStoreOwner|requireStoreRead|verifyStoreOwner)\(/;
  const FILES = [
    ...readdirSync(path.join(ROOT, "actions"))
      .filter((file) => file.startsWith("get-") && file !== "get-dane-locations.ts")
      .map((file) => path.join("actions", file)),
    "lib/business-growth-data.ts",
    "lib/tax-reports.ts",
  ];
  /** Funciones puras o de otro tipo en esos archivos: no leen la base. */
  const NOT_LOADERS = new Set(["createTaxReportPeriod", "isTaxReportPeriod", "resolveTaxReportPeriod"]);

  it("lee bien una firma con llaves en el tipo de retorno", () => {
    const fixture = `export async function generateCode(\n  storeId: string,\n): Promise<{ success: boolean; code?: string }> {\n  await requireStoreOwner(storeId);\n  return { success: true };\n}\n`;
    expect(exportedFunctionBodies(fixture).get("generateCode")).toContain("requireStoreOwner(storeId)");
  });

  it.each(FILES)("%s", (file) => {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    const unguarded = Array.from(exportedFunctionBodies(source).entries())
      .filter(([name, body]) => !name.endsWith("ForSystemJob") && !NOT_LOADERS.has(name) && /prisma(db)?\??\./.test(body) && !GUARD.test(body))
      .map(([name]) => name);
    expect(unguarded).toEqual([]);
  });
});
