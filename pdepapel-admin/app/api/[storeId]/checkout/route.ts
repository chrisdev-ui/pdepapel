import { Coupon } from "@prisma/client";
import {
  OrderStatus,
  PaymentMethod,
  ShippingProvider,
  ShippingStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { cleanPhoneNumber } from "@/constants/shipping";
import { handleErrorResponse } from "@/lib/api-error-response";
import { ErrorFactory } from "@/lib/api-errors";
import { getColombiaDate } from "@/lib/date-utils";
import prismadb from "@/lib/prismadb";
import {
  CACHE_HEADERS,
  calculateOrderTotals,
  currencyFormatter,
  generateOrderNumber,
  generatePayUPayment,
  generateWompiPayment,
} from "@/lib/utils";
import {
  checkIfStoreOwner,
  getLastOrderTimestamp,
  processOrderItemsInBatches,
} from "@/lib/db-utils";
import { auth, clerkClient } from "@clerk/nextjs";
import { sendOrderEmail } from "@/lib/email";
import { BATCH_SIZE } from "@/constants";
import { ENVIOCLICK_DEFAULTS } from "@/constants/shipping";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  ...CACHE_HEADERS.NO_CACHE,
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const { userId: userLogged, user } = auth();
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const isStoreOwner = userLogged
      ? await checkIfStoreOwner(userLogged, params.storeId)
      : false;

    const {
      fullName,
      phone,
      address, // Dirección principal
      email,
      orderItems,
      userId,
      guestId,
      payment,
      couponCode,
      subtotal,
      total,
      // ⭐ New fields
      address2, // Dirección complementaria (opcional)
      addressReference, // Referencia (opcional)
      city, // Ciudad del destino
      department, // Departamento del destino
      daneCode, // Código DANE (ya calculado por el quote)
      neighborhood, // Barrio (opcional)
      company, // Empresa (opcional)
      shipping,
      envioClickIdRate, // ⭐ ID de tarifa de EnvioClick (top level)
      documentId, // ⭐ Cédula/NIT (opcional)
    } = await req.json();

    console.log(
      `📥 Checkout request received - Store: ${params.storeId}, Payment: ${payment.method}, Items: ${orderItems.length}, Total: ${currencyFormatter(total)}`,
    );

    if (!fullName)
      throw ErrorFactory.InvalidRequest("El nombre completo es obligatorio");
    if (!phone)
      throw ErrorFactory.InvalidRequest("El número de teléfono es obligatorio");
    if (!email)
      throw ErrorFactory.InvalidRequest("El correo electrónico es obligatorio");
    if (!address)
      throw ErrorFactory.InvalidRequest("La dirección es obligatoria");
    if (!orderItems || orderItems.length === 0)
      throw ErrorFactory.InvalidRequest(
        "La lista de productos en el pedido no puede estar vacía",
      );
    if (!city || !department)
      throw ErrorFactory.InvalidRequest(
        "La ciudad y el departamento son obligatorios",
      );
    if (!daneCode)
      throw ErrorFactory.InvalidRequest(
        "El código DANE es obligatorio para el envío",
      );

    // Validate shipping data is provided
    if (!shipping || !shipping.cost) {
      throw ErrorFactory.InvalidRequest(
        "Debe proporcionar información de envío válida",
      );
    }

    const rateId = envioClickIdRate || shipping?.idRate;
    if (!rateId) {
      throw ErrorFactory.InvalidRequest("Debe seleccionar un método de envío");
    }

    // Validate order items count
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

    const lastOrderTimestamp = await getLastOrderTimestamp(
      authenticatedUserId,
      guestId,
      params.storeId,
    );
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
    if (lastOrderTimestamp && lastOrderTimestamp > threeMinutesAgo)
      throw ErrorFactory.OrderLimit();

    // Try to validate against cache (security check)
    const shippingCaches = await prismadb.shippingQuote.findMany({
      where: {
        storeId: params.storeId,
        destDaneCode: daneCode,
        expiresAt: { gte: getColombiaDate() },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const fallbackQuote = {
      ...shipping,
      totalCost: shipping.cost,
      carrier: shipping.carrierName || shipping.courier,
      product: shipping.productName,
      idRate: shipping.idRate || envioClickIdRate,
      // Provide fallback values for fields that might not exist in frontend shipping object
      idCarrier: shipping.carrierId || null,
      idProduct: shipping.productId || null,
      flete: shipping.flete || shipping.cost || 0,
      minimumInsurance: shipping.minimumInsurance || 0,
      deliveryDays: shipping.deliveryDays || 0,
      isCOD: shipping.isCOD || false,
    };

    let selectedQuote: any = fallbackQuote; // Default to provided shipping data (normalized)

    // If we have active caches, try to validate
    if (shippingCaches && shippingCaches.length > 0) {
      for (const cache of shippingCaches) {
        const quotesData = cache.quotesData as any;
        const quotes = quotesData?.rates || [];
        const found = quotes.find((q: any) => q.idRate === rateId);

        if (found) {
          selectedQuote = found;
          break;
        }
      }

      // If rate not found in cache but we have shipping data, log warning and continue
      if (selectedQuote === fallbackQuote) {
        console.warn(
          `⚠️ Rate ID ${rateId} not found in active caches for store ${params.storeId}. ` +
            `Using provided shipping data. This may indicate an expired quote.`,
        );
      } else {
        console.log(
          `✅ Using cached quote for rate ID ${rateId}, carrier: ${selectedQuote.carrier}, cost: ${currencyFormatter(selectedQuote.totalCost)}`,
        );
      }
    } else {
      // No active caches, use provided shipping data
      console.warn(
        `⚠️ No active shipping caches found for daneCode ${daneCode}, store ${params.storeId}. ` +
          `Using provided shipping data.`,
      );
    }

    // Ensure selectedQuote has required fields
    if (!selectedQuote.totalCost || !selectedQuote.carrier) {
      throw ErrorFactory.InvalidRequest(
        "Los datos de envío son inválidos. Por favor, solicita una nueva cotización.",
      );
    }

    const costDifference = Math.abs(
      selectedQuote.totalCost - (shipping?.cost || 0),
    );
    const TOLERANCE = 1000; // Increased tolerance for cached vs fresh quotes

    if (costDifference > TOLERANCE) {
      console.warn(
        `⚠️ Shipping cost discrepancy. Expected: ${currencyFormatter(selectedQuote.totalCost)}, ` +
          `Received: ${currencyFormatter(shipping.cost)}`,
      );
      // Don't throw error - just log for monitoring
    }

    // Batch process products for validation and pricing
    const products = await processOrderItemsInBatches(
      orderItems,
      params.storeId,
      BATCH_SIZE,
    );

    // Create product map for O(1) lookups
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Calculate discounted prices
    const { getProductsPrices } = await import("@/lib/discount-engine");
    const discountedPricesMap = await getProductsPrices(
      products,
      params.storeId,
    );

    const errors: string[] = [];
    const orderItemsData = [];

    for (const { productId, quantity = 1 } of orderItems) {
      const product = productMap.get(productId);

      if (!product) {
        errors.push(`El producto ${productId} no existe`);
        continue;
      }

      if (product.stock < quantity) {
        errors.push(
          `El producto ${product.name} no tiene suficiente stock disponible. Stock disponible: ${product.stock}, cantidad solicitada: ${quantity}`,
        );
        continue;
      }

      orderItemsData.push({
        product: { connect: { id: productId } },
        quantity,
      });
    }

    if (errors.length > 0) throw ErrorFactory.InvalidRequest(errors.join(", "));

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
        throw ErrorFactory.NotFound(
          "Este cupón no es válido: puede estar inactivo, no haber iniciado aún o ya haber expirado",
        );
      }

      if (subtotal < Number(coupon.minOrderValue ?? 0)) {
        throw ErrorFactory.Conflict(
          `El pedido debe ser mayor a ${currencyFormatter(coupon.minOrderValue ?? 0)} para usar este cupón`,
        );
      }
    }

    // Create items with prices using product map and discounted prices
    const itemsWithPrices = orderItems.map(
      ({
        productId,
        quantity = 1,
      }: {
        productId: string;
        quantity?: number;
      }) => {
        const product = productMap.get(productId);
        if (!product) {
          throw ErrorFactory.NotFound(`Producto ${productId} no encontrado`);
        }

        const pricing = discountedPricesMap.get(productId);
        const finalPrice = pricing ? pricing.price : product.price;

        return {
          product: { price: finalPrice },
          quantity,
        };
      },
    );

    const totals = calculateOrderTotals(itemsWithPrices, {
      coupon: coupon ? { type: coupon.type, amount: coupon.amount } : undefined,
      shippingCost: selectedQuote.totalCost,
    });

    if (
      Math.abs(totals.total - total) > 0.01 ||
      Math.abs(totals.subtotal - subtotal) > 0.01
    ) {
      throw ErrorFactory.InvalidRequest(
        "Los montos calculados no coinciden con los enviados",
      );
    }

    const orderNumber = generateOrderNumber();
    const order = await prismadb.order.create({
      data: {
        storeId: params.storeId,
        userId: authenticatedUserId,
        guestId: !authenticatedUserId ? guestId : null,
        orderNumber: orderNumber,
        status: OrderStatus.PENDING,
        fullName,
        phone: cleanPhoneNumber(phone),
        email,
        documentId: documentId || null, // ⭐ Guardar documento
        address,
        address2: address2 || null,
        addressReference: addressReference || null,
        city,
        department,
        daneCode,
        neighborhood: neighborhood || null,
        company: company || null,
        subtotal: totals.subtotal,
        total: totals.total,
        couponDiscount: totals.couponDiscount,
        couponId: coupon?.id,
        orderItems: { create: orderItemsData },
        shipping: {
          create: {
            storeId: params.storeId,
            provider: ShippingProvider.ENVIOCLICK,
            status: ShippingStatus.Preparing,
            envioClickIdRate: selectedQuote.idRate,
            carrierId: selectedQuote.idCarrier,
            carrierName: selectedQuote.carrier,
            courier: selectedQuote.carrier,
            productId: selectedQuote.idProduct,
            productName: selectedQuote.product,
            flete: selectedQuote.flete,
            minimumInsurance: selectedQuote.minimumInsurance,
            isCOD: selectedQuote.isCOD || false,
            cost: selectedQuote.totalCost,
            deliveryDays: selectedQuote.deliveryDays,
            requestPickup: ENVIOCLICK_DEFAULTS.requestPickup,
            hasInsurance: ENVIOCLICK_DEFAULTS.insurance,
            // Guardar datos de cotización completos
            quotationData: selectedQuote,
          },
        },
        payment: {
          create: {
            storeId: params.storeId,
            method: payment.method,
          },
        },
      },
      include: {
        orderItems: {
          include: {
            product: true,
          },
        },
        coupon: true,
      },
    });

    // Send email asynchronously
    setImmediate(async () => {
      try {
        await sendOrderEmail(
          {
            ...order,
            email: email ?? user?.emailAddresses[0]?.emailAddress,
            payment: payment.method,
          },
          OrderStatus.PENDING,
        );
      } catch (emailError) {
        console.error("Failed to send order email:", emailError);
      }
    });

    console.log(
      `✅ Order created successfully - ID: ${order.id}, Number: ${order.orderNumber}, Total: ${currencyFormatter(order.total)}, Items: ${order.orderItems.length}`,
    );

    // Generate payment based on method
    try {
      console.log(
        `🔐 Generating ${payment.method} payment for order ${order.orderNumber}`,
      );
      if (payment.method === PaymentMethod.PayU) {
        const payUData = generatePayUPayment(order);
        console.log(
          `✅ PayU payment data generated - Reference: ${payUData.referenceCode}, Amount: ${currencyFormatter(payUData.amount)}`,
        );
        return NextResponse.json({ ...payUData }, { headers: corsHeaders });
      }

      const url = await generateWompiPayment(order);
      console.log(
        `✅ Wompi payment URL generated for order ${order.orderNumber}`,
      );
      return NextResponse.json({ url }, { headers: corsHeaders });
    } catch (paymentError: any) {
      console.error(
        `❌ Payment generation failed for order ${order.orderNumber}:`,
        paymentError,
      );
      throw ErrorFactory.InvalidRequest(
        `Error al generar datos de pago: ${paymentError.message}`,
      );
    }
  } catch (error: any) {
    return handleErrorResponse(error, "ORDER_CHECKOUT", {
      headers: corsHeaders,
    });
  }
}
