import { afterEach, describe, expect, it, vi } from "vitest";

import { MAX_WAIT_TIME, TIMEOUT_TIME } from "@/constants";

import { createProdClient, PROD_TRANSACTION_OPTIONS, ProdWriteBlockedError } from "../../../scripts/lib/prod-client.mjs";

/** Cliente falso con la misma forma de `$extends` que Prisma: sólo interesa la decisión. */
function fakeClient() {
  const calls: string[] = [];
  const transactions: { input: unknown; options: unknown }[] = [];
  const client = {
    calls,
    transactions,
    $extends(extension: { query: { $allModels: { $allOperations: (ctx: { model: string; operation: string; args: unknown; query: (args: unknown) => Promise<string> }) => Promise<unknown> } } }) {
      const hook = extension.query.$allModels.$allOperations;
      const run = (model: string, operation: string) =>
        hook({ model, operation, args: {}, query: async () => { calls.push(`${model}.${operation}`); return "ok"; } });
      return {
        run,
        async $transaction(input: unknown, options: unknown) {
          transactions.push({ input, options });
          return "tx";
        },
      };
    },
  };
  return client;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createProdClient", () => {
  it("refuses to exist outside prod-write", () => {
    vi.stubEnv("PROD_WRITE_APPROVED", "");
    expect(() => createProdClient({ client: fakeClient() as never })).toThrow(/prod:write/);
  });

  it("blocks ledger deletes the approved reason does not name, and lets the rest through", async () => {
    vi.stubEnv("PROD_WRITE_APPROVED", "1");
    const base = fakeClient();
    const db = createProdClient({ reason: "borrar productos de prueba ZZ", client: base as never }) as unknown as { run: (m: string, o: string) => Promise<unknown> };
    await expect(db.run("InventoryMovement", "deleteMany")).rejects.toBeInstanceOf(ProdWriteBlockedError);
    await expect(db.run("Order", "update")).rejects.toThrow(/libro mayor/);
    await expect(db.run("Product", "deleteMany")).resolves.toBe("ok");
    await expect(db.run("InventoryMovement", "findMany")).resolves.toBe("ok");
    expect(base.calls).toEqual(["Product.deleteMany", "InventoryMovement.findMany"]);
  });

  it("allows a ledger write when the reason names the model", async () => {
    vi.stubEnv("PROD_WRITE_APPROVED", "1");
    const db = createProdClient({ reason: "borrar el kardex del producto de prueba", client: fakeClient() as never }) as unknown as { run: (m: string, o: string) => Promise<unknown> };
    await expect(db.run("InventoryMovement", "deleteMany")).resolves.toBe("ok");
  });

  it("gives every interactive transaction the panel's options unless the script sets its own", async () => {
    vi.stubEnv("PROD_WRITE_APPROVED", "1");
    const base = fakeClient();
    const db = createProdClient({ reason: "x", client: base as never }) as unknown as { $transaction: (input: unknown, options?: unknown) => Promise<unknown> };
    const fn = async () => "done";
    await db.$transaction(fn);
    await db.$transaction(fn, { timeout: 120_000 });
    await db.$transaction(["a", "b"]);
    expect(base.transactions).toEqual([
      { input: fn, options: { isolationLevel: "Serializable", maxWait: 30_000, timeout: 60_000 } },
      { input: fn, options: { isolationLevel: "Serializable", maxWait: 30_000, timeout: 120_000 } },
      { input: ["a", "b"], options: undefined },
    ]);
  });

  it("keeps the same limits as the panel's client", () => {
    expect(PROD_TRANSACTION_OPTIONS).toEqual({ isolationLevel: "Serializable", maxWait: MAX_WAIT_TIME, timeout: TIMEOUT_TIME });
  });
});
