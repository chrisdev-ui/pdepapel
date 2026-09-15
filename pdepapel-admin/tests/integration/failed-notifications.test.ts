import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { recordFailedNotification } from "@/lib/notification-failures";
import { testPrisma } from "./helpers/database";

const suffix = randomUUID().slice(0, 8);
let storeId = "";

beforeAll(async () => {
  const store = await testPrisma.store.create({
    data: { name: `Avisos ${suffix}`, userId: `owner-${suffix}` },
  });
  storeId = store.id;
});

afterAll(async () => {
  await testPrisma.failedNotification.deleteMany({ where: { storeId } });
  await testPrisma.store.delete({ where: { id: storeId } });
});

describe("un aviso que no salió queda registrado", () => {
  it("se puede buscar después por tienda y por pedido", async () => {
    await recordFailedNotification({
      storeId,
      channel: "EMAIL",
      kind: "order:PAID",
      recipient: "laura@example.com",
      orderId: "order-123",
      error: new Error("Resend respondió 429"),
    });

    const filas = await testPrisma.failedNotification.findMany({
      where: { storeId },
    });
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      channel: "EMAIL",
      kind: "order:PAID",
      recipient: "laura@example.com",
      orderId: "order-123",
      resolvedAt: null,
    });
    expect(filas[0].error).toContain("429");
  });

  it("registrar el fallo nunca tumba la operación que lo provocó", async () => {
    // Una tienda inexistente rompería el insert; aun así no debe lanzar.
    await expect(
      recordFailedNotification({
        storeId: "tienda-que-no-existe",
        channel: "WHATSAPP",
        kind: "presale:delay",
        error: "sin conexión",
      }),
    ).resolves.toBeUndefined();
  });

  it("recorta un error desmedido en vez de rechazarlo", async () => {
    await recordFailedNotification({
      storeId,
      channel: "EMAIL",
      kind: "order:SENT",
      error: "x".repeat(5000),
    });

    const fila = await testPrisma.failedNotification.findFirst({
      where: { storeId, kind: "order:SENT" },
    });
    expect(fila?.error.length).toBeLessThanOrEqual(2000);
  });
});
