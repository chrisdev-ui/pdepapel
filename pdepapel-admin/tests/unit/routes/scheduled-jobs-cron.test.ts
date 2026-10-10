import { subDays, subHours } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Los tres trabajos que heredamos de `scheduler.yml`. Todos piden el secreto
 * del cron (también cuando falta, que antes dejaba pasar «Bearer undefined»)
 * y su simulación no escribe nada ni devuelve correos. ABC y la revisión de
 * transferencias están encendidos; la reactivación sigue apagada y, cuando
 * corra, solo escribe a quien tiene el boletín activo (Ley 1581).
 */
const mocks = vi.hoisted(() => ({
  env: { CRON_SECRET: "cron-secret" } as Record<string, string | undefined>,
  record: vi.fn(),
  send: vi.fn(),
  writes: [] as string[],
  rawStatements: [] as { sql: string; values: unknown[] }[],
  orders: [] as unknown[],
  orderQueries: [] as unknown[],
  oldUnpaid: 0,
  products: [] as unknown[],
  subscribers: [] as { emailNormalized: string }[],
  subscriberQueries: [] as unknown[],
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
      if (model === "$executeRaw") {
        return async (strings: TemplateStringsArray, ...values: unknown[]) => {
          mocks.writes.push("$executeRaw");
          mocks.rawStatements.push({ sql: strings.join("?"), values });
          return 2;
        };
      }
      return new Proxy({} as Record<string, unknown>, {
        get: (_m, method: string) => {
          if (/^(create|update|upsert|delete)/.test(method)) {
            return async () => {
              mocks.writes.push(`${model}.${method}`);
              return { count: 1 };
            };
          }
          if (model === "store" && method === "findMany") return async () => [{ id: "store-1" }];
          if (model === "store" && method === "findUnique") return async () => ({ id: "store-1", name: "Tienda", email: "" });
          if (model === "order" && method === "findMany") {
            return async (query: unknown) => {
              mocks.orderQueries.push(query);
              return mocks.orders;
            };
          }
          if (model === "order" && method === "count") return async () => mocks.oldUnpaid;
          if (model === "product" && method === "findMany") return async () => mocks.products;
          if (model === "newsletterSubscriber" && method === "findMany") {
            return async (query: unknown) => {
              mocks.subscriberQueries.push(query);
              return mocks.subscribers;
            };
          }
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
  BANK_TRANSFER_REVIEW_MARKER,
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
  mocks.rawStatements.length = 0;
  mocks.orders = [];
  mocks.orderQueries.length = 0;
  mocks.oldUnpaid = 0;
  mocks.products = [];
  mocks.subscribers = [];
  mocks.subscriberQueries.length = 0;
});

describe("los trabajos heredados del programador", () => {
  it("ABC y la revisión de transferencias encendidos; la reactivación, apagada", () => {
    expect(SCHEDULED_JOBS["abc-classification"].enabled).toBe(true);
    expect(SCHEDULED_JOBS["bank-transfer-review"].enabled).toBe(true);
    expect(SCHEDULED_JOBS["customer-reactivation"].enabled).toBe(false);
  });

  it.each(routes)("$name pide el secreto del cron, aunque falte la variable", async ({ name, handler }) => {
    expect((await call(handler, name)).status).toBe(403);
    expect((await call(handler, name, "otro")).status).toBe(403);
    mocks.env.CRON_SECRET = undefined;
    expect((await call(handler, name, "undefined")).status).toBe(403);
    expect(mocks.writes).toEqual([]);
  });

  it("la reactivación rechaza mode=apply mientras está apagada", async () => {
    const response = await call(reactivation, "customer-reactivation", "cron-secret", "?mode=apply");
    expect(response.status).toBe(409);
    expect(mocks.writes).toEqual([]);
    expect(mocks.send).not.toHaveBeenCalled();
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

describe("reactivación: solo con consentimiento", () => {
  const lastPurchase = subDays(new Date(), 90);
  const order = (id: string, email: string) => ({
    id,
    email,
    fullName: "Clienta Prueba",
    phone: "3000000000",
    total: 40000,
    netProfit: 10000,
    createdAt: lastPurchase,
    paidAt: lastPurchase,
    orderItems: [],
    payment: null,
    shipping: null,
  });

  it("cuenta solo a quien tiene el boletín activo, sin cupón, sin correo y sin direcciones en la respuesta", async () => {
    mocks.orders = [order("o-1", "Con.Permiso@prueba.test"), order("o-2", "sin-permiso@prueba.test")];
    mocks.subscribers = [{ emailNormalized: "con.permiso@prueba.test" }];

    const body = await (await call(reactivation, "customer-reactivation", "cron-secret")).json();

    expect(body.stores[0]).toMatchObject({ inactive: 2, withoutConsent: 1, eligible: 1, recentlyContacted: 0, wouldSend: 1, processed: 0 });
    expect(mocks.subscriberQueries[0]).toMatchObject({
      where: { status: "ACTIVE", unsubscribedAt: null, emailNormalized: { in: ["con.permiso@prueba.test", "sin-permiso@prueba.test"] } },
    });
    expect(JSON.stringify(body)).not.toContain("@prueba.test");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.writes).toEqual([]);
  });

  it("sin ningún registro de consentimiento no queda nadie", async () => {
    mocks.orders = [order("o-1", "alguien@prueba.test")];
    const body = await (await call(reactivation, "customer-reactivation", "cron-secret")).json();
    expect(body.stores[0]).toMatchObject({ inactive: 1, withoutConsent: 1, wouldSend: 0 });
  });
});

describe("revisión de transferencias", () => {
  it("mira solo entre 48 h y 30 días, cuenta las más viejas aparte y deja fuera las que ya tienen el aviso", async () => {
    const now = new Date();
    mocks.orders = [
      { id: "a", createdAt: subHours(now, 72), adminNotes: null },
      { id: "b", createdAt: subDays(now, 20), adminNotes: "Llamar el lunes" },
      { id: "c", createdAt: subDays(now, 10), adminNotes: `[Automático] 2026-10-01 — ${BANK_TRANSFER_REVIEW_NOTE}` },
    ];
    mocks.oldUnpaid = 2;

    const body = await (await call(bankTransfers, "bank-transfer-review", "cron-secret")).json();

    expect(body.stores[0]).toEqual({
      pending: 3,
      alreadyFlagged: 1,
      skippedOlderThan30Days: 2,
      wouldFlag: 2,
      byAge: { upTo7Days: 1, upTo30Days: 2 },
      flagged: 0,
    });
    const where = (mocks.orderQueries[0] as { where: { createdAt: { lt: Date; gte: Date } } }).where;
    expect(Math.round((now.getTime() - where.createdAt.gte.getTime()) / 86_400_000)).toBe(30);
    expect(Math.round((now.getTime() - where.createdAt.lt.getTime()) / 3_600_000)).toBe(48);
    expect(mocks.writes).toEqual([]);
  });

  it("con mode=apply agrega el aviso y registra la corrida", async () => {
    mocks.orders = [{ id: "a", createdAt: subHours(new Date(), 72), adminNotes: "Llamar el lunes" }];
    const body = await (await call(bankTransfers, "bank-transfer-review", "cron-secret", "?mode=apply")).json();
    expect(body.stores[0]).toMatchObject({ wouldFlag: 1, flagged: 1 });
    expect(mocks.writes).toEqual(["order.updateMany"]);
    expect(mocks.record).toHaveBeenCalledWith("bank-transfer-review", expect.objectContaining({ ok: true }));
  });

  it("el aviso va con fecha de Colombia y «[Automático]», debajo de las notas, nunca en su lugar", () => {
    const now = new Date("2026-10-11T03:30:00Z");
    const line = `[Automático] 2026-10-10 — ${BANK_TRANSFER_REVIEW_NOTE}`;
    expect(appendBankTransferNote("Llamar el lunes", now)).toBe(`Llamar el lunes\n\n${line}`);
    expect(appendBankTransferNote(null, now)).toBe(line);
    expect(appendBankTransferNote("   ", now)).toBe(line);
    expect(line).toContain(BANK_TRANSFER_REVIEW_MARKER);
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
      { id: "p2", abcClassification: "A" },
    ];
    const body = await (await call(abc, "abc-classification", "cron-secret")).json();
    expect(body.stores[0]).toMatchObject({ products: 2, withSales: 0, target: { A: 0, B: 0, C: 2 }, wouldChange: 1, updated: 0 });
    expect(mocks.writes).toEqual([]);
  });

  it("al aplicar cambia solo la columna de la clase, sin tocar updatedAt", async () => {
    mocks.products = [
      { id: "p1", abcClassification: null },
      { id: "p2", abcClassification: "A" },
    ];
    const body = await (await call(abc, "abc-classification", "cron-secret", "?mode=apply")).json();
    expect(body.stores[0]).toMatchObject({ wouldChange: 2, updated: 2 });
    expect(mocks.writes).toEqual(["$executeRaw"]);
    expect(mocks.rawStatements[0].sql).toMatch(/UPDATE `Product` SET `abcClassification` = \?/);
    expect(mocks.rawStatements[0].sql).not.toMatch(/updatedAt/);
    expect(mocks.record).toHaveBeenCalledWith("abc-classification", expect.objectContaining({ ok: true }));
  });
});
