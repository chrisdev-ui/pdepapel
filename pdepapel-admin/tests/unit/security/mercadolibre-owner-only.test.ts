import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mercado Libre es un módulo **solo de la dueña**. La decisión de negocio es
 * que nadie más necesita verlo, así que aquí no hay versión depurada: hay
 * puerta cerrada.
 *
 * Antes la página solo comprobaba que hubiera sesión, y el menú escondía la
 * entrada. Esconder no es cerrar: quien escribiera la dirección entraba.
 *
 * Y cerrar la página tampoco bastaba. Los datos de la pestaña de Anuncios
 * —gasto, presupuesto, retorno— los pide el navegador a `advertising/overview`,
 * que es otra puerta con su propia guardia. Por eso estas pruebas cubren las
 * dos, y la de la ruta comprueba además que no se llegue a consultar nada.
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

const storeFindFirst = vi.hoisted(() =>
  vi.fn(async (query: any) =>
    query?.where?.userId === "user_owner" && query?.where?.id === "store-1" ? { id: "store-1" } : null,
  ),
);
/** La consulta que la ruta de anuncios hace ANTES de llamar a Mercado Libre. */
const connectionFindUnique = vi.hoisted(() => vi.fn(async () => null));

vi.mock("@/lib/prismadb", () => ({
  default: new Proxy({} as Record<string, unknown>, {
    get: (_t, model: string) => {
      if (model === "$transaction") return async () => [];
      if (model === "then") return undefined;
      return new Proxy({} as Record<string, unknown>, {
        get: (_m, method: string) => {
          if (model === "store" && method === "findFirst") return storeFindFirst;
          if (model === "marketplaceConnection" && method === "findUnique") return connectionFindUnique;
          if (method === "findMany" || method === "groupBy") return async () => [];
          if (method === "count") return async () => 0;
          return async () => null;
        },
      });
    },
  }),
}));

/** Si esto llega a llamarse para una sesión sin permiso, la fuga sigue viva. */
const adsOverview = vi.hoisted(() => vi.fn(async () => ({ state: "NOT_ENABLED" as const })));
vi.mock("@/lib/mercadolibre/product-ads", () => ({
  getMercadoLibreProductAdsOverview: adsOverview,
}));

import { GET as advertisingOverviewGET } from "@/app/api/[storeId]/marketplaces/mercadolibre/advertising/overview/route";

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
  connectionFindUnique.mockClear();
  adsOverview.mockClear();
  signIn("anon");
});

const callAds = () =>
  advertisingOverviewGET(new Request("http://localhost/x"), { params: { storeId: STORE } });

describe("la ruta de Anuncios solo responde a la dueña", () => {
  it("una cuenta de solo lectura recibe 403 y no se consulta nada", async () => {
    signIn("viewer");
    const response = await callAds();
    expect(response.status).toBe(403);
    // Lo que de verdad importa: ni la conexión ni las cifras de publicidad.
    expect(connectionFindUnique).not.toHaveBeenCalled();
    expect(adsOverview).not.toHaveBeenCalled();
  });

  it("una sesión de otra tienda recibe 403", async () => {
    signIn("stranger");
    expect((await callAds()).status).toBe(403);
    expect(adsOverview).not.toHaveBeenCalled();
  });

  it("sin sesión responde 401", async () => {
    const response = await callAds();
    expect(response.status).toBe(401);
    expect(adsOverview).not.toHaveBeenCalled();
  });

  it("la dueña sí pasa la guardia y llega a consultar", async () => {
    signIn("owner");
    const response = await callAds();
    // Sin conexión de Mercado Libre responde 404, que ya es del otro lado de
    // la puerta: lo que se comprueba aquí es que la guardia la dejó pasar.
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
    expect(connectionFindUnique).toHaveBeenCalled();
  });
});

/**
 * La página y la ruta se leen como texto: una prueba que solo ejercitara la
 * ruta no vería que alguien le quita la guardia a la página.
 */
describe("la puerta está en el servidor, no en el menú", () => {
  const ROOT = path.resolve(__dirname, "../../..");
  const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

  const PAGE = "app/(dashboard)/[storeId]/(routes)/mercadolibre/page.tsx";
  const ADS = "app/api/[storeId]/marketplaces/mercadolibre/advertising/overview/route.ts";

  it("la página exige ser la dueña", () => {
    expect(read(PAGE)).toContain("requireStoreOwner(");
  });

  it("la guardia de la página va antes de cualquier consulta", () => {
    const source = read(PAGE);
    const guard = source.indexOf("requireStoreOwner(");
    const firstQuery = source.indexOf("prismadb.");
    expect(guard).toBeGreaterThan(-1);
    expect(firstQuery).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(firstQuery);
  });

  it("la página no vuelve a conformarse con «hay sesión»", () => {
    // `auth()` a secas era justo el agujero: decía quién eres, no si puedes.
    expect(read(PAGE)).not.toMatch(/const \{ userId \} = await auth\(\)/);
  });

  it("la ruta de anuncios ya no abre a solo lectura", () => {
    const source = read(ADS);
    expect(source).toContain("requireStoreOwner(");
    expect(source).not.toContain("requireStoreRead(");
  });

  it("la entrada del menú sigue marcada como solo de la dueña", () => {
    // La bandera esconde el enlace; ahora además hay algo detrás que cierra.
    const nav = read("lib/admin-navigation.ts");
    const entry = nav.slice(nav.indexOf('id: "mercadolibre"'));
    expect(entry.slice(0, 200)).toContain("ownerOnly: true");
  });
});
