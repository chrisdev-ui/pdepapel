import { BATCH_SIZE } from "@/constants";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createCorsHeaders } from "@/lib/cors";
import { getProductsPrices } from "@/lib/discount-engine";
import { sendOrderEmail } from "@/lib/email";
import {
  assertCouponMinimumOrderValue,
  resolveCouponForOrderUpdate,
} from "@/lib/order-coupons";
import prismadb from "@/lib/prismadb";
import {
  CUSTOMER_ORDER_SELECT,
  toCustomerOrderResponse,
} from "@/lib/public-orders";
import { createGuideForOrder } from "@/lib/shipping-helpers";
import {
  CACHE_HEADERS,
  calculateOrderTotals,
  checkIfStoreOwner,
  processOrderItemsInBatches,
  verifyStoreOwner,
} from "@/lib/utils";
import {
  createInventoryMovementBatchResilient,
  createInventoryMovementBatch,
  validateStockAvailability,
} from "@/lib/inventory";
import { calculateOrderFinancials } from "@/lib/financial";
import { explodeKitMovements } from "@/lib/order-stock-movements";
import {
  canTransition,
  describeForbiddenTransition,
  isPaidLike,
  ORDER_STATUS_LABELS,
  reconcileShipmentStatus,
} from "@/lib/order-transitions";
import { round2 } from "@/lib/order-totals";
import { recordPaidOrderInGoogleAnalytics } from "@/lib/google-analytics";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { getInPersonOrderGuard } from "@/lib/in-person-orders";
import {
  assertWelcomeBenefitEligibility,
  markWelcomeBenefitRedeemed,
  releaseWelcomeBenefitReservation,
  reserveWelcomeBenefit,
} from "@/lib/customer-benefits";
import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  DiscountType,
  OrderStatus,
  PaymentMethod,
  ShippingStatus,
  OrderType,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { recordInventoryIssues } from "@/lib/order-inventory-issues";
import { OrderInventoryIssueKind } from "@prisma/client";

export async function OPTIONS(req: Request) {
  return NextResponse.json(
    {},
    {
      headers: createCorsHeaders(req, { methods: "GET, OPTIONS" }),
    },
  );
}

/**
 * Lectura de un pedido por id. La tienda en línea la usa desde la página del
 * pedido: para un pedido de invitada el id hace de llave (llega por correo o
 * WhatsApp); un pedido de una clienta con cuenta solo se entrega a su sesión
 * o a la dueña, y a cualquier otra persona se le responde 404 como si no
 * existiera. La respuesta de clienta es el `select` público: nunca el token,
 * las notas internas, los costos ni la utilidad. La dueña recibe la fila
 * completa.
 */
export async function GET(
  req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  const corsHeaders = createCorsHeaders(req, { methods: "GET, OPTIONS" });

  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.orderId)
      throw ErrorFactory.InvalidRequest("Se requiere el ID de la orden");

    const { userId } = await auth();
    const isOwner = await checkIfStoreOwner(userId, params.storeId);
    const where = { id: params.orderId, storeId: params.storeId };

    if (isOwner) {
      const order = await prismadb.order.findFirst({
        where,
        include: {
          orderItems: {
            orderBy: { createdAt: "asc" },
            include: { product: { include: { images: true } } },
          },
          payment: true,
          shipping: true,
          coupon: true,
        },
      });
      if (!order)
        throw ErrorFactory.NotFound(`La orden ${params.orderId} no existe`);
      return NextResponse.json(order, {
        headers: { ...corsHeaders, ...CACHE_HEADERS.DYNAMIC },
      });
    }

    const order = await prismadb.order.findFirst({
      where,
      select: CUSTOMER_ORDER_SELECT,
    });
    if (!order)
      throw ErrorFactory.NotFound(`La orden ${params.orderId} no existe`);
    // Un pedido de una clienta con cuenta no se abre con el enlace: el 404
    // no confirma que exista. Los pedidos que la dueña registra desde el
    // panel para clientas de WhatsApp llevan su propio `userId` (y
    // `createdBy`), y esos sí viajan por enlace, como los de invitada.
    const belongsToAccountCustomer =
      Boolean(order.userId) &&
      !order.createdBy &&
      !(await checkIfStoreOwner(order.userId, params.storeId));
    if (belongsToAccountCustomer && order.userId !== userId)
      throw ErrorFactory.NotFound(`La orden ${params.orderId} no existe`);
    return NextResponse.json(toCustomerOrderResponse(order), {
      headers: { ...corsHeaders, ...CACHE_HEADERS.DYNAMIC },
    });
  } catch (error) {
    return handleErrorResponse(error, "ORDER_GET", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.DYNAMIC },
    });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  const corsHeaders = createCorsHeaders(req, {
    methods: "GET, PATCH, DELETE, OPTIONS",
  });
  const { userId } = await auth();

  try {
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.orderId)
      throw ErrorFactory.InvalidRequest("Se requiere el ID de la orden");

    const body = await req.json();
    const couponCodeProvided = Object.prototype.hasOwnProperty.call(
      body,
      "couponCode",
    );
    const {
      fullName,
      phone,
      address,
      orderItems: orderItemsInput,
      status: statusInput,
      expectedStatus,
      payment,
      shipping,
      shippingProvider,
      envioClickIdRate,
      email,
      userId: requestUserId,
      guestId,
      documentId,
      subtotal,
      total,
      discount,
      couponCode,
      city,
      department,
      daneCode,
      neighborhood,
      address2,
      addressReference,
      company,
      skipAutoGuide,
      // Unified Order Fields
      type,
      adminNotes,
      internalNotes,
      expiresAt,
    } = body;

    const orderItemsRequested: any[] | null = Array.isArray(orderItemsInput)
      ? orderItemsInput
      : null;

    // Validate order items count
    if (orderItemsRequested && orderItemsRequested.length > 1000) {
      throw ErrorFactory.InvalidRequest(
        "La orden excede el límite máximo de 1000 productos",
      );
    }

    await verifyStoreOwner(userId, params.storeId);

    const order = await prismadb.order.findUnique({
      where: { id: params.orderId },
      include: {
        orderItems: true,
        shipping: true,
        coupon: true,
        payment: true,
      },
    });
    if (!order)
      throw ErrorFactory.NotFound(`La orden ${params.orderId} no existe`);
    // Ventas presenciales (mostrador y feria): comprobantes, no se editan
    // aquí. Una venta de feria se anula desde la feria para que su
    // inventario reservado cuadre; una de mostrador se corrige con una
    // devolución o un ajuste.
    const editGuard = getInPersonOrderGuard(order.type, "edit");
    if (editGuard) throw ErrorFactory.Conflict(editGuard);
    const convertGuard = type ? getInPersonOrderGuard(type, "convert") : null;
    if (convertGuard) throw ErrorFactory.InvalidRequest(convertGuard);

    // Concurrencia: el formulario envía el estado con el que se cargó. Si el
    // pedido cambió mientras tanto (un webhook lo marcó pagado, otra pestaña
    // lo editó), no se pisa: se avisa y hay que recargar.
    if (expectedStatus && expectedStatus !== order.status) {
      throw ErrorFactory.Conflict(
        `El pedido cambió mientras lo editabas: ahora está «${ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status}». Recarga la página para ver el estado actual.`,
        { currentStatus: order.status, expectedStatus },
      );
    }

    let status = statusInput as OrderStatus | undefined;
    const transitionType: OrderType =
      (type as OrderType | undefined) || order.type;
    const transitionMethod =
      (payment?.method as PaymentMethod | undefined) ??
      order.payment?.method ??
      null;
    if (status && status !== order.status) {
      if (
        !canTransition(order.status, status, {
          type: transitionType,
          paymentMethod: transitionMethod,
        })
      ) {
        throw ErrorFactory.InvalidRequest(
          describeForbiddenTransition(order.status, status),
        );
      }
    }

    // El estado del pedido y el del envío se editan por separado, pero cuentan
    // la misma historia: «Marcar como enviado» deja el envío en camino y poner
    // el envío en camino deja el pedido «Enviado». Solo transiciones permitidas.
    const reconciled = reconcileShipmentStatus({
      from: order.status,
      to: status,
      shippingStatus: order.shipping?.status ?? null,
      requestedShippingStatus:
        (shipping?.status as ShippingStatus | undefined) ?? null,
      context: { type: transitionType, paymentMethod: transitionMethod },
    });
    if (reconciled.status) status = reconciled.status;
    if (reconciled.shippingStatus && shipping) {
      shipping.status = reconciled.shippingStatus;
    }
    const syncShippingStatus =
      reconciled.shippingStatus && !shipping && order.shipping
        ? reconciled.shippingStatus
        : null;

    // Un pedido pagado es un registro histórico: sus productos, precios y
    // descuentos no cambian aunque el catálogo cambie. Solo cliente, envío,
    // notas y estado siguen editables.
    const itemsLocked = isPaidLike(order.status);
    if (itemsLocked && orderItemsRequested) {
      const snapshot = (
        items: { productId?: string | null; quantity?: number }[],
      ) =>
        items
          .map((item) => `${item.productId ?? "manual"}:${item.quantity || 1}`)
          .sort()
          .join("|");
      if (snapshot(order.orderItems) !== snapshot(orderItemsRequested)) {
        throw ErrorFactory.InvalidRequest(
          "Los productos de un pedido pagado son un registro histórico y no se pueden cambiar. Si el cliente cambió de idea, cancela este pedido (el inventario vuelve) y crea uno nuevo.",
        );
      }
    }

    // Sin productos en el cuerpo (o con el pedido pagado) se trabaja sobre el
    // registro guardado: nunca se vuelve a valorar contra el catálogo de hoy.
    const orderItems: any[] =
      itemsLocked || !orderItemsRequested
        ? order.orderItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            name: item.name,
            price: Number(item.price),
            sku: item.sku,
            imageUrl: item.imageUrl,
          }))
        : orderItemsRequested;
    const rewriteItems = !itemsLocked && orderItemsRequested !== null;

    // Dos conceptos distintos que antes eran uno solo:
    //
    // - "el dinero entro"  -> PAID exacto. Fija `paidAt`, los financieros y
    //   dispara la guia. Un pedido contra entrega enviado todavia no cobro.
    // - "la mercancia salio de bodega" -> PAID o SENT (`isPaidLike`). Es lo
    //   que decide si hay que descontar o devolver inventario.
    //
    // Cuando ambos eran `=== PAID`, pasar de PAGADO a ENVIADO se leia como
    // "dejo de estar pagado" y devolvia todo el pedido al inventario.
    let wasPaid = order.status === OrderStatus.PAID;
    let isNowPaid = status === OrderStatus.PAID;
    let heldStock = isPaidLike(order.status);
    let holdsStock = status ? isPaidLike(status) : heldStock;

    // Validate discount and coupon conflicts
    if (
      discount &&
      couponCode &&
      discount.type != null &&
      discount.amount &&
      discount.amount > 0
    ) {
      throw ErrorFactory.Conflict(
        "No se puede aplicar un cupón y un descuento a la vez",
        {
          discountType: discount.type,
          discountAmount: discount.amount,
          couponCode,
        },
      );
    }

    // Validate discount data
    if ((discount?.type as DiscountType) && !discount?.amount) {
      throw ErrorFactory.InvalidRequest(
        "El monto del descuento es requerido cuando se selecciona un tipo",
      );
    }

    if (discount?.amount && !discount?.type) {
      throw ErrorFactory.InvalidRequest(
        "El tipo de descuento es requerido cuando se ingresa un monto",
      );
    }

    if (
      (discount?.type as DiscountType) === DiscountType.PERCENTAGE &&
      discount.amount > 100
    ) {
      throw ErrorFactory.InvalidRequest(
        "El descuento porcentual no puede ser mayor a 100%",
      );
    }

    if (discount?.amount && discount.amount < 0) {
      throw ErrorFactory.InvalidRequest("El descuento no puede ser negativo");
    }

    // REMOVED: Shipping status transition validations
    // REMOVED: Order status change validations

    let verifiedUserId = order.userId;
    if (requestUserId && order.userId !== requestUserId) {
      try {
        await (await clerkClient()).users.getUser(requestUserId);
        verifiedUserId = requestUserId;
      } catch (error) {
        throw ErrorFactory.NotFound("El usuario asignado no existe");
      }
    }

    const targetCoupon = await resolveCouponForOrderUpdate({
      storeId: params.storeId,
      couponCode,
      couponCodeProvided,
      existingCoupon: order.coupon,
      orderId: order.id,
    });
    const couponChanged = targetCoupon?.id !== order.coupon?.id;

    if (couponChanged && targetCoupon?.isWelcomeBenefit) {
      await assertWelcomeBenefitEligibility({
        coupon: targetCoupon,
        storeId: params.storeId,
        userId: verifiedUserId,
        checkoutEmail: email || order.email,
        database: prismadb,
      });
    }

    // Store original status before update
    const originalStatus = order.status;
    const originalShippingStatus = order.shipping?.status;

    // Validate Required Fields for Active Orders
    const targetStatus = status || order.status;

    if (couponChanged && itemsLocked) {
      throw ErrorFactory.Conflict(
        "El cupón de un pedido pagado no se puede cambiar: el descuento ya se cobró. Cancela el pedido y crea uno nuevo si hace falta.",
      );
    }
    const isActiveStatus = (
      [
        OrderStatus.CREATED,
        OrderStatus.PENDING,
        OrderStatus.PAID,
        OrderStatus.SENT,
      ] as OrderStatus[]
    ).includes(targetStatus);

    const targetType = type || order.type;
    const isStandardType = targetType === OrderType.STANDARD;

    if (isActiveStatus || isStandardType) {
      const finalName = fullName || order.fullName;
      const finalPhone = phone || order.phone;
      const finalEmail = email || order.email;
      const finalAddress = address || order.address;

      if (!finalName || !finalPhone || !finalEmail || !finalAddress) {
        throw ErrorFactory.InvalidRequest(
          "La orden debe tener nombre, teléfono, email y dirección para ser activada.",
        );
      }
    }

    const guideCreation = {
      attempted: false,
      success: false,
      error: null as string | null,
    };

    const updatedOrder = await prismadb.$transaction(async (tx) => {
      // Batch process products for better performance
      const products = await processOrderItemsInBatches(
        orderItems.filter((i: any) => i.productId),
        params.storeId,
        BATCH_SIZE,
      );

      // Create a map for O(1) lookups
      const productMap = new Map(products.map((p) => [p.id, p]));

      // Validate products existence based on status
      const isDraftOrQuote = (
        [
          OrderStatus.DRAFT,
          OrderStatus.QUOTATION,
          OrderStatus.SENT,
          OrderStatus.VIEWED,
        ] as OrderStatus[]
      ).includes(status || order.status);

      for (const item of orderItems) {
        if (item.productId) {
          if (!productMap.has(item.productId)) {
            throw ErrorFactory.NotFound(
              `Producto ${item.productId} no encontrado`,
            );
          }
        } else {
          // Manual item validation
          if (!isDraftOrQuote) {
            throw ErrorFactory.InvalidRequest(
              "No se pueden agregar items manuales a una orden activa (PENDING, PAID, ACCEPTED).",
            );
          }
          if (!item.name || item.price === undefined) {
            throw ErrorFactory.InvalidRequest(
              "Los items manuales requieren nombre y precio.",
            );
          }
        }
      }

      // STRICT VALIDATION: Check if we are transitioning to an active state
      if (
        status &&
        (
          [OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.ACCEPTED] as OrderStatus[]
        ).includes(status)
      ) {
        const hasManualItems = orderItems.some((item: any) => !item.productId);
        if (hasManualItems) {
          throw ErrorFactory.InvalidRequest(
            "No se puede activar la orden con items manuales. Por favor vincule todos los items a productos existentes.",
          );
        }
      }

      // Calculate discounted prices from active offers
      const pricesMap = await getProductsPrices(products, params.storeId);

      const itemsWithPrices = orderItems.map((item: any) => {
        if (item.productId) {
          const product = productMap.get(item.productId);
          const priceInfo = pricesMap.get(item.productId);
          // Priority: 1. Sent item.price (preserves historical order item price/custom admin price) -> 2. Active discount price -> 3. Base product price
          const effectivePrice =
            item.price !== undefined && item.price !== null
              ? Number(item.price)
              : (priceInfo?.price ?? product?.price ?? 0);
          return {
            product: { price: effectivePrice },
            quantity: item.quantity || 1,
            // Snapshot fields from product / item
            name: item.name || product?.name || "Producto",
            sku: item.sku || product?.sku || "N/A",
            imageUrl: item.imageUrl || product?.images[0]?.url || "",
            isCustom: false,
            // CRITICAL: Preserve productId to maintain link to real product. Do not remove.
            productId: item.productId,
          };
        } else {
          // Manual Item
          return {
            product: { price: Number(item.price || 0) },
            quantity: item.quantity || 1,
            name: item.name,
            sku: item.sku || "MANUAL",
            imageUrl: item.imageUrl || "",
            isCustom: true,
          };
        }
      });

      const authoritativeSubtotal =
        calculateOrderTotals(itemsWithPrices).subtotal;
      assertCouponMinimumOrderValue(targetCoupon, authoritativeSubtotal);

      const newShippingCost =
        shipping?.cost !== undefined
          ? Number(shipping.cost)
          : Number(order.shipping?.cost || 0);

      // Calculate totals (including shipping cost). A paid order keeps its
      // stored subtotal and discounts; only the shipping cost can still move.
      const totals = itemsLocked
        ? {
            subtotal: Number(order.subtotal),
            discount: Number(order.discount ?? 0),
            couponDiscount: Number(order.couponDiscount ?? 0),
            total: round2(
              Number(order.total) -
                Number(order.shipping?.cost ?? 0) +
                newShippingCost,
            ),
          }
        : calculateOrderTotals(itemsWithPrices, {
            discount:
              discount?.type && discount?.amount
                ? {
                    type: discount.type as DiscountType,
                    amount: discount.amount,
                  }
                : undefined,
            coupon: targetCoupon
              ? {
                  type: targetCoupon.type as DiscountType,
                  amount: targetCoupon.amount,
                }
              : undefined,
            shippingCost: newShippingCost,
          });

      // Log informative log if sent totals differ from recalculated totals,
      // but do NOT throw error — store owner admin updates are authoritative.
      const PRICE_TOLERANCE = 1;
      const totalDiff = Math.abs(totals.total - total);
      const subtotalDiff = Math.abs(totals.subtotal - subtotal);

      if (totalDiff > PRICE_TOLERANCE || subtotalDiff > PRICE_TOLERANCE) {
        console.warn("[ORDER_PATCH] Admin adjusted prices/totals:", {
          sent: { subtotal, total, shippingCost: shipping?.cost || 0 },
          calculated: totals,
          differences: { subtotalDiff, totalDiff },
        });
      }

      // CRITICAL FIX: Validate stock for PAID orders when changing items
      if (order.status === OrderStatus.PAID) {
        const newStockRequirements = orderItems
          .filter((item: any) => item.productId) // Exclude manual items
          .map((item: any) => ({
            productId: item.productId as string,
            quantity: item.quantity || 1,
          }));

        // Get current order items to calculate the difference
        const currentStockUsage = order.orderItems
          .filter((item) => item.productId) // Exclude manual items
          .map((item) => ({
            productId: item.productId as string,
            quantity: item.quantity,
          }));

        // Calculate net stock change (what we need - what we already have)
        const stockChanges: { [productId: string]: number } = {};

        // Add new requirements
        newStockRequirements.forEach(
          ({
            productId,
            quantity,
          }: {
            productId: string;
            quantity: number;
          }) => {
            stockChanges[productId] = (stockChanges[productId] || 0) + quantity;
          },
        );

        // Subtract current usage
        currentStockUsage.forEach(
          ({
            productId,
            quantity,
          }: {
            productId: string;
            quantity: number;
          }) => {
            stockChanges[productId] = (stockChanges[productId] || 0) - quantity;
          },
        );

        // Validate only products that need MORE stock
        const additionalStockNeeded = Object.entries(stockChanges)
          .filter(([, change]) => change > 0)
          .map(([productId, change]) => ({ productId, quantity: change }));

        if (additionalStockNeeded.length > 0) {
          await validateStockAvailability(tx, additionalStockNeeded);
        }
      }

      if (rewriteItems) {
        // Delete existing order items in batches
        await tx.orderItem.deleteMany({
          where: { orderId: order.id },
        });

        // Batch create new order items
        const createOperations = [];
        for (let i = 0; i < itemsWithPrices.length; i += BATCH_SIZE) {
          const batch = itemsWithPrices.slice(i, i + BATCH_SIZE);
          createOperations.push(
            ...batch.map((item: any) =>
              tx.orderItem.create({
                data: {
                  orderId: order.id,
                  quantity: item.quantity,
                  // Snapshot fields
                  name: item.name,
                  sku: item.sku,
                  price: item.product.price,
                  imageUrl: item.imageUrl,
                  isCustom: item.isCustom,
                  productId: item.productId || null,
                },
              }),
            ),
          );
        }
        await Promise.all(createOperations);
      }

      // Estado del envío derivado de «Marcar como enviado» cuando la petición
      // no trae el bloque de envío.
      if (syncShippingStatus && order.shipping) {
        await tx.shipping.update({
          where: { id: order.shipping.id },
          data: { status: syncShippingStatus },
        });
      }

      // Update the order
      const updated = await tx.order.update({
        where: { id: params.orderId },
        data: {
          fullName,
          phone,
          address,
          email,
          userId: verifiedUserId,
          guestId: verifiedUserId ? null : guestId,
          documentId,
          city,
          department,
          daneCode,
          neighborhood,
          address2,
          addressReference,
          company,
          subtotal: totals.subtotal,
          discount: totals.discount,
          ...(itemsLocked
            ? {}
            : {
                discountType: discount?.type as DiscountType,
                discountReason: discount?.reason,
              }),
          coupon: targetCoupon
            ? { connect: { id: targetCoupon.id } }
            : order.coupon
              ? { disconnect: true }
              : undefined,
          couponDiscount: targetCoupon ? totals.couponDiscount : 0,
          total: totals.total,
          ...(status && { status }),
          ...(type && { type }),
          adminNotes,
          internalNotes,
          expiresAt,
          payment: payment && {
            upsert: {
              create: {
                method: payment.method,
                transactionId: payment.transactionId,
                details: payment.details,
                store: { connect: { id: params.storeId } },
              },
              update: {
                method: payment.method,
                transactionId: payment.transactionId,
                details: payment.details,
              },
            },
          },
          // Upsert shipping for all providers including NONE (store pickup)
          ...(shipping && shippingProvider
            ? {
                shipping: {
                  upsert: {
                    create: {
                      status: shipping.status || ShippingStatus.Preparing,
                      provider: shippingProvider,
                      // Only set carrier-specific fields for non-NONE providers
                      ...(shippingProvider !== "NONE" && {
                        envioClickIdRate: envioClickIdRate || null,
                        carrierId: shipping.carrierId,
                        carrierName: shipping.carrierName,
                        courier: shipping.courier,
                        productId: shipping.productId,
                        productName: shipping.productName,
                        flete: shipping.flete,
                        minimumInsurance: shipping.minimumInsurance,
                        deliveryDays: shipping.deliveryDays,
                        isCOD: shipping.isCOD,
                        trackingCode: shipping.trackingCode,
                        trackingUrl: shipping.trackingUrl,
                        guideUrl: shipping.guideUrl,
                        estimatedDeliveryDate: shipping.estimatedDeliveryDate,
                        box: shipping.boxId
                          ? { connect: { id: shipping.boxId } }
                          : undefined,
                      }),
                      cost: shipping.cost,
                      notes: shipping.notes,
                      store: { connect: { id: params.storeId } },
                    },
                    update: {
                      ...(shippingProvider && { provider: shippingProvider }),
                      ...(shipping.status && { status: shipping.status }),
                      // Only update carrier-specific fields for non-NONE providers
                      ...(shippingProvider !== "NONE" && {
                        ...(envioClickIdRate !== undefined && {
                          envioClickIdRate: envioClickIdRate || null,
                        }),
                        carrierId: shipping.carrierId,
                        carrierName: shipping.carrierName,
                        courier: shipping.courier,
                        productId: shipping.productId,
                        productName: shipping.productName,
                        flete: shipping.flete,
                        minimumInsurance: shipping.minimumInsurance,
                        deliveryDays: shipping.deliveryDays,
                        isCOD: shipping.isCOD,
                        trackingCode: shipping.trackingCode,
                        trackingUrl: shipping.trackingUrl,
                        guideUrl: shipping.guideUrl,
                        estimatedDeliveryDate: shipping.estimatedDeliveryDate,
                        box:
                          shipping.boxId === null
                            ? { disconnect: true }
                            : shipping.boxId
                              ? { connect: { id: shipping.boxId } }
                              : undefined,
                      }),
                      cost: shipping.cost,
                      notes: shipping.notes,
                    },
                  },
                },
              }
            : {}),
        },
        include: {
          orderItems: { include: { product: true } },
          payment: true,
          shipping: true,
          coupon: true,
        },
      });

      // Handle stock changes with batching
      wasPaid = order.status === OrderStatus.PAID;
      isNowPaid = updated.status === OrderStatus.PAID;
      heldStock = isPaidLike(order.status);
      holdsStock = isPaidLike(updated.status);

      if (couponChanged) {
        if (order.coupon?.isWelcomeBenefit) {
          await releaseWelcomeBenefitReservation(tx, {
            couponId: order.coupon.id,
            userId: order.userId,
            orderId: order.id,
          });
        }

        if (updated.coupon?.isWelcomeBenefit && updated.userId) {
          await reserveWelcomeBenefit(tx, {
            couponId: updated.coupon.id,
            storeId: params.storeId,
            userId: updated.userId,
            orderId: updated.id,
          });
        }
      }

      if (
        isNowPaid &&
        updated.shipping &&
        !updated.shipping?.envioClickIdOrder &&
        updated.shipping.envioClickIdRate &&
        !skipAutoGuide
      ) {
        guideCreation.attempted = true;
        try {
          console.log(
            "[ORDER_UPDATE] Attempting to create guide automatically...",
          );
          // Pass the updated order data and transaction client to avoid re-querying and locks
          await createGuideForOrder(updated.id, params.storeId, updated, tx);
          guideCreation.success = true;
          console.log("[ORDER_UPDATE] Guide created automatically");
        } catch (error: any) {
          guideCreation.error = error?.message || "No se pudo crear la guía";
          console.error("[ORDER_UPDATE] Failed to create guide:", error);
          // Guide creation failed, but order update should still succeed.
          // El motivo se guarda en el envío: el toast se va, y la siguiente
          // persona que abra el pedido debe ver por qué sigue sin guía.
          await tx.shipping.update({
            where: { id: updated.shipping.id },
            data: {
              guideError: String(guideCreation.error).slice(0, 2000),
              guideAttemptedAt: new Date(),
            },
          });
        }
      } else {
        if (
          isNowPaid &&
          updated.shipping &&
          !updated.shipping?.envioClickIdOrder
        ) {
          if (skipAutoGuide) {
            console.log(
              "[ORDER_UPDATE] Skipping automatic guide creation - admin chose to skip",
            );
          } else {
            console.log(
              "[ORDER_UPDATE] Skipping automatic guide creation - no shipping rate available",
            );
          }
        }
      }

      if (holdsStock && !heldStock) {
        // Prepare stock updates for decrementing (Sales)
        const stockMovements = await explodeKitMovements(
          tx,
          updated.orderItems
            .filter((item) => item.productId) // Exclude manual items
            .map((item) => ({
              productId: item.productId as string,
              storeId: params.storeId,
              type: "ORDER_PLACED" as const,
              quantity: -item.quantity, // Negative for removal
              reason: `Orden Actualizada #${updated.orderNumber}`,
              referenceId: updated.id,
              cost: Number(item.product?.acqPrice) || 0,
              price: Number(item.price),
              createdBy: userId || "SYSTEM",
            })),
        );

        const stockResult = await createInventoryMovementBatchResilient(
          tx,
          stockMovements,
        );

        if (stockResult.failed.length > 0) {
          console.error(
            "Partial stock update failure (Upgrade to Paid):",
            stockResult.failed,
          );
          await recordInventoryIssues(tx, {
            storeId: params.storeId,
            orderId: updated.id,
            orderNumber: updated.orderNumber,
            kind: OrderInventoryIssueKind.DECREMENT,
            failed: stockResult.failed,
          });
        }

        // Invalidate cache since stock changed
        await invalidateStoreProductsCache(params.storeId);
      }

      // El dinero es otra cosa que la mercancia: un pedido contra entrega se
      // despacha antes de cobrarse, asi que descuenta inventario sin fijar
      // `paidAt` ni los financieros. Estos solo se escriben al cobrar.
      if (isNowPaid && !wasPaid) {
        // CRITICAL FIX: Increment coupon usage when order becomes PAID
        if (updated.coupon) {
          await tx.coupon.update({
            where: { id: updated.coupon.id },
            data: {
              usedCount: { increment: 1 },
            },
          });

          if (updated.coupon.isWelcomeBenefit) {
            await markWelcomeBenefitRedeemed(tx, {
              couponId: updated.coupon.id,
              userId: updated.userId,
              orderId: updated.id,
            });
          }
        }

        // BI Platform: Calculate and persist financial metrics when manually paid
        const financials = await calculateOrderFinancials(
          updated as any,
          updated.payment?.method,
          updated.shipping?.cost || 0,
          tx,
        );

        await tx.order.update({
          where: { id: updated.id },
          data: {
            ...financials,
            paidAt: new Date(),
          } as any,
        });
      }

      // 4. Handle Refund/Restock (la mercancia vuelve a bodega)
      if (heldStock && !holdsStock) {
        // Restock items
        const stockMovements = await explodeKitMovements(
          tx,
          updated.orderItems
            .filter((item) => item.productId)
            .map((item) => ({
              productId: item.productId as string,
              storeId: params.storeId,
              type: "ORDER_CANCELLED" as const,
              quantity: item.quantity, // Positive for addition
              reason: `Orden Cancelada/Revertida #${updated.orderNumber}`,
              referenceId: updated.id,
              cost: Number(item.product?.acqPrice) || 0,
              price: Number(item.price),
              createdBy: userId || "SYSTEM",
            })),
        );

        // We use standard batch because restocking shouldn't fail (unless product deleted?)
        await createInventoryMovementBatch(tx, stockMovements, false);

        // Invalidate cache since stock changed
        await invalidateStoreProductsCache(params.storeId);

        // CRITICAL FIX: Decrement coupon usage when PAID order becomes unpaid
        if (order.coupon) {
          await tx.coupon.updateMany({
            where: { id: order.coupon.id, usedCount: { gt: 0 } },
            data: { usedCount: { decrement: 1 } },
          });

          if (order.coupon.isWelcomeBenefit) {
            await releaseWelcomeBenefitReservation(tx, {
              couponId: order.coupon.id,
              userId: order.userId,
              orderId: order.id,
            });
          }
        }
      }

      return updated;
    });

    if (
      originalStatus !== OrderStatus.PAID &&
      updatedOrder.status === OrderStatus.PAID
    ) {
      try {
        await recordPaidOrderInGoogleAnalytics(updatedOrder.id);
      } catch (analyticsError) {
        console.error(
          "[ORDER_PATCH] GA4 purchase tracking failed:",
          analyticsError,
        );
      }
    }

    // Async email notifications
    setImmediate(async () => {
      try {
        // Only fetch necessary fields for email
        const emailOrder = await prismadb.order.findUnique({
          where: { id: params.orderId },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            shipping: { select: { status: true } },
            payment: { select: { method: true } },
            email: true,
            fullName: true,
            // Add other necessary fields
          },
        });

        if (!emailOrder) return;

        // Status change notification
        if (status && emailOrder.status !== originalStatus) {
          await sendOrderEmail(
            {
              ...emailOrder,
              payment: emailOrder.payment?.method ?? null,
            } as any,
            emailOrder.status,
            { notifyAdmin: false },
          );
        }

        // Shipping status change
        if (
          shipping?.status &&
          emailOrder.shipping?.status !== originalShippingStatus
        ) {
          await sendOrderEmail(
            {
              ...emailOrder,
              payment: emailOrder.payment?.method ?? null,
            } as any,
            emailOrder.shipping?.status as ShippingStatus,
            { notifyAdmin: false },
          );
        }
      } catch (emailError) {
        console.error("Email sending failed:", emailError);
      }
    });

    return NextResponse.json(
      { ...updatedOrder, guideCreation },
      {
        headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
      },
    );
  } catch (error) {
    return handleErrorResponse(error, "ORDER_PATCH", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  const corsHeaders = createCorsHeaders(req, {
    methods: "GET, PATCH, DELETE, OPTIONS",
  });
  const { userId } = await auth();

  try {
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.orderId)
      throw ErrorFactory.InvalidRequest("Se requiere el ID de la orden");

    await verifyStoreOwner(userId, params.storeId);

    const order = await prismadb.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: params.orderId },
        include: {
          shipping: true,
          payment: true,
          coupon: true,
          orderItems: true,
        },
      });
      if (!order)
        throw ErrorFactory.NotFound(`La orden ${params.orderId} no existe`);
      const deleteGuard = getInPersonOrderGuard(order.type, "delete");
      if (deleteGuard) throw ErrorFactory.Conflict(deleteGuard);

      // Un pedido se puede eliminar en cualquier estado (los guardas se
      // quitaron a proposito), pero no si arrastra una guia de EnvioClick
      // viva: al borrar el pedido se borra en cascada la fila `Shipping` que
      // guarda `envioClickIdOrder`, y la guia queda cobrada y activa en el
      // transportador sin ningun registro que la ate a nada.
      if (order.shipping?.envioClickIdOrder) {
        throw ErrorFactory.Conflict(
          `El pedido ${order.orderNumber} tiene una guía de EnvioClick activa (${order.shipping.trackingCode ?? order.shipping.envioClickIdOrder}). Cancela el envío antes de eliminarlo, o la guía seguirá cobrada y sin registro.`,
        );
      }

      // La mercancia vuelve a bodega si el pedido todavia la tenia descontada.
      // PAGADO y ENVIADO descuentan igual (`isPaidLike`); un CANCELADO ya la
      // devolvio al cancelarse y no debe devolverla dos veces.
      if (isPaidLike(order.status)) {
        const stockMovements = order.orderItems
          .filter((item) => item.productId) // Exclude manual items
          .map((item) => ({
            productId: item.productId as string,
            storeId: params.storeId,
            type: "ORDER_CANCELLED" as const, // Effectively a return/refund
            quantity: item.quantity, // Positive for addition
            reason: `Orden Eliminada #${order.orderNumber}`,
            referenceId: order.id,
            createdBy: userId || "SYSTEM",
          }));

        // Un kit devuelve tambien sus componentes: sin esto el kit recupera
        // una unidad fantasma y los componentes vendidos se pierden del libro.
        const stockResult = await createInventoryMovementBatchResilient(
          tx,
          await explodeKitMovements(tx, stockMovements),
        );

        // Log any stock update failures but don't throw errors
        if (stockResult.failed.length > 0) {
          console.warn("Some stock restock failed during order deletion:", {
            orderId: order.id,
            orderNumber: order.orderNumber,
            failed: stockResult.failed,
            success: stockResult.success,
          });
          // El pedido se borra enseguida: la fila queda con `orderId` en null
          // y el número del pedido, para que la deuda no muera con él.
          await recordInventoryIssues(tx, {
            storeId: params.storeId,
            orderId: order.id,
            orderNumber: order.orderNumber,
            kind: OrderInventoryIssueKind.RESTOCK,
            failed: stockResult.failed,
          });
        }
      }

      // Disconnect coupon if exists
      if (order.coupon) {
        // Un pedido ENVIADO tambien consumio el cupon.
        if (isPaidLike(order.status)) {
          await tx.coupon.update({
            where: { id: order.coupon.id },
            data: {
              usedCount: {
                decrement: 1,
              },
            },
          });
        }

        await tx.order.update({
          where: { id: order.id },
          data: {
            coupon: { disconnect: true },
            couponDiscount: 0,
          },
        });

        if (order.coupon.isWelcomeBenefit) {
          await releaseWelcomeBenefitReservation(tx, {
            couponId: order.coupon.id,
            userId: order.userId,
            orderId: order.id,
          });
        }
      }

      // Delete the order
      const deletedOrder = await tx.order.delete({
        where: { id: params.orderId, storeId: params.storeId },
      });

      return deletedOrder;
    });

    // Sin esto la tienda seguia mostrando el stock viejo tras la devolucion.
    await invalidateStoreProductsCache(params.storeId);

    // Async cancellation email
    setImmediate(async () => {
      try {
        const emailData = await prismadb.order.findUnique({
          where: { id: params.orderId },
          select: {
            id: true,
            orderNumber: true,
            email: true,
            fullName: true,
            // Add other necessary fields
          },
        });

        if (emailData) {
          await sendOrderEmail(
            {
              ...emailData,
              payment: null,
            } as any,
            OrderStatus.CANCELLED,
            { notifyAdmin: false },
          );
        }
      } catch (emailError) {
        console.error("Cancellation email failed:", emailError);
      }
    });

    return NextResponse.json(order, {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  } catch (error) {
    return handleErrorResponse(error, "ORDER_DELETE", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  }
}
