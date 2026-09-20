import {
  InventoryMovementType,
  OrderStatus,
  OrderType,
  PaymentMethod,
} from "@prisma/client";

import { movementActor } from "@/lib/movement-actor";
import { AppError, ErrorFactory } from "@/lib/api-errors";
import { pushToBoldDatafono } from "@/lib/bold-terminal";
import { priceLines } from "@/lib/product-pricing";
import { createInventoryMovementBatch, recalculateKitStock } from "@/lib/inventory";
import { SALE_UNDO_WINDOW_MS, undoTimeLeft } from "@/lib/sell-cart";
import { queueMarketplaceStockSyncEvents } from "@/lib/mercadolibre/outbox";
import prismadb from "@/lib/prismadb";
import { generateOrderNumber } from "@/lib/utils";

export type PointOfSaleItemInput = {
  productId: string;
  quantity: number;
};

/** Métodos que acepta el mostrador: efectivo, transferencia con referencia, o datáfono Bold. */
export const POINT_OF_SALE_PAYMENT_METHODS: PaymentMethod[] = [
  PaymentMethod.CASH,
  PaymentMethod.BankTransfer,
  PaymentMethod.Bold,
];

export const TRANSFER_REFERENCE_MIN = 4;

/** Mensaje claro cuando el inventario no alcanza: qué producto, cuánto hay y cuánto se pidió. */
export function describeInsufficientStock(
  items: { productName: string; available: number; requested: number }[],
): string {
  const parts = items.map((item) => `${item.productName} (hay ${item.available}, pediste ${item.requested})`);
  const list = parts.length > 3 ? `${parts.slice(0, 3).join("; ")} y ${parts.length - 3} más` : parts.join("; ");
  return `No alcanzó el inventario: ${list}. No se registró nada; ajusta las cantidades o revisa Inventario.`;
}

type ProductRequirement = {
  quantity: number;
  sourceNames: Set<string>;
};

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw ErrorFactory.InvalidRequest(
      `${label} debe ser un entero mayor a cero`,
    );
  }
}

function getOrderItemCost(product: {
  acqPrice: number | null;
  isKit: boolean;
  kitComponents: { quantity: number; component: { acqPrice: number | null } }[];
}) {
  if (!product.isKit) return Number(product.acqPrice || 0);

  return product.kitComponents.reduce(
    (total, component) =>
      total + Number(component.component.acqPrice || 0) * component.quantity,
    0,
  );
}

function mergePhysicalRequirement(
  requirements: Map<string, ProductRequirement>,
  productId: string,
  quantity: number,
  sourceName: string,
) {
  const current = requirements.get(productId) || {
    quantity: 0,
    sourceNames: new Set<string>(),
  };
  current.quantity += quantity;
  current.sourceNames.add(sourceName);
  requirements.set(productId, current);
}

export async function createPointOfSaleSale({
  storeId,
  items,
  paymentMethod,
  idempotencyKey,
  userId,
  transactionId,
}: {
  storeId: string;
  items: PointOfSaleItemInput[];
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
  userId: string;
  /** Referencia del comprobante: obligatoria en transferencia (misma regla que Pedidos). */
  transactionId?: string | null;
}) {
  if (!idempotencyKey || idempotencyKey.length < 12) {
    throw ErrorFactory.InvalidRequest(
      "La venta requiere una clave de seguridad",
    );
  }
  if (!POINT_OF_SALE_PAYMENT_METHODS.includes(paymentMethod)) {
    throw ErrorFactory.InvalidRequest("Elige efectivo, transferencia o datáfono");
  }
  const reference = typeof transactionId === "string" ? transactionId.trim() : "";
  if (paymentMethod === PaymentMethod.BankTransfer && reference.length < TRANSFER_REFERENCE_MIN) {
    throw ErrorFactory.InvalidRequest(
      `Escribe la referencia de la transferencia (mínimo ${TRANSFER_REFERENCE_MIN} caracteres) antes de registrar el pago.`,
    );
  }
  // El datáfono cobra después: el pedido nace pendiente y Bold lo marca pagado (mismo camino que Pedidos).
  const pendingOnTerminal = paymentMethod === PaymentMethod.Bold;
  if (items.length === 0) {
    throw ErrorFactory.InvalidRequest("Agrega al menos un producto a la venta");
  }

  const requestedQuantities = new Map<string, number>();
  for (const item of items) {
    if (!item.productId) {
      throw ErrorFactory.InvalidRequest("Cada producto debe estar seleccionado");
    }
    assertPositiveInteger(item.quantity, "La cantidad");
    requestedQuantities.set(
      item.productId,
      (requestedQuantities.get(item.productId) || 0) + item.quantity,
    );
  }

  return prismadb.$transaction(async (tx) => {
    const existingOrder = await tx.order.findFirst({
      where: { storeId, idempotencyKey, type: OrderType.POINT_OF_SALE },
      include: { payment: true, orderItems: true },
    });
    if (existingOrder) return { order: existingOrder, duplicate: true };

    const selectedProducts = await tx.product.findMany({
      where: {
        id: { in: Array.from(requestedQuantities.keys()) },
        storeId,
        isArchived: false,
      },
      include: {
        images: { orderBy: { isMain: "desc" }, take: 1 },
        kitComponents: {
          include: {
            component: {
              select: {
                id: true,
                name: true,
                stock: true,
                acqPrice: true,
                isArchived: true,
                isKit: true,
                storeId: true,
              },
            },
          },
        },
      },
    });
    const productsById = new Map(
      selectedProducts.map((product) => [product.id, product]),
    );

    if (productsById.size !== requestedQuantities.size) {
      throw ErrorFactory.NotFound("Uno o más productos ya no están disponibles");
    }

    const physicalRequirements = new Map<string, ProductRequirement>();
    for (const [productId, quantity] of Array.from(
      requestedQuantities.entries(),
    )) {
      const product = productsById.get(productId)!;
      if (!product.isKit) {
        mergePhysicalRequirement(
          physicalRequirements,
          product.id,
          quantity,
          product.name,
        );
        continue;
      }

      if (product.kitComponents.length === 0) {
        throw ErrorFactory.InvalidRequest(
          `El kit “${product.name}” no tiene productos configurados`,
        );
      }

      for (const kitComponent of product.kitComponents) {
        if (
          kitComponent.quantity <= 0 ||
          kitComponent.component.storeId !== storeId ||
          kitComponent.component.isArchived ||
          kitComponent.component.isKit
        ) {
          throw ErrorFactory.InvalidRequest(
            `El kit “${product.name}” tiene una configuración de inventario no válida`,
          );
        }
        mergePhysicalRequirement(
          physicalRequirements,
          kitComponent.componentId,
          kitComponent.quantity * quantity,
          product.name,
        );
      }
    }

    const physicalProductIds = Array.from(physicalRequirements.keys());
    const physicalProducts = await tx.product.findMany({
      where: {
        id: { in: physicalProductIds },
        storeId,
        isArchived: false,
      },
      select: {
        id: true,
        name: true,
        stock: true,
        price: true,
        acqPrice: true,
      },
    });
    const physicalProductsById = new Map(
      physicalProducts.map((product) => [product.id, product]),
    );

    const insufficientItems = physicalProductIds.flatMap((productId) => {
      const product = physicalProductsById.get(productId);
      const requested = physicalRequirements.get(productId)!.quantity;
      if (!product || product.stock < requested) {
        return [
          {
            productId,
            productName: product?.name || "Producto no encontrado",
            available: product?.stock || 0,
            requested,
          },
        ];
      }
      return [];
    });
    if (insufficientItems.length > 0) {
      // 422 como siempre (el cliente lo reconoce), pero con un mensaje legible.
      throw new AppError(describeInsufficientStock(insufficientItems), 422, { items: insufficientItems });
    }

    // Mismo precio que ve la clienta en la tienda: la oferta vigente o la
    // escalera por cantidad rebajan la línea, la que salga más baja —nunca las
    // dos—; el costo (kardex, margen) sigue siendo el real de compra. La cuenta
    // es la misma que hace el checkout, en el mismo sitio.
    const pricing = await priceLines(
      storeId,
      Array.from(requestedQuantities, ([productId, quantity]) => ({ productId, quantity })),
      selectedProducts.map((product) => ({ id: product.id, categoryId: product.categoryId, price: Number(product.price), productGroupId: product.productGroupId })),
    );
    const selectedLines = Array.from(
      requestedQuantities,
      ([productId, quantity]) => {
        const product = productsById.get(productId)!;
        const listPrice = Number(product.price);
        const resolved = pricing.get(productId);
        const price = resolved ? resolved.unitPrice : listPrice;
        const cost = getOrderItemCost(product);
        return {
          productId,
          quantity,
          name: product.name,
          sku: product.sku,
          imageUrl: product.images[0]?.url || "",
          price,
          listPrice,
          cost,
        };
      },
    );
    const subtotal = selectedLines.reduce(
      (total, line) => total + line.price * line.quantity,
      0,
    );
    const savings = selectedLines.reduce(
      (total, line) => total + (line.listPrice - line.price) * line.quantity,
      0,
    );
    const totalProductCost = selectedLines.reduce(
      (total, line) => total + line.cost * line.quantity,
      0,
    );

    const savingsNote = savings > 0 ? ` · ofertas aplicadas: $ ${Math.round(savings).toLocaleString("es-CO")}` : "";
    const order = await tx.order.create({
      data: {
        storeId,
        idempotencyKey,
        orderNumber: generateOrderNumber(),
        fullName: "Consumidor final",
        status: pendingOnTerminal ? OrderStatus.PENDING : OrderStatus.PAID,
        paidAt: pendingOnTerminal ? null : new Date(),
        type: OrderType.POINT_OF_SALE,
        subtotal,
        total: subtotal,
        totalProductCost,
        netProfit: subtotal - totalProductCost,
        profitMarginPct: subtotal
          ? ((subtotal - totalProductCost) / subtotal) * 100
          : 0,
        createdBy: userId,
        adminNotes: `Venta presencial · Punto de venta${savingsNote}`,
        payment: {
          create: {
            storeId,
            method: paymentMethod,
            transactionId: reference || null,
            details: pendingOnTerminal ? "Venta presencial · Punto de venta · cobro en datáfono Bold" : "Venta presencial · Punto de venta",
          },
        },
      },
    });

    await tx.orderItem.createMany({
      data: selectedLines.map((line) => ({
        orderId: order.id,
        productId: line.productId,
        quantity: line.quantity,
        name: line.name,
        sku: line.sku,
        imageUrl: line.imageUrl,
        price: line.price,
      })),
    });

    // Con datáfono el inventario se descuenta cuando Bold confirma (webhook),
    // igual que un pedido en línea; aquí solo queda el pedido pendiente.
    if (pendingOnTerminal) {
      return {
        order: await tx.order.findUniqueOrThrow({
          where: { id: order.id },
          include: { payment: true, orderItems: true },
        }),
        duplicate: false,
        pending: true,
      };
    }

    for (const [productId, requirement] of Array.from(
      physicalRequirements.entries(),
    )) {
      const product = physicalProductsById.get(productId)!;
      const stockUpdate = await tx.product.updateMany({
        where: {
          id: productId,
          storeId,
          stock: { gte: requirement.quantity },
        },
        data: { stock: { decrement: requirement.quantity } },
      });
      if (stockUpdate.count !== 1) {
        throw ErrorFactory.Conflict(
          "El inventario cambió mientras registrabas la venta. Actualiza e intenta de nuevo.",
        );
      }

      await tx.inventoryMovement.create({
        data: {
          storeId,
          productId,
          type: InventoryMovementType.IN_PERSON_SALE,
          quantity: -requirement.quantity,
          previousStock: product.stock,
          newStock: product.stock - requirement.quantity,
          cost: product.acqPrice ?? undefined,
          price: product.price,
          reason: `Venta presencial: ${Array.from(requirement.sourceNames).join(", ")}`,
          referenceId: order.id,
          createdBy: movementActor(userId),
        },
      });
    }

    const parentKits = await tx.productKit.findMany({
      where: { componentId: { in: physicalProductIds } },
      select: { kitId: true },
    });
    const kitIds = Array.from(
      new Set([
        ...selectedProducts
          .filter((product) => product.isKit)
          .map((product) => product.id),
        ...parentKits.map((item) => item.kitId),
      ]),
    );
    await recalculateKitStock(tx as never, kitIds);
    await queueMarketplaceStockSyncEvents(tx, [
      ...physicalProductIds,
      ...kitIds,
    ]);

    return {
      order: await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { payment: true, orderItems: true },
      }),
      duplicate: false,
      pending: false,
    };
  });
}

/**
 * Envía el cobro de una venta pendiente al datáfono Bold: el mismo camino que
 * «Cobrar en el datáfono» de Pedidos. Si el datáfono no recibe, el pedido
 * pendiente se cancela para no dejar una venta a medias.
 */
export async function chargePointOfSaleOnTerminal(params: {
  storeId: string;
  orderId: string;
}): Promise<{ message: string }> {
  const order = await prismadb.order.findFirst({
    where: { id: params.orderId, storeId: params.storeId, type: OrderType.POINT_OF_SALE },
    include: { payment: true },
  });
  if (!order) throw ErrorFactory.NotFound("La venta no existe en esta tienda");
  if (order.payment?.method !== PaymentMethod.Bold) {
    throw ErrorFactory.InvalidRequest("Esta venta no se cobra en el datáfono");
  }
  if (order.status !== OrderStatus.PENDING) {
    throw ErrorFactory.Conflict(`La venta ${order.orderNumber} ya no está pendiente (${order.status}).`);
  }
  const result = await pushToBoldDatafono({
    amount: order.total,
    currency: "COP",
    orderNumber: order.orderNumber || order.id,
    description: `Venta presencial P de Papel #${order.orderNumber}`,
  });
  if (!result.success) {
    await prismadb.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.CANCELLED, adminNotes: `${order.adminNotes ?? ""} · el datáfono no recibió el cobro: ${result.message}`.trim() },
    });
    throw ErrorFactory.InvalidRequest(`El datáfono no recibió el cobro: ${result.message}`);
  }
  return { message: result.message };
}

/** Por qué no se puede deshacer una venta, o `null` si se puede. */
export function describeUndoBlock(
  order: { type: OrderType; status: OrderStatus; paidAt: Date | null; orderNumber: string },
  now = new Date(),
): string | null {
  if (order.type !== OrderType.POINT_OF_SALE) return "Solo se deshacen ventas del punto de venta.";
  if (order.status === OrderStatus.CANCELLED) return `La venta ${order.orderNumber} ya estaba deshecha.`;
  if (order.status === OrderStatus.PENDING) return null;
  if (order.status !== OrderStatus.PAID) return `La venta ${order.orderNumber} ya no se puede deshacer desde aquí (${order.status}).`;
  if (undoTimeLeft(order.paidAt, now) <= 0) {
    return `Pasaron más de ${SALE_UNDO_WINDOW_MS / 60000} minutos: registra la devolución desde Movimientos de inventario.`;
  }
  return null;
}

/**
 * Deshace una venta reciente: el pedido queda cancelado y la mercancía vuelve
 * con un movimiento de cancelación por producto físico, espejo exacto de lo
 * que descontó la venta (un kit devuelve sus componentes, no «el kit»). Una
 * venta pendiente en el datáfono solo se cancela: nunca descontó nada.
 */
export async function undoPointOfSaleSale(params: {
  storeId: string;
  orderId: string;
  userId: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  return prismadb.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: params.orderId, storeId: params.storeId },
      include: {
        orderItems: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                isKit: true,
                acqPrice: true,
                price: true,
                kitComponents: { select: { componentId: true, quantity: true, component: { select: { acqPrice: true, price: true } } } },
              },
            },
          },
        },
        payment: true,
      },
    });
    if (!order) throw ErrorFactory.NotFound("La venta no existe en esta tienda");
    const block = describeUndoBlock(order, now);
    if (block) throw ErrorFactory.Conflict(block);

    const restocked = order.status === OrderStatus.PAID;
    const claim = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: OrderStatus.CANCELLED, adminNotes: `${order.adminNotes ?? ""} · deshecha desde el punto de venta`.trim() },
    });
    if (claim.count !== 1) throw ErrorFactory.Conflict("La venta cambió mientras la deshacías. Recarga e intenta de nuevo.");

    let productIds: string[] = [];
    if (restocked) {
      // Mismas unidades físicas que salieron: producto suelto tal cual; kit → sus componentes.
      const physical = new Map<string, { quantity: number; cost: number; price: number; names: Set<string> }>();
      const add = (productId: string, quantity: number, cost: number, price: number, name: string) => {
        const current = physical.get(productId) ?? { quantity: 0, cost, price, names: new Set<string>() };
        current.quantity += quantity;
        current.names.add(name);
        physical.set(productId, current);
      };
      for (const item of order.orderItems) {
        if (!item.productId || !item.product) continue;
        if (item.product.isKit) {
          for (const row of item.product.kitComponents) {
            add(row.componentId, row.quantity * item.quantity, Number(row.component.acqPrice) || 0, Number(row.component.price), item.product.name);
          }
        } else {
          add(item.productId, item.quantity, Number(item.product.acqPrice) || 0, Number(item.product.price), item.product.name);
        }
      }
      const movements = Array.from(physical, ([productId, row]) => ({
        productId,
        storeId: params.storeId,
        type: InventoryMovementType.ORDER_CANCELLED,
        quantity: row.quantity,
        reason: `Venta presencial deshecha #${order.orderNumber}: ${Array.from(row.names).join(", ")}`,
        referenceId: order.id,
        cost: row.cost,
        price: row.price,
        createdBy: movementActor(params.userId),
      }));
      await createInventoryMovementBatch(tx, movements, false);
      productIds = movements.map((movement) => movement.productId);
      const kitIds = order.orderItems.filter((item) => item.product?.isKit && item.productId).map((item) => item.productId as string);
      const parentKits = await tx.productKit.findMany({ where: { componentId: { in: productIds } }, select: { kitId: true } });
      await recalculateKitStock(tx as never, Array.from(new Set([...kitIds, ...parentKits.map((row) => row.kitId)])));
      await queueMarketplaceStockSyncEvents(tx, productIds);
    }

    return {
      order: await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { payment: true, orderItems: true } }),
      restocked,
      productIds,
    };
  });
}
