import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";

import { copilotRoGrantFiles, copilotRoStatements } from "./helpers/copilot-ro";
import { assertTestDatabaseUrl } from "../../scripts/lib/test-database.mjs";
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
  roClient = new PrismaClient({ datasourceUrl: assertTestDatabaseUrl(roUrl, { variable: "COPILOT_DATABASE_URL", context: "copilot-ro-grants" }) });

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
    await testPrisma.category.deleteMany({ where: { storeId: fixture.store.id, id: { not: fixture.category.id } } });
    await testPrisma.type.deleteMany({ where: { storeId: fixture.store.id, id: { not: fixture.category.typeId } } });
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
    // Pedidos de prueba sin envío por unidad en su costo: la nota sale con la cuenta.
    const month = (results.resumenFinancieroMes as { datos: { pedidos: number; envioNoRegistrado?: { pedidos: number; nota: string } } }).datos;
    expect(month.envioNoRegistrado?.pedidos).toBe(month.pedidos);
    expect(month.envioNoRegistrado?.nota).toBe(`Envío no registrado en ${month.pedidos} de ${month.pedidos} pedidos: la ganancia real puede ser menor.`);
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

  it("las herramientas de Precios corren con el usuario de solo lectura", async () => {
    const store = fixture!.store.id;
    const order = await testPrisma.order.findFirstOrThrow({ where: { storeId: store, status: "PAID" }, select: { id: true } });
    await testPrisma.shipping.upsert({ where: { orderId: order.id }, update: { cost: 9000 }, create: { orderId: order.id, storeId: store, cost: 9000 } });
    const { buildSkillTools } = await import("@/lib/copiloto/skills/tools");
    const tools = buildSkillTools(store, { alreadyLoaded: ["precios"], notesFor: async () => [] });
    const run = (name: "calcularPrecio" | "compararPacks" | "margenesBajoMinimo", input: unknown) =>
      (tools[name] as unknown as { execute: (input: unknown, options: unknown) => Promise<{ datos: Record<string, unknown> }> }).execute(input, { toolCallId: name, messages: [] });

    const price = await run("calcularPrecio", { costoUnitario: 4500, parecidoA: "componente" });
    expect(price.datos).toMatchObject({ tienda: { minimo: { margenPct: 35 } }, mercadolibre: { vinculado: null } });
    expect((price.datos.mercadolibre as { opciones: { tipo: string; estimado: { withoutFixedFee: boolean } }[] }).opciones.map((option) => [option.tipo, option.estimado.withoutFixedFee])).toEqual([
      ["gold_special", true],
      ["gold_pro", true],
    ]);

    // Con publicación vinculada (tipo y categoría), la consulta de la publicación también corre como copilot_ro.
    await testPrisma.marketplaceListing.updateMany({ where: { productId: fixture!.component.id }, data: { listingType: "gold_pro", categoryId: "MCO1672" } });
    const { computePrice } = await import("@/lib/copiloto/skills/precios-tool");
    const { withCopilotQuery } = await import("@/lib/copiloto/db");
    const linked = await withCopilotQuery((db) => computePrice(db, store, { costoUnitario: 4500, parecidoA: "componente", canal: "mercadolibre" }));
    expect(linked.datos.mercadolibre).toMatchObject({ vinculado: { tipo: "gold_pro" } });
    expect(linked.datos.cotizar).toMatchObject({ listingType: "gold_pro", categoryId: "MCO1672", siteId: "MCO" });
    expect((price.datos.parecidos as { vendidas30Dias: number }[])[0].vendidas30Dias).toBe(3);

    const packs = await run("compararPacks", { costoUnitario: 150, disponible: 150, tamanos: [10, 20, 30], preciosPorPack: [{ tamano: 10, precio: 8000 }] });
    expect((packs.datos.tamanos as { price: number }[]).map((row) => row.price)).toEqual([8000, 14900, 20900]);
    expect(packs.datos.envioTipico).toEqual({ mediana: 9000, pedidos: 1 });

    const below = await run("margenesBajoMinimo", { margenes: [35, 40] });
    expect(below.datos).toMatchObject({ sinMargen: false, minimoConfigurado: 35 });
    expect(JSON.stringify([price, packs, below])).not.toMatch(/Clienta Ficticia|ficticia@prueba\.test|3000000000|Calle Falsa/);
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
    expect(result.datos.especificaciones).toEqual(
      expect.arrayContaining([
        { clave: "Marca", valor: "Marca Grupo", fuente: "ficha" },
        { clave: "Línea", valor: "Libretas Prueba", fuente: "ficha" },
      ]),
    );
    expect(keysOf(result).filter((key) => /acq|cost|transport|margin|margen|profit|price|precio|stock/i.test(key))).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/4000|9000/);

    const kit = (await run({ nombre: "Kit Prueba Escolar" })) as { datos: { esKit: boolean; kitIncluye: { cantidad: number }[] } };
    expect(kit.datos.esKit).toBe(true);
    expect(kit.datos.kitIncluye).toEqual([expect.objectContaining({ cantidad: 2 })]);
    expect(await run({ nombre: "Producto que no existe" })).toMatchObject({ encontrado: false });
  });

  it("busca como habla Paula, y si solo existe desactivado lo ofrece como «¿es este?»", async () => {
    const store = fixture!.store.id;
    const attributes = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture!.component.id }, select: { colorId: true, sizeId: true, designId: true, categoryId: true } });
    await testPrisma.product.create({
      data: { storeId: store, ...attributes, name: "Set Marcadores Estuche 50 Colores", description: "<p>SINTETICO-DESC</p>", slug: `prueba-${randomBytes(4).toString("hex")}`, sku: `DES-${randomBytes(3).toString("hex").toUpperCase()}`, price: 9000, stock: 3 } as never,
    });
    const archivedSku = `MAR-SIM-MUL-${randomBytes(2).toString("hex").toUpperCase()}`;
    await testPrisma.product.create({
      data: { storeId: store, ...attributes, name: "Marcadores acrílicos punta pincel x60", description: "<p>SINTETICO-DESC</p>", isArchived: true, slug: `prueba-${randomBytes(4).toString("hex")}`, sku: archivedSku, price: 9000, stock: 0 } as never,
    });
    await testPrisma.product.create({
      data: { storeId: store, ...attributes, name: "Set en caja de marcadores acrílicos GIPAO punta pincel profesional 12 colores", description: "<p>SINTETICO-DESC</p>", slug: `prueba-${randomBytes(4).toString("hex")}`, sku: `DES-${randomBytes(3).toString("hex").toUpperCase()}`, price: 9000, stock: 3 } as never,
    });
    const found = (await run({ nombre: "marcadores en estuche cuadrado x50" })) as { encontrado: boolean; datos: { nombre: string; especificaciones: { clave: string }[]; especificacionesPorConfirmar: unknown[] } };
    expect(found).toMatchObject({ encontrado: true, datos: { nombre: "Set Marcadores Estuche 50 Colores" } });
    expect(found.datos.especificaciones.map((spec) => spec.clave)).not.toContain("Color");
    expect(found.datos.especificacionesPorConfirmar).toContainEqual(expect.objectContaining({ clave: "Color", motivo: expect.stringContaining("varios colores") }));

    const archived = await run({ nombre: "marcadores acrílicos pincel x60" });
    expect(archived).toMatchObject({ encontrado: false, desactivado: true, candidatos: [{ nombre: "Marcadores acrílicos punta pincel x60", estado: "desactivado" }] });
    expect(String(archived.mensaje)).toContain("No es un producto prospecto");

    const tie = (await run({ nombre: "marcadores acrílicos punta pincel" })) as { ambiguo: boolean; candidatos: { nombre: string; estado: string }[] };
    expect(tie.ambiguo).toBe(true);
    expect(tie.candidatos.map((candidate) => candidate.estado).sort()).toEqual(["activo", "desactivado"]);

    expect(await run({ nombre: `hazme la descripción de ${archivedSku}` })).toMatchObject({ desactivado: true, candidatos: [{ sku: archivedSku, estado: "desactivado" }] });
  });

  it("con más productos que el tope por palabra suelta, encuentra el que tiene todas las palabras", async () => {
    const { LOOKUP_CAP } = await import("@/lib/copiloto/skills/descripciones-tool");
    const store = fixture!.store.id;
    const attributes = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture!.component.id }, select: { colorId: true, sizeId: true, designId: true, categoryId: true } });
    const decoys = Array.from({ length: LOOKUP_CAP + 60 }, (_, index) => ({
      storeId: store,
      ...attributes,
      name: index % 2 ? `Kit señuelo ${index}` : `Lapicero señuelo ${index}`,
      description: "<p>SINTETICO-DESC</p>",
      slug: `senuelo-${index}-${randomBytes(3).toString("hex")}`,
      sku: `SEN-${index}-${randomBytes(2).toString("hex").toUpperCase()}`,
      price: 1000,
      stock: 5,
      soldCount: 50,
    }));
    await testPrisma.product.createMany({ data: decoys as never });
    await testPrisma.product.create({
      data: { storeId: store, ...attributes, name: "Kit de lapiceros kawaii Eval", description: "<p>SINTETICO-DESC</p>", slug: `prueba-${randomBytes(4).toString("hex")}`, sku: `DES-${randomBytes(3).toString("hex").toUpperCase()}`, price: 9000, stock: 3, soldCount: 0 } as never,
    });
    expect(await run({ nombre: "kit de lapiceros kawaii" })).toMatchObject({ encontrado: true, datos: { nombre: "Kit de lapiceros kawaii Eval" } });
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

describe("copilot_ro: kitsParaRotar (habilidad kits)", () => {
  const ids = { slow: "", pencil: "", eraser: "", ruler: "", offer: "", conversation: "", order: "", oldOrder: "", extraOrders: [] as string[] };
  const KITS_FILE = () => copilotRoGrantFiles().find((name) => name.endsWith("grant_copilot_ro_kits.sql"))!;
  const kitsStatements = () => {
    const database = new URL(process.env.DATABASE_URL as string).pathname.replace(/^\//, "");
    return readFileSync(KITS_FILE(), "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .replaceAll("`railway`", `\`${database}\``)
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
  };

  beforeAll(async () => {
    const store = fixture!.store.id;
    const base = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture!.component.id }, select: { categoryId: true, colorId: true, sizeId: true, designId: true } });
    const line = async (name: string) => {
      const type = await testPrisma.type.create({ data: { name, slug: `${name.toLowerCase()}-${randomBytes(3).toString("hex")}`, storeId: store } });
      return (await testPrisma.category.create({ data: { name, slug: `${name.toLowerCase()}-cat-${randomBytes(3).toString("hex")}`, storeId: store, typeId: type.id } })).id;
    };
    const make = (name: string, data: { stock: number; price: number; acqPrice: number; createdAt?: Date; categoryId?: string }) =>
      testPrisma.product.create({
        data: {
          storeId: store,
          ...base,
          name,
          slug: `${name.toLowerCase().replaceAll(" ", "-")}-${randomBytes(3).toString("hex")}`,
          sku: `SINT-${randomBytes(4).toString("hex")}`,
          description: "SINTETICO-DESC kits",
          ...data,
        },
      });
    const old = new Date(Date.now() - 200 * 86_400_000);
    ids.slow = (await make("Libreta sintetica lenta", { stock: 8, price: 9000, acqPrice: 3000, createdAt: old, categoryId: await line("Cuadernos") })).id;
    ids.pencil = (await make("Lapiz sintetico", { stock: 20, price: 5000, acqPrice: 1500, categoryId: await line("Escritura") })).id;
    ids.eraser = (await make("Borrador sintetico", { stock: 20, price: 4000, acqPrice: 1000, categoryId: await line("Utiles") })).id;
    ids.ruler = (await make("Regla sintetica", { stock: 20, price: 3000, acqPrice: 800, categoryId: await line("Oficina") })).id;
    const paidAt = new Date(Date.now() - 20 * 86_400_000);
    ids.order = (await testPrisma.order.create({
      data: {
        storeId: store,
        orderNumber: `ORD-KIT-${randomBytes(4).toString("hex")}`,
        status: "PAID",
        type: "POINT_OF_SALE",
        paidAt,
        fullName: "Clienta Ficticia Kits",
        phone: "3000000001",
        subtotal: 37000,
        total: 37000,
        orderItems: {
          create: [
            { productId: ids.pencil, quantity: 6, price: 5000, name: "Lapiz" },
            { productId: ids.eraser, quantity: 1, price: 4000, name: "Borrador" },
            { productId: ids.ruler, quantity: 1, price: 3000, name: "Regla" },
          ],
        },
      },
    })).id;
    ids.oldOrder = (
      await testPrisma.order.create({
        data: {
          storeId: store,
          orderNumber: `ORD-KIT-${randomBytes(4).toString("hex")}`,
          status: "PAID",
          type: "POINT_OF_SALE",
          paidAt: new Date(Date.now() - 120 * 86_400_000),
          subtotal: 21000,
          total: 21000,
          orderItems: {
            create: [ids.slow, ids.pencil, ids.eraser, ids.ruler].map((productId) => ({ productId, quantity: 1, price: 5000, name: "Linea" })),
          },
        },
      })
    ).id;
    // Las líneas tienen que salir juntas en 3 pedidos o más, y más que por azar: dos pedidos más como el viejo y dos de otra línea.
    const paidOrder = (days: number, lines: { productId: string; price: number }[]) =>
      testPrisma.order.create({
        data: {
          storeId: store,
          orderNumber: `ORD-KIT-${randomBytes(4).toString("hex")}`,
          status: "PAID",
          type: "POINT_OF_SALE",
          paidAt: new Date(Date.now() - days * 86_400_000),
          subtotal: lines.reduce((total, item) => total + item.price, 0),
          total: lines.reduce((total, item) => total + item.price, 0),
          orderItems: { create: lines.map((item) => ({ ...item, quantity: 1, name: "Linea" })) },
        },
      });
    for (const days of [130, 140]) ids.extraOrders.push((await paidOrder(days, [ids.slow, ids.pencil, ids.eraser, ids.ruler].map((productId) => ({ productId, price: 5000 })))).id);
    for (const days of [50, 60]) ids.extraOrders.push((await paidOrder(days, [{ productId: fixture!.component.id, price: 10000 }])).id);
    ids.offer = (
      await testPrisma.offer.create({
        data: { storeId: store, name: "Nombre interno secreto", label: "20 %", type: "PERCENTAGE", amount: 20, startDate: new Date(Date.now() - 86_400_000), endDate: new Date(Date.now() + 86_400_000), products: { create: [{ productId: ids.pencil }] } },
      })
    ).id;
    ids.conversation = (await testPrisma.conversation.create({ data: { storeId: store, phone: "3000000003", contactName: "Contacto Ficticio" } })).id;
    for (const body of ["Texto libre de la clienta 1", "Texto libre de la clienta 2"]) {
      await testPrisma.conversationMessage.create({ data: { conversationId: ids.conversation, direction: "INBOUND", sentBy: "CUSTOMER", body } });
      await testPrisma.conversationMessage.create({
        data: {
          conversationId: ids.conversation,
          direction: "OUTBOUND",
          sentBy: "BOT",
          body: "Respuesta del bot",
          metadata: { decision: { intent: "product", slots: { productType: "Cartuchera", character: null, descriptor: null }, query: "cartuchera kuromi de la clienta", total: 0, outcome: "unsure" }, shown: { ids: [ids.ruler], intent: "product" } },
        },
      });
    }
  });

  afterAll(async () => {
    await testPrisma.orderItem.deleteMany({ where: { orderId: { in: [ids.order, ids.oldOrder, ...ids.extraOrders] } } });
    await testPrisma.order.deleteMany({ where: { id: { in: [ids.order, ids.oldOrder, ...ids.extraOrders] } } });
    await testPrisma.conversationMessage.deleteMany({ where: { conversationId: ids.conversation } });
    await testPrisma.conversation.deleteMany({ where: { id: ids.conversation } });
    await testPrisma.offerProduct.deleteMany({ where: { offerId: ids.offer } });
    await testPrisma.offer.deleteMany({ where: { id: ids.offer } });
  });

  const run = async () => {
    const { kitsParaRotarTool } = await import("@/lib/copiloto/skills/kits-tool");
    const tool = kitsParaRotarTool(fixture!.store.id) as unknown as { execute: (input: unknown, options: unknown) => Promise<{ datos: Record<string, unknown> }> };
    return tool.execute({ dias: 90, kits: 3, minimoPorKit: 3, margenMinimo: 20 }, { toolCallId: "k", messages: [] });
  };

  it("corre con copilot_ro: lento, kit con precio efectivo y demanda por WhatsApp solo como cuentas", async () => {
    const result = await run();
    const datos = result.datos as {
      lentos: { nombre: string }[];
      kits: { estado: string; piezas: { productId: string; precioEfectivo: number; precioDeLista: number; oferta: string | null }[]; precioSugerido: number; sumaPreciosEfectivos: number }[];
      señales: { whatsapp: { estado: string; terminosPedidos?: unknown[]; productosEnseñados?: unknown[] } };
    };
    expect(datos.lentos.map((row) => row.nombre)).toContain("Libreta sintetica lenta");
    const kit = datos.kits.find((row) => row.piezas[0].productId === ids.slow)!;
    expect(kit.piezas.length).toBeGreaterThanOrEqual(3);
    expect(kit.piezas.find((piece) => piece.productId === ids.pencil)).toMatchObject({ precioEfectivo: 4000, precioDeLista: 5000, oferta: "20 %" });
    expect(kit.estado).toBe("listo");
    expect(kit.precioSugerido).toBeLessThanOrEqual(kit.sumaPreciosEfectivos);
    expect(datos.señales.whatsapp).toEqual({
      estado: "ok",
      terminosPedidos: [{ termino: "cartuchera", veces: 2, sinResultados: 2 }],
      productosEnseñados: [{ nombre: "Regla sintetica", veces: 2 }],
    });
    expect(JSON.stringify(result)).not.toMatch(/Texto libre|kuromi de la clienta|Contacto Ficticio|3000000003|Clienta Ficticia|Nombre interno secreto/);
  });

  it("lee solo las columnas concedidas: ni el nombre interno de la oferta, ni mensajes, ni conversaciones", async () => {
    await expect(roClient.offer.findFirst({ select: { id: true, label: true, type: true, amount: true } })).resolves.toBeTruthy();
    await expect(roClient.productPriceTier.findMany({ select: { productId: true, minQuantity: true, unitPrice: true } })).resolves.toBeDefined();
    await expect(roClient.$queryRawUnsafe("SELECT productType, found FROM CopilotBotDemand LIMIT 1")).resolves.toBeDefined();
    await expect(roClient.offer.findFirst({ select: { name: true } })).rejects.toThrow();
    await expect(roClient.conversationMessage.findFirst({ select: { body: true } })).rejects.toThrow();
    await expect(roClient.$queryRawUnsafe("SELECT metadata FROM ConversationMessage LIMIT 1")).rejects.toThrow();
    await expect(roClient.$queryRawUnsafe("SELECT phone FROM Conversation LIMIT 1")).rejects.toThrow();
  });

  it("sin la vista, la demanda por WhatsApp dice «no disponible» y los kits salen igual", async () => {
    await testPrisma.$executeRawUnsafe("DROP VIEW IF EXISTS CopilotBotDemand");
    try {
      const result = await run();
      const datos = result.datos as { kits: unknown[]; señales: { whatsapp: { estado: string } } };
      expect(datos.señales.whatsapp.estado).toBe("no disponible");
      expect(datos.kits.length).toBeGreaterThan(0);
    } finally {
      for (const statement of kitsStatements()) await testPrisma.$executeRawUnsafe(statement);
    }
  });
});
