import {
  allocateFairInventory,
  cancelFairSale,
  createFairSale,
  openFairEvent,
  packFairCapsules,
  reconcileFairEvent,
  reopenFairEvent,
  startFairReconciliation,
} from "@/lib/fair-events";
import {
  FairCapsuleStatus,
  FairEventStatus,
  MarketplaceOutboxAction,
  MarketplaceProvider,
  OrderStatus,
  OrderType,
  PaymentMethod,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

describe("fair event flow with MySQL", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });

  afterEach(async () => {
    if (fixture) {
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("reserves online stock, records paid direct and capsule sales, then returns only counted units", async () => {
    fixture = await createInventoryFixture();
    const fairEvent = await testPrisma.fairEvent.create({
      data: {
        storeId: fixture.store.id,
        name: "Feria de pruebas",
        createdBy: fixture.store.userId,
      },
    });

    const marketplaceConnection = await testPrisma.marketplaceConnection.create({
      data: {
        storeId: fixture.store.id,
        provider: MarketplaceProvider.MERCADOLIBRE,
        status: "CONNECTED",
      },
    });
    await testPrisma.marketplaceListing.createMany({
      data: [
        {
          connectionId: marketplaceConnection.id,
          productId: fixture.component.id,
          externalItemId: "MCO-FAIR-COMPONENT",
        },
        {
          connectionId: marketplaceConnection.id,
          productId: fixture.kit.id,
          externalItemId: "MCO-FAIR-KIT",
        },
      ],
    });

    await allocateFairInventory({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      allocations: [{ productId: fixture.component.id, quantity: 4 }],
      userId: fixture.store.userId,
    });

    await expect(
      testPrisma.product.findUniqueOrThrow({
        where: { id: fixture.component.id },
      }),
    ).resolves.toMatchObject({ stock: 2 });
    await expect(
      testPrisma.marketplaceOutboxEvent.findMany({
        where: {
          connectionId: marketplaceConnection.id,
          action: MarketplaceOutboxAction.SYNC_STOCK,
        },
        orderBy: { productId: "asc" },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: fixture.component.id,
          payload: { targetQuantity: 2 },
        }),
        expect.objectContaining({
          productId: fixture.kit.id,
          payload: { targetQuantity: 1 },
        }),
      ]),
    );

    const [capsule] = await packFairCapsules({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      productId: fixture.component.id,
      quantity: 1,
      salePrice: 10000,
      minimumMarginPct: 30,
    });
    await openFairEvent({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
    });

    const sale = await createFairSale({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      items: [
        { productId: fixture.component.id, quantity: 1 },
        { capsuleCode: capsule.code },
      ],
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: "fair-event-test-sale-001",
      userId: fixture.store.userId,
    });
    const duplicateSale = await createFairSale({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      items: [{ productId: fixture.component.id, quantity: 1 }],
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: "fair-event-test-sale-001",
      userId: fixture.store.userId,
    });

    expect(sale.duplicate).toBe(false);
    expect(duplicateSale).toMatchObject({
      duplicate: true,
      order: { id: sale.order.id },
    });
    expect(sale.order).toMatchObject({
      status: OrderStatus.PAID,
      type: OrderType.FESTIVAL,
      paidAt: expect.any(Date),
      payment: { method: PaymentMethod.CASH },
    });
    expect(sale.order.orderItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Componente", quantity: 1 }),
        expect.objectContaining({ name: "Cápsula sorpresa", quantity: 1 }),
      ]),
    );

    await expect(
      testPrisma.fairCapsule.findUniqueOrThrow({ where: { id: capsule.id } }),
    ).resolves.toMatchObject({ status: FairCapsuleStatus.SOLD });

    // Cerrar exige haber pasado a conciliación: detiene las ventas primero.
    await expect(
      reconcileFairEvent({
        storeId: fixture.store.id,
        fairEventId: fairEvent.id,
        items: [
          {
            productId: fixture.component.id,
            returnedQuantity: 2,
            damagedQuantity: 0,
            lostQuantity: 0,
          },
        ],
        userId: fixture.store.userId,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    await startFairReconciliation({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
    });
    await expect(
      createFairSale({
        storeId: fixture.store.id,
        fairEventId: fairEvent.id,
        items: [{ productId: fixture.component.id, quantity: 1 }],
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: "fair-event-test-sale-while-reconciling",
        userId: fixture.store.userId,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await reopenFairEvent({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
    });
    await expect(
      testPrisma.fairEvent.findUniqueOrThrow({ where: { id: fairEvent.id } }),
    ).resolves.toMatchObject({ status: FairEventStatus.OPEN });
    await startFairReconciliation({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
    });

    const closed = await reconcileFairEvent({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      items: [
        {
          productId: fixture.component.id,
          returnedQuantity: 2,
          damagedQuantity: 0,
          lostQuantity: 0,
        },
      ],
      userId: fixture.store.userId,
    });
    expect(closed.inventoryIssues).toBe(0);
    await expect(
      testPrisma.orderInventoryIssue.count({
        where: { storeId: fixture.store.id },
      }),
    ).resolves.toBe(0);

    await expect(
      testPrisma.product.findUniqueOrThrow({
        where: { id: fixture.component.id },
      }),
    ).resolves.toMatchObject({ stock: 4 });
    await expect(
      testPrisma.marketplaceOutboxEvent.findMany({
        where: {
          connectionId: marketplaceConnection.id,
          action: MarketplaceOutboxAction.SYNC_STOCK,
        },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: fixture.component.id,
          payload: { targetQuantity: 4 },
        }),
        expect.objectContaining({
          productId: fixture.kit.id,
          payload: { targetQuantity: 2 },
        }),
      ]),
    );
    await expect(
      testPrisma.fairEvent.findUniqueOrThrow({ where: { id: fairEvent.id } }),
    ).resolves.toMatchObject({ status: FairEventStatus.CLOSED });
    await expect(
      testPrisma.inventoryMovement.findMany({
        where: { storeId: fixture.store.id },
        orderBy: { createdAt: "asc" },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "FESTIVAL_ALLOCATION", quantity: -4 }),
        expect.objectContaining({ type: "FESTIVAL_RETURN", quantity: 2 }),
      ]),
    );
  });

  it("cancels a fair sale by returning the fair counters, never the online stock", async () => {
    fixture = await createInventoryFixture();
    const fairEvent = await testPrisma.fairEvent.create({
      data: {
        storeId: fixture.store.id,
        name: "Feria anulaciones",
        createdBy: fixture.store.userId,
      },
    });
    await allocateFairInventory({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      allocations: [{ productId: fixture.component.id, quantity: 4 }],
      userId: fixture.store.userId,
    });
    const [capsule] = await packFairCapsules({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      productId: fixture.component.id,
      quantity: 1,
      salePrice: 10000,
      minimumMarginPct: 30,
    });
    await openFairEvent({ storeId: fixture.store.id, fairEventId: fairEvent.id });
    const sale = await createFairSale({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      items: [
        { productId: fixture.component.id, quantity: 2 },
        { capsuleCode: capsule.code },
      ],
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: "fair-event-test-cancel-001",
      userId: fixture.store.userId,
    });
    const stockAfterSale = (
      await testPrisma.product.findUniqueOrThrow({
        where: { id: fixture.component.id },
      })
    ).stock;
    const movementsAfterSale = await testPrisma.inventoryMovement.count({
      where: { storeId: fixture.store.id },
    });

    const cancelled = await cancelFairSale({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      orderId: sale.order.id,
      userId: fixture.store.userId,
    });

    expect(cancelled).toMatchObject({
      status: OrderStatus.CANCELLED,
      paidAt: null,
    });
    await expect(
      testPrisma.fairEventInventoryItem.findUniqueOrThrow({
        where: {
          fairEventId_productId: {
            fairEventId: fairEvent.id,
            productId: fixture.component.id,
          },
        },
      }),
    ).resolves.toMatchObject({
      allocatedQuantity: 4,
      soldQuantity: 0,
      packedQuantity: 1,
    });
    await expect(
      testPrisma.fairCapsule.findUniqueOrThrow({ where: { id: capsule.id } }),
    ).resolves.toMatchObject({
      status: FairCapsuleStatus.PACKED,
      orderItemId: null,
    });
    // El stock en línea y el kardex no se tocan: la reserva sigue vigente.
    await expect(
      testPrisma.product.findUniqueOrThrow({
        where: { id: fixture.component.id },
      }),
    ).resolves.toMatchObject({ stock: stockAfterSale });
    await expect(
      testPrisma.inventoryMovement.count({
        where: { storeId: fixture.store.id },
      }),
    ).resolves.toBe(movementsAfterSale);

    // Después del cierre ya no se puede anular.
    await startFairReconciliation({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
    });
    await reconcileFairEvent({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      items: [
        {
          productId: fixture.component.id,
          returnedQuantity: 4,
          damagedQuantity: 0,
          lostQuantity: 0,
        },
      ],
      userId: fixture.store.userId,
    });
    await expect(
      cancelFairSale({
        storeId: fixture.store.id,
        fairEventId: fairEvent.id,
        orderId: sale.order.id,
        userId: fixture.store.userId,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("reserves a kit as one fair row, takes and returns its pieces, sells and cancels it at the kit price", async () => {
    fixture = await createInventoryFixture();
    const fairEvent = await testPrisma.fairEvent.create({
      data: { storeId: fixture.store.id, name: "Feria de kits", createdBy: fixture.store.userId },
    });
    // 2 kits × 2 piezas: salen 4 del componente (6 → 2); el kit deriva 1.
    await allocateFairInventory({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      allocations: [{ productId: fixture.kit.id, quantity: 2 }],
      userId: fixture.store.userId,
    });
    await expect(
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } }),
    ).resolves.toMatchObject({ stock: 2 });
    await expect(
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.kit.id } }),
    ).resolves.toMatchObject({ stock: 1 });
    const kitRow = await testPrisma.fairEventInventoryItem.findUniqueOrThrow({
      where: { fairEventId_productId: { fairEventId: fairEvent.id, productId: fixture.kit.id } },
      include: { kitComponents: true },
    });
    expect(kitRow).toMatchObject({ allocatedQuantity: 2, soldQuantity: 0 });
    expect(kitRow.kitComponents).toEqual([
      expect.objectContaining({ componentId: fixture.component.id, quantityPerKit: 2 }),
    ]);
    // Ninguna fila de feria ni movimiento para el componente suelto ni para el kit.
    await expect(
      testPrisma.fairEventInventoryItem.count({ where: { fairEventId: fairEvent.id } }),
    ).resolves.toBe(1);
    const allocationMovements = await testPrisma.inventoryMovement.findMany({
      where: { storeId: fixture.store.id, type: "FESTIVAL_ALLOCATION" },
    });
    expect(allocationMovements).toEqual([
      expect.objectContaining({
        productId: fixture.component.id,
        quantity: -4,
        previousStock: 6,
        newStock: 2,
        reason: expect.stringContaining("kit «Kit» × 2"),
      }),
    ]);

    // Un kit no se empaca en cápsulas.
    await expect(
      packFairCapsules({
        storeId: fixture.store.id,
        fairEventId: fairEvent.id,
        productId: fixture.kit.id,
        quantity: 1,
        salePrice: 20000,
        minimumMarginPct: 10,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await openFairEvent({ storeId: fixture.store.id, fairEventId: fairEvent.id });
    const sale = await createFairSale({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      items: [{ productId: fixture.kit.id, quantity: 1 }],
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: "fair-event-kit-sale-001",
      userId: fixture.store.userId,
    });
    // Una línea al precio del kit; el costo es la suma de sus piezas (2 × 4000).
    expect(sale.order.orderItems).toEqual([
      expect.objectContaining({ productId: fixture.kit.id, name: "Kit", quantity: 1, price: 10000 }),
    ]);
    expect(sale.order).toMatchObject({ total: 10000, totalProductCost: 8000 });
    await expect(
      testPrisma.fairEventInventoryItem.findUniqueOrThrow({ where: { id: kitRow.id } }),
    ).resolves.toMatchObject({ soldQuantity: 1 });

    // Anular devuelve el contador del kit y no toca stock ni kardex.
    const movementsBeforeCancel = await testPrisma.inventoryMovement.count({ where: { storeId: fixture.store.id } });
    await cancelFairSale({ storeId: fixture.store.id, fairEventId: fairEvent.id, orderId: sale.order.id, userId: fixture.store.userId });
    await expect(
      testPrisma.fairEventInventoryItem.findUniqueOrThrow({ where: { id: kitRow.id } }),
    ).resolves.toMatchObject({ soldQuantity: 0, allocatedQuantity: 2 });
    await expect(
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } }),
    ).resolves.toMatchObject({ stock: 2 });
    await expect(
      testPrisma.inventoryMovement.count({ where: { storeId: fixture.store.id } }),
    ).resolves.toBe(movementsBeforeCancel);

    // Se vende uno de verdad; al cerrar, el kit que volvió devuelve sus 2 piezas.
    await createFairSale({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      items: [{ productId: fixture.kit.id, quantity: 1 }],
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: "fair-event-kit-sale-002",
      userId: fixture.store.userId,
    });
    await startFairReconciliation({ storeId: fixture.store.id, fairEventId: fairEvent.id });
    const closed = await reconcileFairEvent({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      items: [{ productId: fixture.kit.id, returnedQuantity: 1, damagedQuantity: 0, lostQuantity: 0 }],
      userId: fixture.store.userId,
    });
    expect(closed).toMatchObject({ status: FairEventStatus.CLOSED, inventoryIssues: 0 });
    await expect(
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } }),
    ).resolves.toMatchObject({ stock: 4 });
    await expect(
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.kit.id } }),
    ).resolves.toMatchObject({ stock: 2 });
    const returnMovements = await testPrisma.inventoryMovement.findMany({
      where: { storeId: fixture.store.id, type: "FESTIVAL_RETURN" },
    });
    expect(returnMovements).toEqual([
      expect.objectContaining({
        productId: fixture.component.id,
        quantity: 2,
        reason: expect.stringContaining("kit «Kit» × 1"),
      }),
    ]);
    await expect(
      testPrisma.inventoryMovement.count({ where: { productId: fixture.kit.id } }),
    ).resolves.toBe(0);
  });

  it("makes a loose row and a kit compete for the same real stock atomically", async () => {
    fixture = await createInventoryFixture();
    const fairEvent = await testPrisma.fairEvent.create({
      data: { storeId: fixture.store.id, name: "Feria compartida", createdBy: fixture.store.userId },
    });
    await allocateFairInventory({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      allocations: [{ productId: fixture.component.id, quantity: 4 }],
      userId: fixture.store.userId,
    });
    // Quedan 2: alcanza para 1 kit, no para 2.
    await expect(
      allocateFairInventory({
        storeId: fixture.store.id,
        fairEventId: fairEvent.id,
        allocations: [{ productId: fixture.kit.id, quantity: 2 }],
        userId: fixture.store.userId,
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringMatching(/Solo alcanza para 1 kit de “Kit”: «Componente» tiene 2 y cada kit lleva 2/),
    });
    await expect(
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } }),
    ).resolves.toMatchObject({ stock: 2 });
    await expect(
      testPrisma.fairEventInventoryItem.count({ where: { fairEventId: fairEvent.id, productId: fixture.kit.id } }),
    ).resolves.toBe(0);
    await expect(testPrisma.fairEventKitComponent.count()).resolves.toBe(0);
    await expect(
      testPrisma.inventoryMovement.count({ where: { storeId: fixture.store.id } }),
    ).resolves.toBe(1);
    // Un kit sí cabe, y deja el componente en cero para ambas filas.
    await allocateFairInventory({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      allocations: [{ productId: fixture.kit.id, quantity: 1 }],
      userId: fixture.store.userId,
    });
    await expect(
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } }),
    ).resolves.toMatchObject({ stock: 0 });
    await expect(
      testPrisma.fairEventInventoryItem.count({ where: { fairEventId: fairEvent.id } }),
    ).resolves.toBe(2);
  });

  it("fails atomically when only some pieces of the kit are available", async () => {
    fixture = await createInventoryFixture();
    const base = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } });
    const pieceB = await testPrisma.product.create({
      data: {
        name: "Pieza B",
        slug: `pieza-b-${base.slug}`,
        description: "Segunda pieza del kit",
        stock: 1,
        price: 5000,
        acqPrice: 2000,
        sku: `${base.sku}-B`,
        storeId: fixture.store.id,
        categoryId: base.categoryId,
        colorId: base.colorId,
        sizeId: base.sizeId,
        designId: base.designId,
      },
    });
    await testPrisma.productKit.create({
      data: { kitId: fixture.kit.id, componentId: pieceB.id, quantity: 2 },
    });
    const fairEvent = await testPrisma.fairEvent.create({
      data: { storeId: fixture.store.id, name: "Feria a medias", createdBy: fixture.store.userId },
    });
    // El componente A alcanza (6 ≥ 2); la pieza B no (1 < 2): nada se reserva.
    await expect(
      allocateFairInventory({
        storeId: fixture.store.id,
        fairEventId: fairEvent.id,
        allocations: [{ productId: fixture.kit.id, quantity: 1 }],
        userId: fixture.store.userId,
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining("«Pieza B» tiene 1 y cada kit lleva 2"),
    });
    await expect(
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } }),
    ).resolves.toMatchObject({ stock: 6 });
    await expect(
      testPrisma.product.findUniqueOrThrow({ where: { id: pieceB.id } }),
    ).resolves.toMatchObject({ stock: 1 });
    await expect(
      testPrisma.inventoryMovement.count({ where: { storeId: fixture.store.id } }),
    ).resolves.toBe(0);
    await expect(
      testPrisma.fairEventInventoryItem.count({ where: { fairEventId: fairEvent.id } }),
    ).resolves.toBe(0);
  });

  it("refuses to reserve more of a kit whose recipe changed after the first reservation", async () => {
    fixture = await createInventoryFixture();
    const fairEvent = await testPrisma.fairEvent.create({
      data: { storeId: fixture.store.id, name: "Feria receta", createdBy: fixture.store.userId },
    });
    await allocateFairInventory({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      allocations: [{ productId: fixture.kit.id, quantity: 1 }],
      userId: fixture.store.userId,
    });
    await testPrisma.productKit.updateMany({
      where: { kitId: fixture.kit.id, componentId: fixture.component.id },
      data: { quantity: 3 },
    });
    await expect(
      allocateFairInventory({
        storeId: fixture.store.id,
        fairEventId: fairEvent.id,
        allocations: [{ productId: fixture.kit.id, quantity: 1 }],
        userId: fixture.store.userId,
      }),
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/receta de “Kit” cambió/) });
    const row = await testPrisma.fairEventInventoryItem.findUniqueOrThrow({
      where: { fairEventId_productId: { fairEventId: fairEvent.id, productId: fixture.kit.id } },
      include: { kitComponents: true },
    });
    expect(row.allocatedQuantity).toBe(1);
    expect(row.kitComponents).toEqual([expect.objectContaining({ quantityPerKit: 2 })]);
    await expect(
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } }),
    ).resolves.toMatchObject({ stock: 4 });
  });

  it("closes a fair whose kit component was archived or deleted mid-fair: archived pieces return, a missing one becomes an incidence", async () => {
    fixture = await createInventoryFixture();
    const fairEvent = await testPrisma.fairEvent.create({
      data: { storeId: fixture.store.id, name: "Feria con baja", createdBy: fixture.store.userId },
    });
    await allocateFairInventory({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      allocations: [{ productId: fixture.kit.id, quantity: 2 }],
      userId: fixture.store.userId,
    });
    await openFairEvent({ storeId: fixture.store.id, fairEventId: fairEvent.id });
    await startFairReconciliation({ storeId: fixture.store.id, fairEventId: fairEvent.id });
    // Archivada a mitad de feria: sigue existiendo, así que sus piezas vuelven.
    await testPrisma.product.update({ where: { id: fixture.component.id }, data: { isArchived: true } });
    const closed = await reconcileFairEvent({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      items: [{ productId: fixture.kit.id, returnedQuantity: 2, damagedQuantity: 0, lostQuantity: 0 }],
      userId: fixture.store.userId,
    });
    expect(closed).toMatchObject({ status: FairEventStatus.CLOSED, inventoryIssues: 0 });
    await expect(
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } }),
    ).resolves.toMatchObject({ stock: 6, isArchived: true });

    // Borrada del todo: la feria cierra igual y la deuda queda como incidencia.
    const fairEvent2 = await testPrisma.fairEvent.create({
      data: { storeId: fixture.store.id, name: "Feria con pieza borrada", createdBy: fixture.store.userId },
    });
    await testPrisma.product.update({ where: { id: fixture.component.id }, data: { isArchived: false } });
    await allocateFairInventory({
      storeId: fixture.store.id,
      fairEventId: fairEvent2.id,
      allocations: [{ productId: fixture.kit.id, quantity: 1 }],
      userId: fixture.store.userId,
    });
    await openFairEvent({ storeId: fixture.store.id, fairEventId: fairEvent2.id });
    await startFairReconciliation({ storeId: fixture.store.id, fairEventId: fairEvent2.id });
    // Prisma emula la relación y protege la pieza mientras una feria la
    // referencie (igual que hoy con cualquier producto reservado): se simula
    // la desaparición del registro por SQL directo.
    await testPrisma.productKit.deleteMany({ where: { componentId: fixture.component.id } });
    await testPrisma.inventoryMovement.deleteMany({ where: { productId: fixture.component.id } });
    await testPrisma.$executeRawUnsafe("DELETE FROM `Product` WHERE `id` = ?", fixture.component.id);
    const closed2 = await reconcileFairEvent({
      storeId: fixture.store.id,
      fairEventId: fairEvent2.id,
      items: [{ productId: fixture.kit.id, returnedQuantity: 1, damagedQuantity: 0, lostQuantity: 0 }],
      userId: fixture.store.userId,
    });
    expect(closed2).toMatchObject({ status: FairEventStatus.CLOSED, inventoryIssues: 1 });
    await expect(
      testPrisma.orderInventoryIssue.findMany({ where: { storeId: fixture.store.id } }),
    ).resolves.toEqual([
      expect.objectContaining({ productId: fixture.component.id, quantity: 2, kind: "RESTOCK" }),
    ]);
    // Cleanup: the fixture only deletes existing products; the deleted piece needs none.
  });
});
