import {
  Coupon,
  OrderStatus,
  PaymentMethod,
  Product,
  ShippingProvider,
  ShippingStatus,
  Prisma,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { env } from "@/lib/env.mjs";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createCorsHeaders } from "@/lib/cors";
import { normalizeGoogleAnalyticsClientId } from "@/lib/google-analytics";
import { generateBoldCheckoutData } from "@/lib/bold";
import { getColombiaDate } from "@/lib/date-utils";
import { getProductsPrices } from "@/lib/discount-engine";
import prismadb from "@/lib/prismadb";
import {
  CACHE_HEADERS,
  checkIfStoreOwner,
  CheckoutOrder,
  currencyFormatter,
  generateOrderNumber,
  generateWompiPayment,
  getLastOrderTimestamp,
  processOrderItemsInBatches,
} from "@/lib/utils";
import { calculateOrderTotals } from "@/lib/order-totals";
import { auth, clerkClient } from "@clerk/nextjs";
import { sendOrderEmail } from "@/lib/email";
import { BATCH_SIZE } from "@/constants";
import { ENVIOCLICK_DEFAULTS } from "@/constants/shipping";

const getCorsHeaders = (request: Request) => ({
  ...createCorsHeaders(request, { methods: "POST, OPTIONS" }),
  ...CACHE_HEADERS.NO_CACHE,
});

const parseOptionalInt = (val: any): number | null => {
  if (val === null || val === undefined || val === "") return null;
  const parsed = parseInt(String(val), 10);
  return isNaN(parsed) ? null : parsed;
};

const parseOptionalFloat = (val: any): number | null => {
  if (val === null || val === undefined || val === "") return null;
  const parsed = parseFloat(String(val));
  return isNaN(parsed) ? null : parsed;
};

const buildShippingPayload = (storeId: string, quote: any) => ({
  storeId,
  provider:
    quote?.provider === "CUSTOM" || quote?.shippingProvider === "CUSTOM"
      ? ShippingProvider.MANUAL
      : ShippingProvider.ENVIOCLICK,
  status: ShippingStatus.Preparing,
  envioClickIdRate: parseOptionalInt(quote?.idRate),
  carrierId: parseOptionalInt(quote?.idCarrier),
  carrierName: quote?.carrier || quote?.carrierName || "Acordar por WhatsApp",
  courier: quote?.carrier || quote?.courier || "Transportadora",
  productId: parseOptionalInt(quote?.idProduct),
  productName: quote?.product || quote?.productName || null,
  flete: parseOptionalFloat(quote?.flete) || 0,
  minimumInsurance: parseOptionalFloat(quote?.minimumInsurance) || 0,
  isCOD: Boolean(quote?.isCOD),
  cost: parseOptionalFloat(quote?.totalCost ?? quote?.cost) || 0,
  deliveryDays: parseOptionalInt(quote?.deliveryDays) || 0,
  requestPickup: ENVIOCLICK_DEFAULTS.requestPickup,
  hasInsurance: ENVIOCLICK_DEFAULTS.insurance,
  quotationData: quote,
});

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const corsHeaders = getCorsHeaders(req);
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
      customOrderToken, // ⭐ Token para convertir cotización
      analyticsClientId,
    } = await req.json();
    const normalizedAnalyticsClientId = isStoreOwner
      ? null
      : normalizeGoogleAnalyticsClientId(analyticsClientId);

    // Fix implicit any for orderItems
    const typedOrderItems = (orderItems || []) as {
      productId: string;
      quantity: number;
    }[];

    console.log(
      `📥 Checkout request received - Store: ${params.storeId}, Payment: ${payment.method}, Items: ${typedOrderItems.length}, Total: ${currencyFormatter(total)}`,
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
    if (!shipping) {
      throw ErrorFactory.InvalidRequest(
        "Debe proporcionar información de envío válida",
      );
    }

    const isCustomShipping =
      shipping?.provider === "CUSTOM" ||
      shipping?.carrierName?.includes("Medellín") ||
      shipping?.carrierName?.includes("WhatsApp") ||
      envioClickIdRate === 0;

    const rateId = envioClickIdRate || shipping?.idRate;
    if (!isCustomShipping && !rateId) {
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
        throw ErrorFactory.Unauthenticated();
      } else if (userId !== userLogged) {
        throw ErrorFactory.Unauthorized();
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

    // ⭐ Unified System: Fetch Existing Quote Early (if applicable)
    // We need to fetch this BEFORE price calculation to ensure we use valid quoted prices
    let existingQuote: any = null;
    let quotedPriceMap = new Map<string, number>();

    if (customOrderToken) {
      existingQuote = await prismadb.order.findUnique({
        where: { token: customOrderToken, storeId: params.storeId },
        include: { orderItems: true },
      });

      if (!existingQuote) {
        throw ErrorFactory.NotFound("La cotización no existe o ha expirado");
      }

      if (
        existingQuote.status !== OrderStatus.QUOTATION &&
        existingQuote.status !== OrderStatus.DRAFT &&
        existingQuote.status !== OrderStatus.PENDING
      ) {
        throw ErrorFactory.Conflict(
          "Esta cotización ya ha sido pagada o cancelada",
        );
      }

      // Build map of frozen prices from the quotation
      // Key: productId || productName (fallback), Value: Unit Price
      // We rely on productId match primarily.
      existingQuote.orderItems.forEach((item: any) => {
        if (item.productId) {
          quotedPriceMap.set(item.productId, Number(item.price));
        }
      });
    }

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
      provider: isCustomShipping ? "CUSTOM" : ShippingProvider.ENVIOCLICK,
      totalCost: shipping.cost ?? 0,
      carrier:
        shipping.carrierName || shipping.courier || "Acordar por WhatsApp",
      product: shipping.productName || "Envío",
      idRate: shipping.idRate || envioClickIdRate || 0,
      idCarrier: shipping.carrierId || null,
      idProduct: shipping.productId || null,
      flete: shipping.flete || shipping.cost || 0,
      minimumInsurance: shipping.minimumInsurance || 0,
      deliveryDays: shipping.deliveryDays || 0,
      isCOD: shipping.isCOD || false,
    };

    let selectedQuote: any = fallbackQuote; // Default to provided shipping data (normalized)

    // If we have active caches, try to validate (only for ENVIOCLICK rates)
    if (!isCustomShipping && shippingCaches && shippingCaches.length > 0) {
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
    } else if (!isCustomShipping) {
      // No active caches, use provided shipping data
      console.warn(
        `⚠️ No active shipping caches found for daneCode ${daneCode}, store ${params.storeId}. ` +
          `Using provided shipping data.`,
      );
    }

    // Ensure selectedQuote has required fields
    if (selectedQuote.totalCost === undefined || !selectedQuote.carrier) {
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

    // ------------------------------------------------------------------
    // 2. Validate Products & Stock (Standard Flow)
    // ------------------------------------------------------------------
    let products: Prisma.ProductGetPayload<{
      include: { images: true; category: true; productGroup: true };
    }>[] = [];
    if (existingQuote) {
      // If quoting, we skip standard validation/stock check because quote *reserves* or fixed price?
      // Actually, quotes usually don't reserve stock until Checkout.
      // So we MUST re-validate stock here for the quote items.
      const productIds = existingQuote.orderItems.map((i: any) => i.productId);
      const uniqueProductIds = Array.from(new Set(productIds)); // invalid argument? No, Set takes iterable.

      // Fetch products to check current stock
      products = await prismadb.product.findMany({
        where: { id: { in: productIds as string[] } },
        include: {
          images: true, // Required for UI
          category: true, // Required for discounts
          productGroup: true, // Required for discounts
        },
      });
    } else {
      // Fetch products from request items
      const productIds = typedOrderItems.map((item) => item.productId);
      products = await prismadb.product.findMany({
        where: { id: { in: productIds } },
        include: {
          images: true,
          category: true,
          productGroup: true,
        },
      });
    }

    // AGGREGATE QUANTITIES FOR VALIDATION
    // We must sum up quantities for duplicate product IDs to assert total required stock
    const neededQuantities: Record<string, number> = {};
    typedOrderItems.forEach((item) => {
      neededQuantities[item.productId] =
        (neededQuantities[item.productId] || 0) + item.quantity;
    });

    const outOfStockItems: {
      productId: string;
      productName: string;
      available: number;
      requested: number;
    }[] = [];

    products.forEach((product) => {
      const requiredQuantity = neededQuantities[product.id];

      if (!product || product.isArchived) {
        throw ErrorFactory.InvalidRequest(
          `El producto "${product?.name || "Desconocido"}" no está disponible`,
        );
      }

      if (product.stock < requiredQuantity) {
        outOfStockItems.push({
          productId: product.id,
          productName: product.name,
          available: product.stock,
          requested: requiredQuantity,
        });
      }
    });

    if (outOfStockItems.length > 0) {
      throw ErrorFactory.MultipleInsufficientStock(outOfStockItems);
    }

    // Batch process products for validation and pricing
    // The previous `products` variable is now correctly populated and validated for stock.
    // We can reuse it or re-fetch if `processOrderItemsInBatches` does more than just fetch.
    // Assuming `processOrderItemsInBatches` is for fetching and initial processing,
    // and the stock validation above is the new, more robust check.
    // If `processOrderItemsInBatches` also does stock validation, this might be redundant.
    // For now, I'll assume it's for fetching and initial data structuring.
    // If the `products` variable from the new block is sufficient, the old `processOrderItemsInBatches` call might be removed or adjusted.
    // Given the instruction, I'll keep the `products` variable from the new block and adjust the subsequent code to use it.

    // Create product map for O(1) lookups
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Calculate discounted prices
    const discountedPricesMap = await getProductsPrices(
      products, // Use the validated products
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

      // Stock validation is now done upfront for aggregated quantities.
      // This check here is redundant if `neededQuantities` was used for the `products.forEach` loop.
      // However, `orderItems` might contain duplicates, so `quantity` here is for a single entry.
      // The aggregated check is more robust. I'll remove the individual stock check here.
      // if (product.stock < quantity) {
      //   errors.push(
      //     `El producto ${product.name} no tiene suficiente stock disponible. Stock disponible: ${product.stock}, cantidad solicitada: ${quantity}`,
      //   );
      //   continue;
      // }

      const quotedPrice = quotedPriceMap.get(productId);
      // Priority: Quoted Price > Discounted Price > Base Price
      const finalPrice =
        quotedPrice !== undefined
          ? quotedPrice
          : discountedPricesMap.get(productId)?.price || product.price;

      orderItemsData.push({
        product: { connect: { id: productId } },
        quantity,
        // Snapshot fields for historical accuracy
        name: product.name,
        price: finalPrice,
        sku: product.sku || "N/A",
        imageUrl:
          product.images.find((img: any) => img.isMain)?.url ||
          product.images[0]?.url ||
          "",
        isCustom: false,
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
        const quotedPrice = quotedPriceMap.get(productId);

        // Priority: Quoted Price > Discounted Price > Base Price
        const finalPrice =
          quotedPrice !== undefined
            ? quotedPrice
            : pricing
              ? pricing.price
              : product.price;

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

    // Use tolerance of 1 COP (appropriate for Colombian Peso which has no decimal places)
    const PRICE_TOLERANCE = 1;
    const totalDiff = Math.abs(totals.total - total);
    const subtotalDiff = Math.abs(totals.subtotal - subtotal);

    if (totalDiff > PRICE_TOLERANCE || subtotalDiff > PRICE_TOLERANCE) {
      console.error("[ORDER_CHECKOUT] Price mismatch detected:", {
        sent: { subtotal, total, shippingCost: selectedQuote.totalCost },
        calculated: totals,
        differences: { subtotalDiff, totalDiff },
        itemsWithPrices: itemsWithPrices.map((item: any, idx: number) => ({
          productId: orderItems[idx].productId,
          quantity: item.quantity,
          price: item.product.price,
        })),
        couponCode: coupon?.code ?? null,
      });

      throw ErrorFactory.InvalidRequest(
        "Los montos calculados no coinciden con los enviados",
      );
    }

    const orderNumber = generateOrderNumber();

    let order: CheckoutOrder;

    if (customOrderToken) {
      // 🔄 Unified System: CONVERT Quotation to Order
      // existingQuote is already fetched and validated above

      // Update the existing order (Quotation)
      order = (await prismadb.order.update({
        where: { id: existingQuote.id },
        data: {
          status: OrderStatus.PENDING, // Ready for payment
          updatedAt: new Date(), // Mark as active
          // Update Customer Info (User might have changed it in Checkout)
          fullName,
          phone,
          email,
          documentId: documentId || null,
          address,
          address2: address2 || null,
          addressReference: addressReference || null,
          city,
          department,
          daneCode,
          neighborhood: neighborhood || null,
          company: company || null,
          // Update Financials
          subtotal: totals.subtotal,
          total: totals.total,
          couponDiscount: totals.couponDiscount,
          couponId: coupon?.id,
          ...(normalizedAnalyticsClientId
            ? { analyticsClientId: normalizedAnalyticsClientId }
            : {}),
          // Sync Items: Re-create to ensure fidelity with checkout request
          orderItems: {
            deleteMany: {}, // Clear old quote items (safe refresh)
            create: orderItemsData,
          },
          // Update Shipping
          shipping: {
            upsert: {
              create: buildShippingPayload(params.storeId, selectedQuote),
              update: buildShippingPayload(params.storeId, selectedQuote),
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
      })) as unknown as CheckoutOrder;

      console.log(
        `♻️ Converted Quotation ${existingQuote.orderNumber} to Pending Order ${order.orderNumber}`,
      );
    } else {
      // 🆕 Create NEW Order (Standard Flow)
      order = (await prismadb.order.create({
        data: {
          storeId: params.storeId,
          userId: authenticatedUserId,
          guestId: !authenticatedUserId ? guestId : null,
          orderNumber: orderNumber,
          status: OrderStatus.PENDING,
          fullName,
          phone,
          email,
          documentId: documentId || null,
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
          ...(normalizedAnalyticsClientId
            ? { analyticsClientId: normalizedAnalyticsClientId }
            : {}),
          orderItems: { create: orderItemsData },
          shipping: {
            create: buildShippingPayload(params.storeId, selectedQuote),
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
      })) as unknown as CheckoutOrder;
    }

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
      if (payment.method === PaymentMethod.Bold) {
        const boldData = generateBoldCheckoutData(order);
        console.log(
          `✅ Bold pre-signed payload generated for order ${order.orderNumber}`,
        );
        return NextResponse.json({ order, boldData }, { headers: corsHeaders });
      }

      if (
        payment.method === PaymentMethod.COD ||
        payment.method === PaymentMethod.BankTransfer
      ) {
        console.log(
          `✅ ${payment.method} payment selected - returning order details directly for client handling.`,
        );
        return NextResponse.json(order, { headers: corsHeaders });
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
