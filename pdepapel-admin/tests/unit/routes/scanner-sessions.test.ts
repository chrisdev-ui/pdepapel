import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PAIRING_TTL_MS } from "@/lib/scanner-pairing";

type Session = {
  id: string;
  storeId: string;
  code: string;
  createdByUserId: string;
  pairedUserId: string | null;
  pairingToken: string | null;
  deviceLabel: string | null;
  pairedAt: Date | null;
  lastActivityAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};
type Scan = { id: string; sessionId: string; code: string; createdAt: Date };

const db = vi.hoisted(() => ({
  sessions: [] as Session[],
  scans: [] as Scan[],
  userId: "owner" as string | null,
  reset() {
    this.sessions = [];
    this.scans = [];
    this.userId = "owner";
  },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: db.userId }) }));
vi.mock("@/lib/utils", async () => {
  const { ErrorFactory } = await import("@/lib/api-errors");
  return {
    verifyStoreOwner: async (userId: string, storeId: string) => {
      if (userId !== "owner" || storeId !== "store-1") throw ErrorFactory.Unauthorized();
    },
  };
});
vi.mock("@/lib/prismadb", () => {
  let counter = 0;
  const pick = <T extends object>(row: T, select?: Record<string, boolean>) =>
    select ? (Object.fromEntries(Object.entries(row).filter(([key]) => select[key])) as Partial<T>) : row;
  return {
    default: {
      scannerSession: {
        findUnique: async ({ where, select }: { where: { storeId_code?: { storeId: string; code: string }; id?: string }; select?: Record<string, boolean> }) => {
          const row = db.sessions.find((s) => (where.storeId_code ? s.storeId === where.storeId_code.storeId && s.code === where.storeId_code.code : s.id === where.id));
          return row ? pick(row, select) : null;
        },
        create: async ({ data, select }: { data: Partial<Session>; select?: Record<string, boolean> }) => {
          counter += 1;
          const row: Session = {
            id: `session-${counter}`,
            storeId: data.storeId!,
            code: data.code!,
            createdByUserId: data.createdByUserId!,
            pairedUserId: null,
            pairingToken: null,
            deviceLabel: null,
            pairedAt: null,
            lastActivityAt: new Date(),
            expiresAt: data.expiresAt!,
            revokedAt: null,
            createdAt: new Date(),
          };
          db.sessions.push(row);
          return pick(row, select);
        },
        update: async ({ where, data, select }: { where: { id: string }; data: Partial<Session>; select?: Record<string, boolean> }) => {
          const row = db.sessions.find((s) => s.id === where.id)!;
          Object.assign(row, data);
          return pick(row, select);
        },
      },
      scannerScan: {
        create: async ({ data, select }: { data: { sessionId: string; code: string }; select?: Record<string, boolean> }) => {
          counter += 1;
          const row: Scan = { id: `scan-${counter}`, sessionId: data.sessionId, code: data.code, createdAt: new Date(Date.now() + counter) };
          db.scans.push(row);
          return pick(row, select);
        },
        findMany: async ({ where, take }: { where: { sessionId: string; createdAt?: { gt: Date } }; take: number }) =>
          db.scans
            .filter((s) => s.sessionId === where.sessionId && (!where.createdAt || s.createdAt > where.createdAt.gt))
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .slice(0, take)
            .map(({ id, code, createdAt }) => ({ id, code, createdAt })),
      },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    },
  };
});

import { POST as createSession } from "@/app/api/[storeId]/scanner-sessions/route";
import { DELETE as revokeSession, GET as readSession } from "@/app/api/[storeId]/scanner-sessions/[code]/route";
import { POST as pairPhone } from "@/app/api/[storeId]/scanner-sessions/[code]/pair/route";
import { POST as sendScan } from "@/app/api/[storeId]/scanner-sessions/[code]/scans/route";

const base = "http://localhost:3001/api/store-1/scanner-sessions";
const params = (code?: string) => ({ params: { storeId: "store-1", ...(code ? { code } : {}) } }) as never;
const post = (url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(url, { method: "POST", body: body ? JSON.stringify(body) : undefined, headers: { "content-type": "application/json", ...headers } });

async function openSession() {
  const response = await createSession(post(base), params());
  return (await response.json()) as { code: string; pairUrl: string; expiresAt: string };
}

/**
 * La vinculación completa, de punta a punta, sin base de datos: crear el
 * código, vincular el celular (con la misma sesión de Clerk), enviar lecturas,
 * recogerlas desde la pantalla, vencer, desvincular y reemplazar un celular.
 */
describe("scanner sessions API", () => {
  beforeEach(() => db.reset());

  it("creates a session with the pairing link for the QR", async () => {
    const session = await openSession();
    expect(session.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(session.pairUrl).toBe(`http://localhost:3001/store-1/escaner?codigo=${session.code}`);
    expect(Date.parse(session.expiresAt) - Date.now()).toBeGreaterThan(PAIRING_TTL_MS - 5000);
  });

  it("refuses an unauthenticated phone and a phone signed in as someone else", async () => {
    const { code } = await openSession();
    db.userId = null;
    expect((await pairPhone(post(`${base}/${code}/pair`), params(code))).status).toBe(401);
    db.userId = "intruder";
    expect((await pairPhone(post(`${base}/${code}/pair`), params(code))).status).toBe(403);
    expect(db.sessions[0].pairedAt).toBeNull();
  });

  it("pairs, delivers scans to the screen after its cursor and extends the expiry on each scan", async () => {
    const { code } = await openSession();
    const paired = await pairPhone(post(`${base}/${code}/pair`, undefined, { "user-agent": "Mozilla/5.0 (iPhone) Safari/604.1" }), params(code));
    expect(paired.status).toBe(200);
    const { token, deviceLabel } = (await paired.json()) as { token: string; deviceLabel: string };
    expect(deviceLabel).toBe("iPhone · Safari");

    const before = db.sessions[0].expiresAt.getTime();
    db.sessions[0].expiresAt = new Date(before - 60_000); // simula un minuto de espera
    const scan = await sendScan(post(`${base}/${code}/scans`, { token, code: "CAR-AES-ROS-S-L-9090" }), params(code));
    expect(scan.status).toBe(200);
    expect(db.sessions[0].expiresAt.getTime()).toBeGreaterThan(before - 60_000);

    const first = await readSession(new NextRequest(`${base}/${code}`), params(code));
    const firstBody = (await first.json()) as { status: string; deviceLabel: string; scans: { code: string; createdAt: string }[] };
    expect(firstBody.status).toBe("paired");
    expect(firstBody.scans.map((s) => s.code)).toEqual(["CAR-AES-ROS-S-L-9090"]);

    await sendScan(post(`${base}/${code}/scans`, { token, code: "PDP:abc" }), params(code));
    const cursor = firstBody.scans[0].createdAt;
    const second = await readSession(new NextRequest(`${base}/${code}?after=${encodeURIComponent(cursor)}`), params(code));
    expect(((await second.json()) as { scans: { code: string }[] }).scans.map((s) => s.code)).toEqual(["PDP:abc"]);
  });

  it("re-pairing with the same code hands the session to the new phone and the old one is refused", async () => {
    const { code } = await openSession();
    const first = (await (await pairPhone(post(`${base}/${code}/pair`), params(code))).json()) as { token: string };
    const second = (await (await pairPhone(post(`${base}/${code}/pair`), params(code))).json()) as { token: string; replaced: boolean };
    expect(second.replaced).toBe(true);
    expect(second.token).not.toBe(first.token);
    const stale = await sendScan(post(`${base}/${code}/scans`, { token: first.token, code: "X" }), params(code));
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { details?: { code?: string } }).details?.code).toBe("REPLACED");
    expect((await sendScan(post(`${base}/${code}/scans`, { token: second.token, code: "X" }), params(code))).status).toBe(200);
  });

  it("an expired session cannot be paired or scanned into, and the screen sees it expired", async () => {
    const { code } = await openSession();
    db.sessions[0].expiresAt = new Date(Date.now() - 1000);
    const pair = await pairPhone(post(`${base}/${code}/pair`), params(code));
    expect(pair.status).toBe(409);
    expect(((await pair.json()) as { details?: { code?: string } }).details?.code).toBe("EXPIRED");
    const read = await readSession(new NextRequest(`${base}/${code}`), params(code));
    expect(((await read.json()) as { status: string }).status).toBe("expired");
  });

  it("unlinking from the screen revokes the session for the phone", async () => {
    const { code } = await openSession();
    const { token } = (await (await pairPhone(post(`${base}/${code}/pair`), params(code))).json()) as { token: string };
    expect((await revokeSession(new NextRequest(`${base}/${code}`, { method: "DELETE" }), params(code))).status).toBe(200);
    const scan = await sendScan(post(`${base}/${code}/scans`, { token, code: "X" }), params(code));
    expect(scan.status).toBe(409);
    expect(((await scan.json()) as { details?: { code?: string } }).details?.code).toBe("REVOKED");
    expect(db.scans).toHaveLength(0);
  });

  it("answers 404 for a code that does not exist", async () => {
    expect((await readSession(new NextRequest(`${base}/ZZZZZZ`), params("ZZZZZZ"))).status).toBe(404);
  });
});
