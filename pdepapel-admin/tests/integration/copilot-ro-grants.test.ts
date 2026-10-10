import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * El usuario `copilot_ro` se crea en la base local con el MISMO archivo que
 * Christian corre en Railway, y las 11 herramientas corren con él. Si a las
 * concesiones les falta una columna, falla aquí y no en producción; y se
 * comprueba que no puede leer datos de clientas ni escribir.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: {} }),
  clerkClient: async () => ({ users: { getUser: async () => ({ publicMetadata: {} }) } }),
}));

const SQL_FILE = path.resolve(__dirname, "../../prisma/manual-migrations/20261010_create_copilot_ro_user.sql");
const password = `t${randomBytes(12).toString("hex")}`;
let roUrl = "";
let roClient: PrismaClient;
let fixture: InventoryFixture | undefined;

function statementsFor(databaseName: string) {
  return readFileSync(SQL_FILE, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .replaceAll("`railway`", `\`${databaseName}\``)
    .replace("<REEMPLAZAR_CONTRASEÑA>", password)
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

beforeAll(async () => {
  const base = new URL(process.env.DATABASE_URL as string);
  const databaseName = base.pathname.replace(/^\//, "");
  await testPrisma.$executeRawUnsafe("DROP USER IF EXISTS 'copilot_ro'@'%'");
  for (const statement of statementsFor(databaseName)) await testPrisma.$executeRawUnsafe(statement);

  base.username = "copilot_ro";
  base.password = password;
  roUrl = base.toString();
  process.env.COPILOT_DATABASE_URL = roUrl;
  globalThis.copilotPrisma = undefined;
  roClient = new PrismaClient({ datasourceUrl: roUrl });

  fixture = await createInventoryFixture();
  session.userId = fixture.store.userId;
  const store = fixture.store.id;
  const now = new Date();
  await testPrisma.order.create({
    data: {
      storeId: store,
      orderNumber: `ORD-COP-${randomBytes(4).toString("hex")}`,
      status: "PAID",
      type: "STANDARD",
      paidAt: now,
      fullName: "Clienta Ficticia",
      phone: "3000000000",
      email: "ficticia@prueba.test",
      address: "Calle Falsa 123",
      city: "Medellín",
      subtotal: 30000,
      total: 30000,
      orderItems: { create: [{ productId: fixture.component.id, quantity: 3, price: 10000, name: "Componente" }] },
      payment: { create: { storeId: store, method: "Bold" } },
    },
  });
  await testPrisma.inventoryMovement.create({
    data: { storeId: store, productId: fixture.component.id, type: "MANUAL_ADJUSTMENT", quantity: 2, previousStock: 1, newStock: 3, createdBy: "SYSTEM", reason: "texto libre" },
  });
  await testPrisma.taxPurchase.create({
    data: { storeId: store, invoiceNumber: "FAC-1", supplierName: "Proveedor ficticio", totalAmount: 50000, issuedAt: now },
  });
  const connection = await testPrisma.marketplaceConnection.create({
    data: { storeId: store, provider: "MERCADOLIBRE", status: "CONNECTED", sellerId: `seller-${randomBytes(4).toString("hex")}` },
  });
  await testPrisma.marketplaceListing.create({ data: { connectionId: connection.id, productId: fixture.component.id, externalItemId: `MCO-${randomBytes(4).toString("hex")}`, status: "ACTIVE" } });
  await testPrisma.marketplaceAlertState.create({
    data: { connectionId: connection.id, alertKey: "k1", kind: "stock_mismatch", fingerprint: "f1", firstSeenAt: now, lastSeenAt: now },
  });
  await testPrisma.marketplaceOrder.create({
    data: {
      connectionId: connection.id,
      externalOrderId: `200${randomBytes(4).toString("hex")}`,
      status: "PAID",
      inventoryStatus: "DECREMENTED",
      paidAt: now,
      totalAmount: 20000,
      netAmount: 15000,
      buyerName: "Comprador ficticio",
      items: { create: [{ productId: fixture.component.id, title: "Componente", quantity: 1, unitPrice: 20000, externalItemId: "MCO-X" }] },
    },
  });
});

afterAll(async () => {
  await roClient?.$disconnect();
  await globalThis.copilotPrisma?.$disconnect();
  globalThis.copilotPrisma = undefined;
  delete process.env.COPILOT_DATABASE_URL;
  if (fixture) {
    const connections = await testPrisma.marketplaceConnection.findMany({ where: { storeId: fixture.store.id }, select: { id: true } });
    const ids = connections.map((connection) => connection.id);
    const orders = await testPrisma.marketplaceOrder.findMany({ where: { connectionId: { in: ids } }, select: { id: true } });
    await testPrisma.marketplaceOrderItem.deleteMany({ where: { marketplaceOrderId: { in: orders.map((order) => order.id) } } });
    await testPrisma.marketplaceOrder.deleteMany({ where: { connectionId: { in: ids } } });
    await testPrisma.marketplaceAlertState.deleteMany({ where: { connectionId: { in: ids } } });
    await testPrisma.marketplaceListing.deleteMany({ where: { connectionId: { in: ids } } });
    await testPrisma.marketplaceConnection.deleteMany({ where: { id: { in: ids } } });
    await testPrisma.taxPurchase.deleteMany({ where: { storeId: fixture.store.id } });
    await testPrisma.inventoryMovement.deleteMany({ where: { storeId: fixture.store.id } });
    await deleteInventoryFixture(fixture);
  }
  await testPrisma.$executeRawUnsafe("DROP USER IF EXISTS 'copilot_ro'@'%'");
  await testPrisma.$disconnect();
});

describe("copilot_ro: las concesiones alcanzan para las 11 herramientas y nada más", () => {
  it("cada herramienta corre con el usuario de solo lectura", async () => {
    const { buildCopilotTools, COPILOT_TOOL_NAMES } = await import("@/lib/copiloto/tools");
    const tools = buildCopilotTools(fixture!.store.id);
    const now = new Date();
    const inputs: Record<string, unknown> = {
      resumenDeHoy: {},
      resumenFinancieroMes: { anio: now.getFullYear(), mes: now.getMonth() + 1 },
      compararMeses: { anio: now.getFullYear(), mes: now.getMonth() + 1 },
      ventasDelDiaPuntoDeVenta: { fecha: now.toISOString().slice(0, 10) },
      buscarProductos: { texto: "componente" },
      detalleProducto: { productId: fixture!.component.id },
      kardexProducto: { productId: fixture!.component.id, dias: 30 },
      porReponer: { limite: 5 },
      riesgoInventario: { limite: 5 },
      reporteTributario: { anio: now.getFullYear(), mes: now.getMonth() + 1 },
      saludMercadoLibre: {},
    };
    const results: Record<string, unknown> = {};
    for (const name of COPILOT_TOOL_NAMES) {
      const tool = tools[name] as unknown as { execute: (input: unknown, options: unknown) => Promise<unknown> };
      results[name] = await tool.execute(inputs[name], { toolCallId: name, messages: [] });
    }
    expect(Object.keys(results)).toHaveLength(11);
    expect(JSON.stringify(results)).not.toMatch(/Clienta Ficticia|ficticia@prueba\.test|3000000000|Calle Falsa|Comprador ficticio|texto libre|Proveedor ficticio/);
    expect((results.resumenDeHoy as { datos: { porCanal: Record<string, { ventas: number }> } }).datos.porCanal.tienda.ventas).toBe(30000);
    expect((results.buscarProductos as { datos: unknown[] }).datos.length).toBeGreaterThan(0);
    expect((results.saludMercadoLibre as { datos: { conectado: boolean } }).datos.conectado).toBe(true);
  });

  it("no puede leer los datos de la clienta", async () => {
    await expect(roClient.order.findFirst({ where: { storeId: fixture!.store.id }, select: { email: true } })).rejects.toThrow();
    await expect(roClient.order.findFirst({ where: { storeId: fixture!.store.id } })).rejects.toThrow();
    await expect(roClient.conversation.findFirst()).rejects.toThrow();
    await expect(roClient.marketplaceConnection.findFirst({ select: { accessToken: true } as never })).rejects.toThrow();
  });

  it("no puede escribir", async () => {
    await expect(roClient.product.update({ where: { id: fixture!.component.id }, data: { stock: 999 } })).rejects.toThrow();
    await expect(roClient.$executeRawUnsafe("DELETE FROM `Product` WHERE id = 'nadie'")).rejects.toThrow();
  });

  it("tiene tope de dos conexiones y solo SELECT", async () => {
    const limits = await testPrisma.$queryRawUnsafe<{ max_user_connections: number }[]>(
      "SELECT max_user_connections FROM mysql.user WHERE user = 'copilot_ro'",
    );
    expect(Number(limits[0].max_user_connections)).toBe(2);
    const grants = (await testPrisma.$queryRawUnsafe<Record<string, string>[]>("SHOW GRANTS FOR 'copilot_ro'@'%'")).map((row) => Object.values(row)[0]);
    expect(grants.filter((grant) => /GRANT (?!USAGE)/.test(grant)).every((grant) => /^GRANT SELECT/.test(grant))).toBe(true);
    expect(grants.join("\n")).not.toMatch(/Conversation|NewsletterSubscriber|GiftCard|CustomerReactivation/);
  });
});
