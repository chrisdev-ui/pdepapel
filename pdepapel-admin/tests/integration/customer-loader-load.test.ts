/// <reference types="vite/client" />
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { testPrisma } from "./helpers/database";

const session = vi.hoisted(() => ({
  userId: null as string | null,
  viewer: false,
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({
    userId: session.userId,
    sessionClaims: {
      metadata: session.viewer
        ? { role: "viewer", allowedStoreIds: [STORE_ID] }
        : {},
    },
  }),
  clerkClient: async () => ({
    users: { getUser: vi.fn().mockResolvedValue(null) },
  }),
}));

import prismadb from "@/lib/prismadb";

import {
  __resetCustomerMemo,
  getCustomerDetail,
  getCustomerOverview,
  getCustomers,
} from "@/app/(dashboard)/[storeId]/(routes)/clientes/server/get-customers";

const STORE_ID = "store-carga-clientes-test";
const OWNER = "user_carga_clientes_test";
const PEDIDOS = 300;
const TELEFONOS = 180;
const LINEAS_POR_PEDIDO = 3;
const PRODUCTOS = 20;

/**
 * Qué cuesta abrir Clientes.
 *
 * Antes, las tres cargas —la lista de la dueña, el agregado de una cuenta de
 * solo lectura y la ficha de una persona— pasaban por la misma consulta: todos
 * los pedidos de la tienda con sus líneas y el nombre de cada producto. Estas
 * pruebas fijan lo que cambió: que el agregado no pida líneas, que la ficha no
 * cargue las de las otras 400 personas, y que dos visitas seguidas no repitan
 * la agrupación entera.
 */
describe("la carga de Clientes está acotada", () => {
  beforeAll(async () => {
    await testPrisma.$connect();
    await testPrisma.orderItem.deleteMany({
      where: { order: { storeId: STORE_ID } },
    });
    await testPrisma.order.deleteMany({ where: { storeId: STORE_ID } });
    await testPrisma.product.deleteMany({ where: { storeId: STORE_ID } });
    await testPrisma.store.upsert({
      where: { id: STORE_ID },
      update: { userId: OWNER },
      create: { id: STORE_ID, name: "Carga clientes", userId: OWNER },
    });
    const type = await testPrisma.type.upsert({
      where: { id: `${STORE_ID}-t` },
      update: {},
      create: {
        id: `${STORE_ID}-t`,
        name: "Papelería",
        slug: `${STORE_ID}-t`,
        storeId: STORE_ID,
      },
    });
    const category = await testPrisma.category.upsert({
      where: { id: `${STORE_ID}-c` },
      update: {},
      create: {
        id: `${STORE_ID}-c`,
        name: "Cuadernos",
        slug: `${STORE_ID}-c`,
        storeId: STORE_ID,
        typeId: type.id,
      },
    });
    const size = await testPrisma.size.upsert({
      where: { id: `${STORE_ID}-s` },
      update: {},
      create: {
        id: `${STORE_ID}-s`,
        name: "Único",
        value: "U",
        storeId: STORE_ID,
      },
    });
    const color = await testPrisma.color.upsert({
      where: { id: `${STORE_ID}-co` },
      update: {},
      create: {
        id: `${STORE_ID}-co`,
        name: "Lila",
        value: "#b9afee",
        storeId: STORE_ID,
      },
    });
    const design = await testPrisma.design.upsert({
      where: { id: `${STORE_ID}-d` },
      update: {},
      create: { id: `${STORE_ID}-d`, name: "Kawaii", storeId: STORE_ID },
    });

    await testPrisma.product.createMany({
      data: Array.from({ length: PRODUCTOS }, (_, index) => ({
        id: `${STORE_ID}-p${index}`,
        name: `Producto de prueba ${index}`,
        slug: `${STORE_ID}-p${index}`,
        description: "Demo",
        price: 10000,
        acqPrice: 4000,
        stock: 50,
        sku: `${STORE_ID}-SKU-${index}`,
        storeId: STORE_ID,
        categoryId: category.id,
        sizeId: size.id,
        colorId: color.id,
        designId: design.id,
      })),
    });

    const estados = ["PAID", "PAID", "SENT", "PENDING", "CANCELLED"] as const;
    await testPrisma.order.createMany({
      data: Array.from({ length: PEDIDOS }, (_, index) => {
        const persona = index % TELEFONOS;
        const status = estados[index % estados.length];
        const createdAt = new Date(Date.now() - index * 36 * 60 * 60 * 1000);
        return {
          id: `${STORE_ID}-o${index}`,
          storeId: STORE_ID,
          orderNumber: `${STORE_ID}-ORD-${index}`,
          status,
          paidAt: status === "PAID" || status === "SENT" ? createdAt : null,
          createdAt,
          fullName: `Clienta de prueba ${persona}`,
          email: `clienta${persona}@ejemplo.com`,
          phone: `30055${String(10000 + persona).slice(-5)}`,
          address: "Calle 1",
          city: ["Bogotá", "Medellín", "Cali"][persona % 3],
          subtotal: 30000,
          total: 30000 + (index % 7) * 1000,
        };
      }),
    });

    await testPrisma.orderItem.createMany({
      data: Array.from({ length: PEDIDOS * LINEAS_POR_PEDIDO }, (_, index) => ({
        orderId: `${STORE_ID}-o${Math.floor(index / LINEAS_POR_PEDIDO)}`,
        productId: `${STORE_ID}-p${index % PRODUCTOS}`,
        quantity: 1 + (index % 3),
        name: `Producto de prueba ${index % PRODUCTOS}`,
        price: 10000,
      })),
    });
  }, 120_000);

  afterAll(async () => {
    await testPrisma.orderItem.deleteMany({
      where: { order: { storeId: STORE_ID } },
    });
    await testPrisma.order.deleteMany({ where: { storeId: STORE_ID } });
    await testPrisma.product.deleteMany({ where: { storeId: STORE_ID } });
    await testPrisma.category.deleteMany({ where: { storeId: STORE_ID } });
    await testPrisma.type.deleteMany({ where: { storeId: STORE_ID } });
    await testPrisma.size.deleteMany({ where: { storeId: STORE_ID } });
    await testPrisma.color.deleteMany({ where: { storeId: STORE_ID } });
    await testPrisma.design.deleteMany({ where: { storeId: STORE_ID } });
    await testPrisma.store.deleteMany({ where: { id: STORE_ID } });
    await testPrisma.$disconnect();
  });

  beforeEach(() => {
    __resetCustomerMemo();
    session.userId = OWNER;
    session.viewer = false;
    vi.restoreAllMocks();
  });

  const originalOrderFindMany = prismadb.order.findMany.bind(prismadb.order);
  const originalItemFindMany = prismadb.orderItem.findMany.bind(
    prismadb.orderItem,
  );

  /** Qué consultas salen de verdad, y con qué forma; la consulta se deja pasar. */
  const watchQueries = () => {
    const orders: unknown[] = [];
    const items: unknown[] = [];
    vi.spyOn(prismadb.order, "findMany").mockImplementation(((args: never) => {
      orders.push(args);
      return originalOrderFindMany(args);
    }) as never);
    vi.spyOn(prismadb.orderItem, "findMany").mockImplementation(((
      args: never,
    ) => {
      items.push(args);
      return originalItemFindMany(args);
    }) as never);
    return { orders, items };
  };

  it("el agregado de solo lectura no pide ni una línea de pedido", async () => {
    session.viewer = true;
    const watch = watchQueries();
    const overview = await getCustomerOverview(STORE_ID);

    expect(overview.summary.total).toBe(TELEFONOS);
    expect(overview.truncated).toBe(false);
    expect(watch.items).toHaveLength(0);
    expect(watch.orders).toHaveLength(1);
    const select = (watch.orders[0] as { select: Record<string, unknown> })
      .select;
    expect(select).not.toHaveProperty("orderItems");
  });

  it("la lista de la dueña sí las pide, porque muestra «lo que más compra»", async () => {
    const watch = watchQueries();
    const { records, truncated } = await getCustomers(STORE_ID);

    expect(records).toHaveLength(TELEFONOS);
    expect(truncated).toBe(false);
    expect(records.some((record) => record.favoriteProducts.length > 0)).toBe(
      true,
    );
    const select = (watch.orders[0] as { select: Record<string, unknown> })
      .select;
    expect(select).toHaveProperty("orderItems");
  });

  it("la ficha trae las líneas de una persona, no las de todas", async () => {
    const { records } = await getCustomers(STORE_ID);
    const target = records.find((record) => record.paidOrders > 0)!;
    __resetCustomerMemo();

    const watch = watchQueries();
    const detail = await getCustomerDetail(STORE_ID, target.id);

    expect(detail?.customer.fullName).toBe(target.fullName);
    expect(detail?.customer.totalSpent).toBe(target.totalSpent);
    expect(detail?.customer.favoriteProducts).toEqual(target.favoriteProducts);
    // Los pedidos de la ficha traen su detalle…
    expect(
      detail?.customer.orders.some((order) => order.items.length > 0),
    ).toBe(true);
    // …y las líneas se pidieron acotadas a esos pedidos.
    expect(watch.items).toHaveLength(1);
    const where = (watch.items[0] as { where: { orderId: { in: string[] } } })
      .where;
    expect(where.orderId.in).toEqual(
      detail!.customer.orders.map((order) => order.id),
    );
    expect(where.orderId.in.length).toBeLessThan(PEDIDOS / 10);
  });

  it("dos visitas seguidas no repiten la agrupación entera", async () => {
    const watch = watchQueries();
    await getCustomers(STORE_ID);
    expect(watch.orders).toHaveLength(1);
    await getCustomers(STORE_ID);
    expect(watch.orders).toHaveLength(1);
  });

  it("un pedido nuevo invalida la memoria en el acto", async () => {
    await getCustomers(STORE_ID);
    const watch = watchQueries();
    await getCustomers(STORE_ID);
    expect(watch.orders).toHaveLength(0);

    await testPrisma.order.create({
      data: {
        id: `${STORE_ID}-o-nuevo`,
        storeId: STORE_ID,
        orderNumber: `${STORE_ID}-ORD-NUEVO`,
        status: "PAID",
        paidAt: new Date(),
        fullName: "Clienta recién llegada",
        email: "nueva@ejemplo.com",
        phone: "3009998877",
        address: "Calle 2",
        city: "Bogotá",
        subtotal: 50000,
        total: 50000,
      },
    });

    const { records } = await getCustomers(STORE_ID);
    expect(watch.orders).toHaveLength(1);
    expect(
      records.some((record) => record.fullName === "Clienta recién llegada"),
    ).toBe(true);

    await testPrisma.order.delete({ where: { id: `${STORE_ID}-o-nuevo` } });
  });

  it("un identificador que sea un teléfono ya no abre ninguna ficha", async () => {
    const { records } = await getCustomers(STORE_ID);
    const target = records[0];
    expect(target.id).toMatch(/^[0-9a-f]{24}$/);
    expect(target.id).not.toContain(target.phone.replace(/\D/g, ""));

    await expect(getCustomerDetail(STORE_ID, target.phone)).resolves.toBeNull();
    await expect(
      getCustomerDetail(STORE_ID, "573005510000"),
    ).resolves.toBeNull();
    await expect(
      getCustomerDetail(STORE_ID, target.id),
    ).resolves.not.toBeNull();
  });
});
