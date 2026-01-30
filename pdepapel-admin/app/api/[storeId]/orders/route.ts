import { BATCH_SIZE } from "@/constants";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getColombiaDate } from "@/lib/date-utils";
import { sendOrderEmail } from "@/lib/email";
import prismadb from "@/lib/prismadb";
import { createGuideForOrder } from "@/lib/shipping-helpers";
import { getProductsPrices } from "@/lib/discount-engine";

import {
  CACHE_HEADERS,
  calculateOrderTotals,
  checkIfStoreOwner,
  currencyFormatter,
  generateOrderNumber,
  getLastOrderTimestamp,
  processOrderItemsInBatches,
  verifyStoreOwner,
} from "@/lib/utils";
import {
  createInventoryMovementBatchResilient,
  createInventoryMovementBatch,
  validateStockAvailability,
  CreateInventoryMovementParams,
} from "@/lib/inventory";
import { auth, clerkClient } from "@clerk/nextjs";
import {
  Coupon,
  DiscountType,
  OrderStatus,
  PaymentMethod,
  ShippingProvider,
  ShippingStatus,
  OrderType,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

type OrderData = {
  storeId: string;
  userId: string | null;
  guestId: string | null;
  orderNumber: string;
  fullName: string;
  phone: string;
  email?: string;
  address: string;
  documentId?: string | null;
  city?: string;
  department?: string;
  daneCode?: string;
  neighborhood?: string | null;
  address2?: string | null;
  addressReference?: string | null;
  company?: string | null;
  subtotal: number;
  discount?: number;
  discountType?: DiscountType;
  discountReason?: string | null;
  couponId?: string | null;
  couponDiscount?: number;
  total: number;
  // Unified Order Fields
  type?: OrderType;
  token?: string | null;
  expiresAt?: Date | null;
  adminNotes?: string | null;
  internalNotes?: string | null;
  createdBy?: string | null;
  // Relations
  orderItems: { create: any };
  status?: any;
  payment?: { create: any };
  shipping?: { create: any };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const { userId: userLogged } = auth();

  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const isStoreOwner = userLogged
      ? await checkIfStoreOwner(userLogged, params.storeId)
      : false;

    const body = await req.json();
    const {
      fullName,
      phone,
      email,
      orderItems,
      status,
      payment,
      city,
      department,
      daneCode,
      neighborhood,
      address,
      address2,
      addressReference,
      company,
      shipping,
      shippingProvider,
      envioClickIdRate,
      userId,
      guestId,
      documentId,
      subtotal,
      total,
      discount,
      couponCode,
      // New Unified Order Fields
      type,
      daysValid, // For calculating expiresAt
      adminNotes,
      internalNotes,
      createdBy, // Optional admin user ID
    } = body;

    if (!orderItems || orderItems.length === 0) {
      throw ErrorFactory.InvalidRequest(
        "La orden debe tener al menos un producto",
      );
    }

    // Strict validation for Active Orders (CREATED, PENDING, PAID, SENT)
    const isActiveOrder = [
      OrderStatus.CREATED,
      OrderStatus.PENDING,
      OrderStatus.PAID,
      OrderStatus.SENT,
    ].includes(status);

    if (isActiveOrder) {
      if (!fullName || !phone || !email || !address) {
        throw ErrorFactory.InvalidRequest(
          "Faltan campos obligatorios para órdenes activas (nombre, teléfono, email, dirección)",
        );
      }
    } else {
      // For Drafts/Quotes, minimally require a name reference
      if (!fullName) {
        throw ErrorFactory.InvalidRequest(
          "Se requiere al menos un nombre para la orden/cotización",
        );
      }
    }

    if (orderItems.length > 1000) {
      throw ErrorFactory.InvalidRequest(
        "La orden excede el límite máximo de 1000 productos",
      );
    }

    let authenticatedUserId = userLogged;
    if (userId) {
      if (isStoreOwner) {
        try {
          await clerkClient.users.getUser(userId);
          authenticatedUserId = userId;
        } catch (error) {
          throw ErrorFactory.NotFound("El usuario asignado no existe");
        }
      } else if (!userLogged) {
        const user = await clerkClient.users.getUser(userId);
        if (user) {
          authenticatedUserId = user.id;
        } else {
          throw ErrorFactory.Unauthenticated();
        }
      }
    }

    if (isStoreOwner && shipping) {
      if (shippingProvider === ShippingProvider.ENVIOCLICK) {
        if (!envioClickIdRate)
          throw ErrorFactory.InvalidRequest(
            "Se requiere seleccionar una tarifa de EnvioClick para el envío",
          );
        if (!city || !department || !daneCode)
          throw ErrorFactory.InvalidRequest(
            "Se requieren ciudad, departamento y código DANE para envíos con EnvioClick",
          );
      } else if (shipping.provider === "MANUAL") {
        if (!shipping.courier || !shipping.carrierName) {
          throw ErrorFactory.InvalidRequest(
            "Se requiere el nombre del transportista para envíos manuales",
          );
        }
      }
    }

    if (!isStoreOwner) {
      if (discount?.type && discount?.amount) throw ErrorFactory.Unauthorized();

      const lastOrderTimestamp = await getLastOrderTimestamp(
        authenticatedUserId,
        guestId,
        params.storeId,
      );
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
      if (lastOrderTimestamp && lastOrderTimestamp > threeMinutesAgo)
        throw ErrorFactory.OrderLimit();
    }

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
          discountType: discount.type as DiscountType,
          discountAmount: discount.amount,
          couponCode,
        },
      );
    }

    if (discount?.type && !discount?.amount) {
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

    let coupon: Coupon | null = null;

    if (couponCode) {
      const now = getColombiaDate();
      coupon = await prismadb.coupon.findFirst({
        where: {
          storeId: params.storeId,
          code: couponCode.toUpperCase(),
          isActive: true,
          startDate: { lte: now },
          endDate: { gte: now },
          OR: [
            { maxUses: null },
            {
              AND: [
                { maxUses: { not: null } },
                { usedCount: { lt: prismadb.coupon.fields.maxUses } },
              ],
            },
          ],
        },
      });

      if (!coupon) {
        throw ErrorFactory.NotFound("Código de cupón no válido o expirado");
      }

      if (subtotal < Number(coupon.minOrderValue ?? 0)) {
        throw ErrorFactory.Conflict(
          `El pedido debe ser mayor a ${currencyFormatter(coupon.minOrderValue ?? 0)} para usar este cupón`,
        );
      }
    }

    const order = await prismadb.$transaction(async (tx) => {
      // STRICT VALIDATION: Check if we are creating an active order
      if (
        !status ||
        [OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.ACCEPTED].includes(
          status,
        )
      ) {
        const hasManualItems = orderItems.some((item: any) => !item.productId);
        if (hasManualItems) {
          throw ErrorFactory.InvalidRequest(
            "No se puede crear una orden activa con items manuales. Por favor vincule todos los items a productos existentes.",
          );
        }
      }

      // Batch process ONLY products that have an ID
      const itemsWithProduct = orderItems.filter((item: any) => item.productId);
      const products = await processOrderItemsInBatches(
        itemsWithProduct,
        params.storeId,
        BATCH_SIZE,
      );

      // Create a map for faster lookups
      const productMap = new Map(products.map((p) => [p.id, p]));

      // Calculate discounted prices for all products
      const discountedPricesMap = await getProductsPrices(
        products,
        params.storeId,
      );

      const itemsWithPrices = orderItems.map(
        (item: {
          productId: string | null;
          quantity?: number;
          name?: string;
          price?: number;
          sku?: string;
          imageUrl?: string;
        }) => {
          if (item.productId) {
            const product = productMap.get(item.productId);
            if (!product) {
              // Only throw if product is expected but not found
              throw ErrorFactory.NotFound(
                `Producto ${item.productId} no encontrado`,
              );
            }

            const pricing = discountedPricesMap.get(item.productId);
            const finalPrice = pricing ? pricing.price : product.price;

            return {
              product: { price: finalPrice },
              quantity: item.quantity ?? 1,
              productId: item.productId,
              // Snapshot fields
              name: product.name,
              sku: product.sku,
              imageUrl: product.images?.[0]?.url || "",
              isCustom: false,
            };
          } else {
            // Manual Item - Validate existence of required fields for manual items
            if (!item.name || item.price === undefined) {
              throw ErrorFactory.InvalidRequest(
                "Items manuales requieren nombre y precio.",
              );
            }
            return {
              product: { price: item.price },
              quantity: item.quantity ?? 1,
              productId: null,
              name: item.name,
              sku: item.sku || "MANUAL",
              imageUrl: item.imageUrl || "",
              isCustom: true,
            };
          }
        },
      );

      const totals = calculateOrderTotals(itemsWithPrices, {
        discount:
          discount?.type && discount?.amount
            ? {
                type: discount.type as DiscountType,
                amount: discount.amount,
              }
            : undefined,
        coupon: coupon
          ? {
              type: coupon.type as DiscountType,
              amount: coupon.amount,
            }
          : undefined,
        shippingCost: shipping?.cost || 0,
      });

      // Use tolerance of 1 COP (appropriate for Colombian Peso which has no decimal places)
      // This accounts for floating-point rounding differences between frontend/backend
      const PRICE_TOLERANCE = 1;
      const totalDiff = Math.abs(totals.total - total);
      const subtotalDiff = Math.abs(totals.subtotal - subtotal);

      if (totalDiff > PRICE_TOLERANCE || subtotalDiff > PRICE_TOLERANCE) {
        // Log detailed info for debugging
        console.error("[ORDERS_POST] Price mismatch detected:", {
          sent: { subtotal, total, shippingCost: shipping?.cost || 0 },
          calculated: totals,
          differences: { subtotalDiff, totalDiff },
          items: itemsWithPrices.map(
            (
              item: { product: { price: number }; quantity: number },
              idx: number,
            ) => ({
              productId: orderItems[idx].productId,
              quantity: item.quantity,
              price: item.product.price,
            }),
          ),
          couponCode: coupon?.code ?? null,
          discount: discount ?? null,
        });

        throw ErrorFactory.InvalidRequest(
          "Los montos calculados no coinciden con los enviados",
        );
      }

      const orderNumber = generateOrderNumber();

      // CRITICAL FIX: Validate stock for ALL active orders (PENDING, PAID, etc.)
      // We don't deduct stock yet (that happens on PAID), but we MUST ensure it exists.
      if (isActiveOrder) {
        const stockValidationUpdates = orderItems.map(
          (item: { productId: string; quantity: number }) => ({
            productId: item.productId,
            quantity: item.quantity,
          }),
        );

        // Use strict validation - will throw error if insufficient stock
        await validateStockAvailability(tx, stockValidationUpdates);
      }

      // Generate Token & Expiration for Custom/Quote orders
      let token: string | null = null;
      let expiresAt: Date | null = null;

      if (type === OrderType.QUOTATION || type === OrderType.CUSTOM) {
        token = crypto.randomBytes(32).toString("hex");
        if (daysValid) {
          expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + daysValid);
        } else if (type === OrderType.QUOTATION) {
          expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 7);
        }
      }

      const orderData: OrderData = {
        storeId: params.storeId,
        userId: authenticatedUserId,
        guestId: !authenticatedUserId ? guestId : null,
        orderNumber,
        fullName,
        phone,
        status:
          status ||
          (type === OrderType.QUOTATION
            ? OrderStatus.DRAFT
            : OrderStatus.PENDING),
        address,
        email,
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
        discountType: discount?.type as DiscountType,
        discountReason: discount?.reason,
        couponId: coupon?.id,
        couponDiscount: totals.couponDiscount,
        total: totals.total,
        // Unified Logic
        type: type || OrderType.STANDARD,
        token,
        expiresAt,
        adminNotes,
        internalNotes,
        createdBy: createdBy || authenticatedUserId,
        orderItems: {
          create: itemsWithPrices.map((item: any) => ({
            quantity: item.quantity,
            name: item.name,
            sku: item.sku,
            price: item.product.price,
            imageUrl: item.imageUrl,
            isCustom: item.isCustom,
            productId: item.productId || null,
          })),
        },
      };

      if (payment)
        orderData.payment = {
          create: { ...payment, storeId: params.storeId },
        };

      // Only create shipping record if there's a valid provider (not NONE)
      if (shipping && shippingProvider && shippingProvider !== "NONE")
        orderData.shipping = {
          create: {
            ...shipping,
            status: ShippingStatus.Preparing, // Always start with Preparing
            provider: shippingProvider,
            envioClickIdRate: envioClickIdRate || null,
            storeId: params.storeId,
          },
        };

      const createdOrder = await tx.order.create({
        data: orderData,
        include: {
          orderItems: {
            include: {
              product: {
                include: {
                  kitComponents: true, // [NEW] Fetch components for stock logic
                },
              },
            },
          },
        },
      });

      // Batch update stock if order is paid
      if (status === OrderStatus.PAID) {
        const stockMovements = createdOrder.orderItems
          .filter((item) => item.productId && item.product)
          .map((item) => ({
            productId: item.productId as string,
            storeId: params.storeId,
            type: "ORDER_PLACED" as const,
            quantity: -item.quantity, // Negative for removal (Sale)
            reason: `Orden #${createdOrder.orderNumber}`,
            referenceId: createdOrder.id,
            cost: Number(item.product!.acqPrice) || 0,
            price: Number(item.product!.price),
            createdBy: authenticatedUserId || "SYSTEM",
          }));

        // [NEW] Explode Kits into Component Movements
        const explodedMovements: CreateInventoryMovementParams[] = [];

        for (const move of stockMovements) {
          explodedMovements.push(move); // Keep original movement (Kit or Product)

          const item = createdOrder.orderItems.find(
            (i) => i.productId === move.productId,
          );
          if (item?.product?.isKit && item.product.kitComponents) {
            for (const comp of item.product.kitComponents) {
              explodedMovements.push({
                productId: comp.componentId,
                storeId: params.storeId,
                type: "ORDER_PLACED" as const,
                quantity: move.quantity * comp.quantity, // quantity is negative, so this works
                reason: `Orden #${createdOrder.orderNumber} (Kit: ${item.product.name})`,
                referenceId: createdOrder.id,
                // For cost/price, we might use component's values if we had them,
                // but here we might not have component details loaded (only relations).
                // It's acceptable to have 0 or fetch if strictly needed.
                // createInventoryMovement will use snapshot for stock, but cost might need fetch.
                // Let's rely on default or simple pass for now.
                createdBy: authenticatedUserId || "SYSTEM",
              });
            }
          }
        }

        const stockResult = await createInventoryMovementBatchResilient(
          tx,
          explodedMovements, // Use expanded list
        );

        // Log stock update results but don't throw errors
        if (stockResult.failed.length > 0) {
          console.warn("Some stock updates failed:", {
            orderId: createdOrder.id,
            orderNumber: createdOrder.orderNumber,
            failed: stockResult.failed,
            success: stockResult.success,
          });
        }
      }

      // Update coupon usage if applicable
      if (coupon && status === OrderStatus.PAID) {
        await tx.coupon.update({
          where: { id: coupon.id },
          data: {
            usedCount: {
              increment: 1,
            },
          },
        });
      }

      return createdOrder;
    });

    let guideCreationResult = {
      attempted: false,
      success: false,
      error: null as string | null,
    };

    if (
      isStoreOwner &&
      status === OrderStatus.PAID &&
      shippingProvider === ShippingProvider.ENVIOCLICK &&
      envioClickIdRate
    ) {
      guideCreationResult.attempted = true;
      try {
        await createGuideForOrder(order.id, params.storeId);
        guideCreationResult.success = true;
        console.log(
          `[ADMIN_ORDER_CREATE] Guide created for order ${order.orderNumber}`,
        );
      } catch (error: any) {
        guideCreationResult.success = false;
        guideCreationResult.error = error.message || "Unknown error";
        console.error(
          `[ADMIN_ORDER_CREATE] Failed to create guide for order ${order.orderNumber}:`,
          error,
        );
      }
    }

    // Queue email sending asynchronously (don't wait for it)
    if (!isStoreOwner) {
      // Use setImmediate or setTimeout to avoid blocking the response
      setImmediate(async () => {
        try {
          const orderWithDetails = await prismadb.order.findUnique({
            where: { id: order.id },
            include: {
              payment: true,
              shipping: true,
              orderItems: {
                include: {
                  product: true,
                },
              },
            },
          });

          if (orderWithDetails) {
            await sendOrderEmail(
              {
                ...orderWithDetails,
                email: email || "",
                payment: orderWithDetails.payment?.method ?? null,
              },
              status || OrderStatus.PENDING,
            );
          }
        } catch (emailError) {
          console.error("Failed to send order email:", emailError);
          // Consider implementing a retry mechanism or queue system
        }
      });
    }

    return NextResponse.json(
      { ...order, guideCreation: guideCreationResult },
      {
        headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
      },
    );
  } catch (error) {
    return handleErrorResponse(error, "ORDERS_POST", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const userId = req.nextUrl.searchParams.get("userId");
    const guestId = req.nextUrl.searchParams.get("guestId");

    const whereClause: { storeId: string; userId?: string; guestId?: string } =
      {
        storeId: params.storeId,
      };

    if (userId) {
      whereClause.userId = userId;
    } else if (guestId) {
      whereClause.guestId = guestId;
    }

    const orders = await prismadb.order.findMany({
      where: whereClause,
      include: {
        orderItems: {
          include: {
            product: true,
          },
        },
        payment: true,
        shipping: true,
        coupon: true,
      },
    });

    return NextResponse.json(orders, {
      headers: { ...corsHeaders, ...CACHE_HEADERS.DYNAMIC },
    });
  } catch (error) {
    return handleErrorResponse(error, "ORDERS_GET", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.DYNAMIC },
    });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const { userId } = auth();
  try {
    if (!userId) throw ErrorFactory.Unauthenticated();

    const { ids }: { ids: string[] } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw ErrorFactory.InvalidRequest(
        "Se requieren IDs de órdenes válidas en formato de arreglo",
      );
    }

    // Limit batch size for deletions
    if (ids.length > 100) {
      throw ErrorFactory.InvalidRequest(
        "No se pueden eliminar más de 100 órdenes a la vez",
      );
    }

    await verifyStoreOwner(userId, params.storeId);

    const result = await prismadb.$transaction(async (tx) => {
      const orders = await tx.order.findMany({
        where: {
          id: {
            in: ids,
          },
          storeId: params.storeId,
        },
        include: {
          shipping: true,
          payment: true,
          coupon: true,
          orderItems: {
            include: {
              product: true,
            },
          },
        },
      });

      if (orders.length !== ids.length) {
        throw ErrorFactory.NotFound(
          "Algunas órdenes no se han encontrado en esta tienda",
        );
      }

      // Restock products for paid orders before deletion
      const paidOrders = orders.filter(
        (order) => order.status === OrderStatus.PAID,
      );
      if (paidOrders.length > 0) {
        const stockMovements = [];

        for (const order of paidOrders) {
          for (const item of order.orderItems) {
            if (item.productId && item.product) {
              stockMovements.push({
                productId: item.productId,
                storeId: params.storeId,
                type: "ORDER_CANCELLED" as const,
                quantity: item.quantity, // Positive for addition (Refund/Cancel)
                reason: `Orden Eliminada #${order.orderNumber}`,
                referenceId: order.id,
                cost: Number(item.product.acqPrice) || 0,
                price: Number(item.product.price),
                createdBy: userId || "SYSTEM",
              });
            }
          }
        }

        if (stockMovements.length > 0) {
          const stockResult = await createInventoryMovementBatchResilient(
            tx,
            stockMovements,
          );

          // Log any stock update failures but don't throw errors
          if (stockResult.failed.length > 0) {
            console.warn(
              "Some stock restock failed during batch order deletion:",
              {
                orderIds: paidOrders.map((o) => o.id),
                failed: stockResult.failed,
                success: stockResult.success,
              },
            );
          }
        }
      }

      // Batch disconnect coupons
      const ordersWithCoupons = orders.filter((order) => order.coupon);
      if (ordersWithCoupons.length > 0) {
        await tx.order.updateMany({
          where: {
            id: {
              in: ordersWithCoupons.map((order) => order.id),
            },
          },
          data: {
            couponId: null,
            couponDiscount: 0,
          },
        });
      }

      return await tx.order.deleteMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });
    });

    return NextResponse.json(result, {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  } catch (error) {
    return handleErrorResponse(error, "ORDERS_DELETE", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const { userId } = auth();

  try {
    if (!userId) throw ErrorFactory.Unauthenticated();

    const body = await req.json();
    const {
      ids,
      status,
      shipping,
    }: { ids: string[]; status?: OrderStatus; shipping?: ShippingStatus } =
      body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw ErrorFactory.InvalidRequest(
        "Se requieren IDs de órdenes válidas en formato de arreglo",
      );
    }

    await verifyStoreOwner(userId, params.storeId);

    const result = await prismadb.$transaction(async (tx) => {
      const orders = await tx.order.findMany({
        where: {
          id: {
            in: ids,
          },
          storeId: params.storeId,
        },
        include: {
          orderItems: {
            include: {
              product: true,
            },
          },
          shipping: true,
          payment: true,
        },
      });

      if (orders.length !== ids.length) {
        throw ErrorFactory.NotFound(
          "Algunas órdenes no se han encontrado en esta tienda",
        );
      }

      // Collect all stock updates to batch them
      const stockUpdates: CreateInventoryMovementParams[] = [];

      // CRITICAL FIX: First validate stock for orders becoming PAID
      if (status === OrderStatus.PAID) {
        const ordersBecomingPaid = orders.filter(
          (order) => order.status !== OrderStatus.PAID,
        );
        if (ordersBecomingPaid.length > 0) {
          const stockValidationUpdates: {
            productId: string;
            quantity: number;
          }[] = [];
          ordersBecomingPaid.forEach((order) => {
            order.orderItems.forEach((item) => {
              if (item.productId) {
                stockValidationUpdates.push({
                  productId: item.productId,
                  quantity: item.quantity,
                });
              }
            });
          });

          if (stockValidationUpdates.length > 0) {
            // Validate stock availability first
            // We only care about ensuring we have enough for the NEW requirements
            await validateStockAvailability(tx, stockValidationUpdates);
          }
        }
      }

      // Process all orders and collect stock updates
      for (const order of orders) {
        if (status) {
          const wasPaid = order.status === OrderStatus.PAID;
          const willBePaid = status === OrderStatus.PAID;

          if (willBePaid && !wasPaid) {
            // Will be paid - decrement stock (Sale)
            order.orderItems.forEach((item) => {
              if (item.productId && item.product) {
                stockUpdates.push({
                  productId: item.productId,
                  storeId: params.storeId,
                  type: "ORDER_PLACED" as const,
                  quantity: -item.quantity, // Negative for removal
                  reason: `Orden #${order.orderNumber}`,
                  referenceId: order.id,
                  cost: Number(item.product.acqPrice) || 0,
                  price: Number(item.product.price),
                  createdBy: userId || "SYSTEM",
                });
              }
            });
          } else if (!willBePaid && wasPaid) {
            // Was paid, now unpaid - increment stock (Restock/Cancel)
            order.orderItems.forEach((item) => {
              if (item.productId && item.product) {
                stockUpdates.push({
                  productId: item.productId,
                  storeId: params.storeId,
                  type: "ORDER_CANCELLED" as const,
                  quantity: item.quantity, // Positive for addition
                  reason: `Orden marcada como pendiente/cancelada #${order.orderNumber}`,
                  referenceId: order.id,
                  cost: Number(item.product.acqPrice) || 0,
                  price: Number(item.product.price),
                  createdBy: userId || "SYSTEM",
                });
              }
            });
          }
        }
      }

      // Batch execute stock updates using resilient method
      if (stockUpdates.length > 0) {
        const stockResult = await createInventoryMovementBatchResilient(
          tx,
          stockUpdates,
        );

        // Log stock update results but don't throw errors
        if (stockResult.failed.length > 0) {
          console.warn("Some stock updates failed in batch order update:", {
            orderIds: orders.map((o) => o.id),
            failed: stockResult.failed,
            success: stockResult.success,
          });
        }
      }

      // Update orders
      const updatePromises = orders.map(async (order) => {
        const updateData: {
          status?: OrderStatus;
          shipping?: { update: { status?: ShippingStatus } };
        } = {};

        if (status) {
          updateData.status = status;
        }

        if (shipping) {
          updateData.shipping = {
            update: {
              status: shipping,
            },
          };
        }

        return tx.order.update({
          where: { id: order.id },
          data: updateData,
          include: {
            orderItems: {
              include: {
                product: true,
              },
            },
            shipping: true,
            payment: true,
          },
        });
      });

      return Promise.all(updatePromises);
    });

    // Send email notifications asynchronously
    setImmediate(async () => {
      try {
        const emailPromises = result.map(async (order) => {
          if (status) {
            await sendOrderEmail(
              {
                ...order,
                payment: order.payment?.method ?? null,
              },
              status,
              {
                notifyAdmin: false,
              },
            );
          }

          if (shipping) {
            await sendOrderEmail(
              {
                ...order,
                payment: order.payment?.method ?? null,
              },
              shipping,
              {
                notifyAdmin: false,
              },
            );
          }
        });

        await Promise.allSettled(emailPromises);
      } catch (emailError) {
        console.error("Failed to send order emails:", emailError);
      }
    });

    return NextResponse.json(result, {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  } catch (error) {
    return handleErrorResponse(error, "ORDERS_PATCH", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  }
}
