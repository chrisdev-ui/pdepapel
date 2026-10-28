import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { testPrisma } from "./helpers/database";

vi.mock("@/lib/store-access", () => ({ requireStoreOwner: vi.fn().mockResolvedValue("owner") }));

import { getCommandUsage } from "@/app/(dashboard)/[storeId]/(routes)/conversaciones/comandos/server/get-commands";

/** El resumen de la página Comandos lee los motivos que ya guarda cada fila: 14 días y solo esta tienda. */
const suffix = randomUUID().slice(0, 8);
let storeId = "";
let otherStoreId = "";
const now = new Date("2026-10-28T15:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

beforeAll(async () => {
  storeId = (await testPrisma.store.create({ data: { name: `Comandos ${suffix}`, userId: `u-cmd-${suffix}` } })).id;
  otherStoreId = (await testPrisma.store.create({ data: { name: `Otra ${suffix}`, userId: `u-cmd-o-${suffix}` } })).id;
  const row = (store: string, command: string, outcome: string | null, createdAt: Date) => ({
    storeId: store, echoId: `wamid.${randomUUID()}`, command, status: outcome ? "DONE" : "RECEIVED", outcome, sentAt: createdAt, createdAt,
  });
  await testPrisma.whatsAppAdminCommand.createMany({
    data: [
      row(storeId, "pedido", "draft_linked", daysAgo(1)),
      row(storeId, "pedido", "missing_contact", daysAgo(2)),
      row(storeId, "pedido", "missing_contact", daysAgo(3)),
      row(storeId, "pedido", "bad_phone", daysAgo(13)),
      row(storeId, "pedido", "bad_phone", daysAgo(20)),
      row(storeId, "estado", "ok", daysAgo(5)),
      row(otherStoreId, "pedido", "missing_contact", daysAgo(1)),
    ],
  });
});
afterAll(async () => {
  await testPrisma.whatsAppAdminCommand.deleteMany({ where: { storeId: { in: [storeId, otherStoreId] } } });
  await testPrisma.store.deleteMany({ where: { id: { in: [storeId, otherStoreId] } } });
});

describe("Comandos: resumen de 14 días", () => {
  it("cuenta por comando lo que salió bien y cada motivo de error, sin filas viejas ni de otra tienda", async () => {
    const usage = await getCommandUsage(storeId, now);
    expect(usage).toEqual([
      {
        command: "pedido",
        total: 4,
        ok: 1,
        errors: [
          { outcome: "missing_contact", label: "sin celular ni @usuario", count: 2 },
          { outcome: "bad_phone", label: "celular inválido", count: 1 },
        ],
      },
      { command: "estado", total: 1, ok: 1, errors: [] },
    ]);
  });
});
