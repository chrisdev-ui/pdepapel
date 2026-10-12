import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";

import { copilotRoGrantFiles, copilotRoStatements } from "./helpers/copilot-ro";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * El usuario `copilot_ro` se crea en la base local con el MISMO archivo que
 * Christian corre en Railway, y las 12 herramientas corren con él. Si a las
 * concesiones les falta una columna, falla aquí y no en producción; y se
 * comprueba que no puede leer datos de clientas ni escribir.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: {} }),
  clerkClient: async () => ({ users: { getUser: async () => ({ publicMetadata: {} }) } }),
}));

const password = `t${randomBytes(12).toString("hex")}`;
let roUrl = "";
let roClient: PrismaClient;
let fixture: InventoryFixture | undefined;

const statementsFor = (databaseName: string) => copilotRoStatements(databaseName, password);

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
  if (fixture) {
    await testPrisma.productCatalogOptionValue.deleteMany({ where: { storeId: fixture.store.id } });
    await testPrisma.catalogOptionValue.deleteMany({ where: { storeId: fixture.store.id } });
    await testPrisma.catalogOption.deleteMany({ where: { storeId: fixture.store.id } });
    const synthetic = await testPrisma.product.findMany({ where: { storeId: fixture.store.id, description: { contains: "SINTETICO-DESC" } }, select: { id: true } });
    await testPrisma.productKit.deleteMany({ where: { kitId: { in: synthetic.map((row) => row.id) } } });
    await testPrisma.product.deleteMany({ where: { id: { in: synthetic.map((row) => row.id) } } });
    await testPrisma.productGroup.deleteMany({ where: { storeId: fixture.store.id } });
  }
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

describe("copilot_ro: las concesiones alcanzan para las 12 herramientas y nada más", () => {
  it("cada herramienta corre con el usuario de solo lectura", async () => {
    const { buildCopilotTools, COPILOT_TOOL_NAMES } = await import("@/lib/copiloto/tools");
    const tools = buildCopilotTools(fixture!.store.id);
    const now = new Date();
    const inputs: Record<string, unknown> = {
      resumenDeHoy: {},
      resumenFinancieroMes: { anio: now.getFullYear(), mes: now.getMonth() + 1 },
      compararMeses: { anio: now.getFullYear(), mes: now.getMonth() + 1 },
      // El día de Colombia, no el de UTC: entre las 7 p. m. y la medianoche ya son días distintos.
      ventasDelDiaPuntoDeVenta: { fecha: now.toLocaleDateString("en-CA", { timeZone: "America/Bogota" }) },
      buscarProductos: { texto: "componente" },
      detalleProducto: { productId: fixture!.component.id },
      kardexProducto: { productId: fixture!.component.id, dias: 30 },
      porReponer: { limite: 5 },
      riesgoInventario: { limite: 5 },
      reporteTributario: { anio: now.getFullYear(), mes: now.getMonth() + 1 },
      saludMercadoLibre: {},
      productosParaPromocionar: { limite: 8 },
    };
    const results: Record<string, unknown> = {};
    for (const name of COPILOT_TOOL_NAMES) {
      const tool = tools[name] as unknown as { execute: (input: unknown, options: unknown) => Promise<unknown> };
      results[name] = await tool.execute(inputs[name], { toolCallId: name, messages: [] });
    }
    expect(Object.keys(results)).toHaveLength(12);
    expect(JSON.stringify(results)).not.toMatch(/Clienta Ficticia|ficticia@prueba\.test|3000000000|Calle Falsa|Comprador ficticio|texto libre|Proveedor ficticio/);
    expect((results.resumenDeHoy as { datos: { porCanal: Record<string, { ventas: number }> } }).datos.porCanal.tienda.ventas).toBe(30000);
    expect((results.buscarProductos as { datos: unknown[] }).datos.length).toBeGreaterThan(0);
    expect((results.saludMercadoLibre as { datos: { conectado: boolean } }).datos.conectado).toBe(true);
    const promotion = (results.productosParaPromocionar as {
      datos: { criterios: { margenMinimoPct: number }; productos: { productId: string; unidades30Dias: number; enlaceConUtm: string; bandaDeMargen: string }[] };
    }).datos;
    expect(promotion.criterios.margenMinimoPct).toBe(35);
    const component = promotion.productos.find((row) => row.productId === fixture!.component.id);
    expect(component?.unidades30Dias).toBe(4);
    expect(component?.enlaceConUtm).toMatch(/^https:\/\/papeleriapdepapel\.com\/producto\/.+utm_source=social&utm_medium=paid_social&utm_campaign=producto-/);
    expect(JSON.stringify(promotion)).not.toMatch(/acqPrice|acquisitionCost|suggestedBudget/);
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

describe("copilot_ro: productoParaDescripcion (habilidad descripciones)", () => {
  const DESCRIPTION_GRANTS = () => {
    const file = copilotRoGrantFiles().find((name) => name.endsWith("grant_copilot_ro_descripciones.sql"))!;
    const database = new URL(process.env.DATABASE_URL as string).pathname.replace(/^\//, "");
    return readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .replaceAll("`railway`", `\`${database}\``)
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
  };
  let variantId = "";

  beforeAll(async () => {
    const store = fixture!.store.id;
    const attributes = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture!.component.id }, select: { colorId: true, sizeId: true, designId: true, categoryId: true } });
    const product = (data: Record<string, unknown>) =>
      testPrisma.product.create({
        data: { storeId: store, ...attributes, slug: `prueba-${randomBytes(4).toString("hex")}`, sku: `DES-${randomBytes(3).toString("hex").toUpperCase()}`, price: 9000, stock: 3, acqPrice: 4000, transportationCost: 300, ...data } as never,
      });
    const group = await testPrisma.productGroup.create({ data: { storeId: store, name: "Libretas Prueba", description: "<p>Base del grupo SINTETICO-DESC</p>", brand: "Marca Grupo" } as never });
    variantId = (await product({ name: "Libreta Prueba Rosa", description: "<p>Libreta rosada SINTETICO-DESC</p>", productGroupId: group.id, abcClassification: "A" })).id;
    await product({ name: "Libreta Prueba Azul", description: "<p>SINTETICO-DESC</p>", productGroupId: group.id });
    const kit = await product({ name: "Kit Prueba Escolar", description: "<p>Kit SINTETICO-DESC</p>", isKit: true });
    await testPrisma.productKit.create({ data: { kitId: kit.id, componentId: fixture!.component.id, quantity: 2 } as never });
    const option = await testPrisma.catalogOption.create({ data: { storeId: store, key: `punta-${randomBytes(2).toString("hex")}`, name: "Punta" } as never });
    const value = await testPrisma.catalogOptionValue.create({ data: { storeId: store, optionId: option.id, name: "Fina", value: "fina" } as never });
    await testPrisma.productCatalogOptionValue.create({ data: { storeId: store, productId: variantId, optionId: option.id, optionValueId: value.id } as never });
  });

  const run = async (input: Record<string, unknown>) => {
    const { productoParaDescripcionTool } = await import("@/lib/copiloto/skills/descripciones-tool");
    const tool = productoParaDescripcionTool(fixture!.store.id) as unknown as { execute: (input: unknown) => Promise<Record<string, unknown>> };
    return tool.execute(input);
  };
  const keysOf = (value: unknown): string[] =>
    value && typeof value === "object" ? Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]) : [];

  it("trae atributos, grupo, hermanas y opciones con las concesiones nuevas, y nunca costos ni precio", async () => {
    const result = (await run({ nombre: "Libreta Prueba Rosa" })) as { encontrado: boolean; datos: Record<string, unknown> };
    expect(result.encontrado).toBe(true);
    expect(result.datos).toMatchObject({
      nombre: "Libreta Prueba Rosa",
      marca: null,
      marcaVaciaEnFicha: true,
      grupo: { nombre: "Libretas Prueba", marca: "Marca Grupo", descripcionBase: "Base del grupo SINTETICO-DESC" },
      variantesHermanas: [expect.objectContaining({ nombre: "Libreta Prueba Azul" })],
      opcionesDeCatalogo: [{ opcion: "Punta", valor: "Fina" }],
      popularidadPermitida: true,
      escasezPermitida: true,
      avisoPermisos: null,
    });
    expect(keysOf(result).filter((key) => /acq|cost|transport|margin|margen|profit|price|precio|stock/i.test(key))).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/4000|9000/);

    const kit = (await run({ nombre: "Kit Prueba Escolar" })) as { datos: { esKit: boolean; kitIncluye: { cantidad: number }[] } };
    expect(kit.datos.esKit).toBe(true);
    expect(kit.datos.kitIncluye).toEqual([expect.objectContaining({ cantidad: 2 })]);
    expect(await run({ nombre: "Producto que no existe" })).toMatchObject({ encontrado: false });
  });

  it("sin las concesiones nuevas responde igual con lo básico y avisa qué falta, sin romperse", async () => {
    for (const statement of DESCRIPTION_GRANTS()) await testPrisma.$executeRawUnsafe(statement.replace(/^GRANT SELECT/, "REVOKE SELECT").replace(/ TO 'copilot_ro'/, " FROM 'copilot_ro'"));
    try {
      const result = (await run({ nombre: "Libreta Prueba Rosa" })) as { encontrado: boolean; datos: Record<string, unknown> };
      expect(result.encontrado).toBe(true);
      expect(result.datos).toMatchObject({ nombre: "Libreta Prueba Rosa", atributosInternos: null, grupo: null, kitIncluye: [] });
      expect(String(result.datos.avisoPermisos)).toContain("falta un permiso de lectura");
    } finally {
      for (const statement of DESCRIPTION_GRANTS()) await testPrisma.$executeRawUnsafe(statement);
    }
  });
});
