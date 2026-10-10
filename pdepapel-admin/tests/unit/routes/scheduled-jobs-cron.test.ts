import { subDays, subHours } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Los tres trabajos que heredamos de `scheduler.yml` entran apagados: piden
 * el secreto del cron (también cuando falta, que antes dejaba pasar
 * «Bearer undefined»), rechazan `mode=apply` y su simulación no escribe nada
 * ni devuelve correos.
 */
const mocks = vi.hoisted(() => ({
  env: { CRON_SECRET: "cron-secret" } as Record<string, string | undefined>,
  record: vi.fn(),
  send: vi.fn(),
  writes: [] as string[],
  orders: [] as unknown[],
  products: [] as unknown[],
}));

vi.mock("@/lib/env.mjs", () => ({ env: mocks.env }));
vi.mock("@/lib/job-runs", () => ({ recordJobRun: mocks.record }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: mocks.send } } }));
vi.mock("@react-email/render", () => ({ render: async () => "<html></html>" }));
vi.mock("@/emails/reactivation-email", () => ({ ReactivationEmailTemplate: () => null }));
vi.mock("@/lib/prismadb", () => ({
  default: new Proxy({} as Record<string, unknown>, {
    get: (_t, model: string) => {
      if (model === "then") return undefined;
      return new Proxy({} as Record<string, unknown>, {
        get: (_m, method: string) => {
          if (/^(create|update|upsert|delete)/.test(method)) {
            return async () => {
              mocks.writes.push(`${model}.${method}`);
              return { count: 1 };
            };
          }
          if (model === "store" && method === "findMany") return async () => [{ id: "store-1" }];
          if (model === "store" && method === "findUnique") return async () => ({ id: "store-1", name: "Tienda" });
          if (model === "order" && method === "findMany") return async () => mocks.orders;
          if (model === "product" && method === "findMany") return async () => mocks.products;
          if (method === "findMany") return async () => [];
          if (method === "count") return async () => 0;
          return async () => null;
        },
      });
    },
  }),
}));

import { GET as abc } from "@/app/api/cron/abc-classification/route";
import { GET as bankTransfers } from "@/app/api/cron/bank-transfer-review/route";
import { GET as reactivation } from "@/app/api/cron/customer-reactivation/route";
import {
  BANK_TRANSFER_REVIEW_NOTE,
  SCHEDULED_JOBS,
  appendBankTransferNote,
  classifyAbc,
  resolveScheduledJobMode,
} from "@/lib/scheduled-jobs";

const routes = [
  { name: "abc-classification", handler: abc },
  { name: "bank-transfer-review", handler: bankTransfers },
  { name: "customer-reactivation", handler: reactivation },
] as const;

const call = (handler: (request: never) => Promise<Response>, name: string, token?: string, query = "") =>
  handler(
    new Request(`https://admin.test/api/cron/${name}${query}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }) as never,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.CRON_SECRET = "cron-secret";
  mocks.writes.length = 0;
  mocks.orders = [];
  mocks.products = [];
});

describe("los trabajos heredados del programador", () => {
  it("entran apagados", () => {
    expect(Object.values(SCHEDULED_JOBS).every((job) => job.enabled === false)).toBe(true);
  });

  it.each(routes)("$name pide el secreto del cron, aunque falte la variable", async ({ name, handler }) => {
    expect((await call(handler, name)).status).toBe(403);
    expect((await call(handler, name, "otro")).status).toBe(403);
    mocks.env.CRON_SECRET = undefined;
    expect((await call(handler, name, "undefined")).status).toBe(403);
    expect(mocks.writes).toEqual([]);
  });

  it.each(routes)("$name rechaza mode=apply mientras está apagado", async ({ name, handler }) => {
    const response = await call(handler, name, "cron-secret", "?mode=apply");
    expect(response.status).toBe(409);
    expect(mocks.writes).toEqual([]);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it.each(routes)("$name sin modo simula y no escribe", async ({ name, handler }) => {
    const response = await call(handler, name, "cron-secret");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ mode: "dry-run" });
    expect(mocks.writes).toEqual([]);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("un modo desconocido es un error de la solicitud", () => {
    expect(() => resolveScheduledJobMode("https://x.test/?mode=todo", "abc-classification")).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });
});

describe("reactivación simulada", () => {
  it("cuenta a quién escribiría sin cupón, sin correo y sin correos en la respuesta", async () => {
    const lastPurchase = subDays(new Date(), 90);
    mocks.orders = [
      {
        id: "o-1",
        email: "clienta@prueba.test",
        fullName: "Clienta Prueba",
        phone: "3000000000",
        total: 40000,
        netProfit: 10000,
        createdAt: lastPurchase,
        paidAt: lastPurchase,
        orderItems: [],
        payment: null,
        shipping: null,
      },
    ];
    const response = await call(reactivation, "customer-reactivation", "cron-secret");
    const body = await response.json();
    expect(body.stores[0]).toMatchObject({ eligible: 1, recentlyContacted: 0, wouldSend: 1, processed: 0 });
    expect(JSON.stringify(body)).not.toContain("clienta@prueba.test");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.writes).toEqual([]);
  });
});

describe("revisión de transferencias simulada", () => {
  it("cuenta por antigüedad y deja fuera las que ya tienen el aviso", async () => {
    const now = new Date();
    mocks.orders = [
      { id: "a", createdAt: subHours(now, 72), adminNotes: null },
      { id: "b", createdAt: subDays(now, 20), adminNotes: "Llamar el lunes" },
      { id: "c", createdAt: subDays(now, 200), adminNotes: BANK_TRANSFER_REVIEW_NOTE },
    ];
    const body = await (await call(bankTransfers, "bank-transfer-review", "cron-secret")).json();
    expect(body.stores[0]).toEqual({
      pending: 3,
      alreadyFlagged: 1,
      wouldFlag: 2,
      byAge: { upTo7Days: 1, upTo30Days: 1, olderThan30Days: 1 },
      flagged: 0,
    });
    expect(mocks.writes).toEqual([]);
  });

  it("el aviso se agrega debajo de las notas, nunca las reemplaza", () => {
    expect(appendBankTransferNote("Llamar el lunes")).toBe(`Llamar el lunes\n\n${BANK_TRANSFER_REVIEW_NOTE}`);
    expect(appendBankTransferNote(null)).toBe(BANK_TRANSFER_REVIEW_NOTE);
    expect(appendBankTransferNote("   ")).toBe(BANK_TRANSFER_REVIEW_NOTE);
  });
});

describe("clasificación ABC", () => {
  it("A hasta el 80 % de la utilidad, B hasta el 95 %, C el resto y lo que no dejó utilidad", () => {
    const classes = classifyAbc([
      { productId: "p1", totalProfit: 700 },
      { productId: "p2", totalProfit: 100 },
      { productId: "p3", totalProfit: 150 },
      { productId: "p4", totalProfit: 50 },
      { productId: "p5", totalProfit: -20 },
    ]);
    expect(Object.fromEntries(classes)).toEqual({ p1: "A", p3: "B", p2: "B", p4: "C", p5: "C" });
  });

  it("la simulación cuenta solo las filas que cambiarían de clase", async () => {
    mocks.products = [
      { id: "p1", abcClassification: "C" },
      { id: "p2", abcClassification: "C" },
    ];
    const body = await (await call(abc, "abc-classification", "cron-secret")).json();
    expect(body.stores[0]).toMatchObject({ products: 2, withSales: 0, target: { A: 0, B: 0, C: 2 }, wouldChange: 0, updated: 0 });
    expect(mocks.writes).toEqual([]);
  });
});
