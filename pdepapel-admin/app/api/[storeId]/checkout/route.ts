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
import { AppError, ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createCorsHeaders } from "@/lib/cors";
import { withIdempotency } from "@/lib/idempotency";
import { normalizeGoogleAnalyticsClientId } from "@/lib/google-analytics";
import { generateBoldCheckoutData } from "@/lib/bold";
import {
  activeCouponWhere,
  assertCouponHasUses,
} from "@/lib/coupon-availability";
import { priceLines } from "@/lib/product-pricing";
import { getActivePresalesByProduct, getPresaleCapacity } from "@/lib/presale";
import prismadb from "@/lib/prismadb";
import { requoteCartShipping, type RequotedRate } from "@/lib/shipping-helpers";
import {
  SHIPPING_RATE_INCIDENT,
  countIncident,
} from "@/lib/incident-counter";
import {
  readCachedRates,
  reconcileShippingRate,
} from "@/lib/shipping-rate-reconcile";
import { verifyEarlyAccessToken } from "@/lib/early-access";
import { formatAvailableAt, isComingSoon } from "@/lib/product-availability";
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
import {
  calculateOrderTotals,
  getEffectiveShippingCost,
} from "@/lib/order-totals";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { sendOrderEmail } from "@/lib/email";
import { BATCH_SIZE } from "@/constants";
import { ENVIOCLICK_DEFAULTS } from "@/constants/shipping";
import {
  assertWelcomeBenefitEligibility,
  reserveWelcomeBenefit,
} from "@/lib/customer-benefits";
import { saveCustomerAddressFromCheckout } from "@/lib/customer-addresses";
import { normalizePhone } from "@/lib/phone";

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

/** A retried checkout (timeout, double tap) replays the order it already created. */
/**
 * Qué hacer con la tarifa después de re-cotizar.
 *
 * Antes se buscaba por `idRate` y, si no aparecía, se caía la compra entera.
 * El `idRate` cambia cuando cambian las medidas del paquete, así que bastaba
 * que la re-cotización calculara un peso ligeramente distinto al de la
 * cotización original para dejar a la clienta sin salida.
 *
 * Ahora manda el servicio: misma transportadora y mismo producto. Si el precio
 * es el de antes (o casi), se sigue sin interrumpir. Si cambió de verdad, se
 * devuelve 409 con la tarifa nueva para que la tienda la enseñe y la clienta
 * decida —una subida de precio no se cuela sin que la vea—.
 */
function resolveRequotedRate(input: {
  rateId: number;
  freshRates: RequotedRate[];
  previousCost: number | null;
  previousCarrier?: string | null;
  previousProduct?: string | null;
  storeId: string;
  daneCode: string;
}): RequotedRate {
  const result = reconcileShippingRate(input);

  if (result.outcome === "same") {
    console.log(
      `✅ Re-cotizado ${input.rateId} → ${result.rate.idRate}: ${result.rate.carrier}, ${currencyFormatter(result.rate.totalCost)}`,
    );
    return result.rate;
  }

  // No se espera: si empieza a pasar seguido, que se note en el log.
  void countIncident({
    ...SHIPPING_RATE_INCIDENT,
    context: { daneCode: input.daneCode, outcome: result.outcome },
  });

  if (result.outcome === "price_changed") {
    console.warn("[ORDER_CHECKOUT] El envío cambió de precio al re-cotizar", {
      storeId: input.storeId,
      daneCode: input.daneCode,
      carrier: result.rate.carrier,
      antes: result.previousCost,
      ahora: result.rate.totalCost,
    });
    throw new AppError(
      `El envío con ${result.rate.carrier} cambió a ${currencyFormatter(result.rate.totalCost)}. Confírmalo para continuar.`,
      409,
      {
        code: "SHIPPING_RATE_CHANGED",
        rate: result.rate,
        previousCost: result.previousCost,
      },
    );
  }

  console.error("[ORDER_CHECKOUT] La transportadora elegida ya no cubre el destino", {
    storeId: input.storeId,
    daneCode: input.daneCode,
    rateId: input.rateId,
    alternativas: result.alternatives.length,
  });
  throw new AppError(
    "Esa transportadora ya no tiene cobertura para tu dirección. Elige otra opción de envío.",
    409,
    { code: "SHIPPING_RATE_UNAVAILABLE", alternatives: result.alternatives },
  );
}

export async function POST(
  req: Request,
  context: { params: { storeId: string } },
) {
  return withIdempotency(
    req,
    context.params.storeId,
    () => createCheckout(req, context),
    getCorsHeaders(req),
  );
}

async function createCheckout(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const corsHeaders = getCorsHeaders(req);
  const { userId: userLogged } = await auth();
  // Core 3: auth() no longer carries the user; the profile is a separate call.
  const user = userLogged ? await currentUser() : null;
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const isStoreOwner = userLogged
      ? await checkIfStoreOwner(userLogged, params.storeId)
      : false;

    // Un JSON roto respondía 500.
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw ErrorFactory.InvalidRequest(
        "El cuerpo de la solicitud no es válido",
      );
    }

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
      earlyAccessToken,
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
      analyticsClientId,
      analyticsConsent,
      saveAddress,
      savedAddressId,
      addressLabel,
    } = body as Record<string, any>;
    const normalizedPhone = normalizePhone(phone);
    const normalizedAnalyticsClientId = isStoreOwner
      ? null
      : normalizeGoogleAnalyticsClientId(analyticsClientId);
    // Misma higiene que el client id: el tráfico interno no se mide. Del
    // cliente sólo se guarda si aceptó o no, nada más.
    const normalizedAnalyticsConsent =
      isStoreOwner || typeof analyticsConsent !== "boolean"
        ? null
        : analyticsConsent;

    // Fix implicit any for orderItems
    const typedOrderItems = (orderItems || []) as {
      productId: string;
      quantity: number;
    }[];

    // El log de abajo lee `payment.method`: sin esto, un cuerpo sin `payment`
    // salía como 500.
    if (!payment || typeof payment !== "object" || !payment.method) {
      throw ErrorFactory.InvalidRequest("Falta el método de pago");
    }
    if (!Object.values(PaymentMethod).includes(payment.method)) {
      throw ErrorFactory.InvalidRequest(
        `El método de pago «${payment.method}» no existe`,
      );
    }

    const invalidItem = typedOrderItems.find(
      (item) =>
        !item ||
        typeof item.productId !== "string" ||
        !item.productId ||
        !Number.isInteger(item.quantity ?? 1) ||
        (item.quantity ?? 1) < 1,
    );
    if (invalidItem) {
      throw ErrorFactory.InvalidRequest(
        "Cada producto del pedido necesita un identificador y una cantidad entera positiva",
      );
    }

    console.log(
      `📥 Checkout request received - Store: ${params.storeId}, Payment: ${payment.method}, Items: ${typedOrderItems.length}, Total: ${currencyFormatter(total)}`,
    );

    if (!fullName)
      throw ErrorFactory.InvalidRequest("El nombre completo es obligatorio");
    if (!normalizedPhone)
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
          await (await clerkClient()).users.getUser(userId);
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

    const shouldSaveCustomerAddress = saveAddress === true;
    const customerAddressUserId =
      userLogged && authenticatedUserId === userLogged && !isStoreOwner
        ? userLogged
        : null;
    const normalizedSavedAddressId =
      typeof savedAddressId === "string" ? savedAddressId.trim() || null : null;
    const normalizedAddressLabel =
      typeof addressLabel === "string" ? addressLabel.trim() : null;

    if (shouldSaveCustomerAddress && !customerAddressUserId) {
      throw ErrorFactory.Unauthenticated();
    }

    if (
      shouldSaveCustomerAddress &&
      ((savedAddressId !== undefined &&
        (typeof savedAddressId !== "string" || savedAddressId.length > 191)) ||
        (normalizedAddressLabel !== null && normalizedAddressLabel.length > 60))
    ) {
      throw ErrorFactory.InvalidRequest("La dirección guardada no es válida");
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
    // Try to validate against cache (security check)
    const shippingCaches = await prismadb.shippingQuote.findMany({
      where: {
        storeId: params.storeId,
        destDaneCode: daneCode,
        expiresAt: { gte: new Date() },
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
        const quotes = readCachedRates(cache.quotesData);
        const found = quotes.find((q) => q.idRate === rateId);

        if (found) {
          selectedQuote = found;
          break;
        }
      }

      // La tarifa no está en la caché (cotización vencida, o alguien mandando
      // un número inventado). Se cotiza contra la transportadora en vez de
      // creerle al cliente: el costo de envío no lo pone quien compra.
      if (selectedQuote === fallbackQuote) {
        console.warn(
          `⚠️ Rate ID ${rateId} not found in active caches for store ${params.storeId}. Re-cotizando.`,
        );
        let freshRates: Awaited<ReturnType<typeof requoteCartShipping>>;
        try {
          freshRates = await requoteCartShipping({
            storeId: params.storeId,
            items: typedOrderItems,
            destination: { daneCode, address },
            contentValue: Number(subtotal) || 0,
          });
        } catch (quoteError) {
          console.error("[ORDER_CHECKOUT] Re-cotización fallida:", quoteError);
          throw ErrorFactory.InvalidRequest(
            "No pudimos confirmar el costo de envío en este momento. Solicita una nueva cotización e inténtalo de nuevo.",
          );
        }

        selectedQuote = resolveRequotedRate({
          rateId,
          freshRates,
          previousCost: shipping.cost ?? null,
          previousCarrier: shipping.carrierName || shipping.courier,
          previousProduct: shipping.productName,
          storeId: params.storeId,
          daneCode,
        });
      } else {
        console.log(
          `✅ Using cached quote for rate ID ${rateId}, carrier: ${selectedQuote.carrier}, cost: ${currencyFormatter(selectedQuote.totalCost)}`,
        );
      }
    } else if (!isCustomShipping) {
      // Sin ninguna caché para ese destino: mismo criterio, se cotiza.
      console.warn(
        `⚠️ No active shipping caches for daneCode ${daneCode}, store ${params.storeId}. Re-cotizando.`,
      );
      let freshRates: Awaited<ReturnType<typeof requoteCartShipping>>;
      try {
        freshRates = await requoteCartShipping({
          storeId: params.storeId,
          items: typedOrderItems,
          destination: { daneCode, address },
          contentValue: Number(subtotal) || 0,
        });
      } catch (quoteError) {
        console.error("[ORDER_CHECKOUT] Re-cotización fallida:", quoteError);
        throw ErrorFactory.InvalidRequest(
          "No pudimos confirmar el costo de envío en este momento. Solicita una nueva cotización e inténtalo de nuevo.",
        );
      }

      selectedQuote = resolveRequotedRate({
        rateId,
        freshRates,
        previousCost: shipping.cost ?? null,
        previousCarrier: shipping.carrierName || shipping.courier,
        previousProduct: shipping.productName,
        storeId: params.storeId,
        daneCode,
      });
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
    const productIds = typedOrderItems.map((item) => item.productId);
    const products = await prismadb.product.findMany({
      where: { id: { in: productIds } },
      include: {
        images: true,
        category: true,
        productGroup: true,
      },
    });

    // AGGREGATE QUANTITIES FOR VALIDATION
    // We must sum up quantities for duplicate product IDs to assert total required stock
    const neededQuantities: Record<string, number> = {};
    typedOrderItems.forEach((item) => {
      neededQuantities[item.productId] =
        (neededQuantities[item.productId] || 0) + item.quantity;
    });

    // Preventas activas del carrito, de una sola consulta. Los pedidos
    // recientes sin pagar apartan cupo, menos los de esta misma clienta.
    const activePresales = await getActivePresalesByProduct(
      params.storeId,
      products.map((product) => product.id),
      { excludeOrdersOf: { userId: authenticatedUserId, guestId } },
    );

    // Regla 1: la preventa se paga al reservar. Contra entrega no cobra hasta
    // que el paquete llega, y aquí el paquete llega en semanas: el pedido se
    // quedaría sin pagar, sin ocupar cupo y sin poder liberarse nunca.
    if (activePresales.size > 0 && payment.method === PaymentMethod.COD) {
      throw ErrorFactory.InvalidRequest(
        "Las preventas se pagan al reservar: elige pago en línea o transferencia bancaria.",
      );
    }

    const outOfStockItems: {
      productId: string;
      productName: string;
      available: number;
      requested: number;
    }[] = [];

    const hasEarlyAccess = Boolean(
      verifyEarlyAccessToken(
        params.storeId,
        typeof earlyAccessToken === "string" ? earlyAccessToken : null,
      ),
    );

    products.forEach((product) => {
      const requiredQuantity = neededQuantities[product.id];

      if (!product || product.isArchived) {
        throw ErrorFactory.InvalidRequest(
          `El producto "${product?.name || "Desconocido"}" no está disponible`,
        );
      }

      if (
        isComingSoon(product) &&
        !hasEarlyAccess &&
        !activePresales.has(product.id)
      ) {
        throw ErrorFactory.InvalidRequest(
          `"${product.name}" llega el ${formatAvailableAt(product.availableAt!)}; aún no se puede comprar`,
        );
      }

      // Preventa: se vende sin stock, contra el tope de la campaña. Aquí solo
      // se decide si el carrito puede seguir; el cupo se apunta cuando entra
      // la plata, en el webhook de pago, igual que el stock normal
      // (`settlePresaleLinesOnPayment`); `remaining` descuenta además lo
      // apartado por pedidos recientes sin pagar.
      const presale = activePresales.get(product.id);
      if (presale) {
        const remaining = getPresaleCapacity(presale).remaining;
        if (remaining < requiredQuantity) {
          throw ErrorFactory.InvalidRequest(
            remaining === 0
              ? `"${product.name}" ya no tiene reservas disponibles para la preventa.`
              : `De "${product.name}" solo quedan ${remaining} reservas de preventa y pediste ${requiredQuantity}.`,
          );
        }
        return;
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

    // El precio que se cobra sale de UNA sola cuenta en el servidor: precio de
    // lista, mejor oferta vigente y escalera por cantidad, y gana el más bajo
    // —nunca los dos encadenados—. La tienda hace exactamente la misma cuenta
    // con `lib/price-tiers.ts`, que es el mismo archivo en las dos apps.
    const pricedLines = await priceLines(
      params.storeId,
      orderItems.map(
        ({ productId, quantity = 1 }: { productId: string; quantity?: number }) => ({
          productId,
          quantity,
        }),
      ),
      products, // Use the validated products
    );

    const errors: string[] = [];
    const orderItemsData: Prisma.OrderItemCreateWithoutOrderInput[] = [];

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

      // El precio ya resuelto arriba: lista, oferta o peldaño, el que salga más bajo.
      const finalPrice = pricedLines.get(productId)?.unitPrice ?? product.price;

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
        // Marca de preventa: esta línea NO descuenta inventario hoy, y mientras
        // no se libere frena el despacho del pedido COMPLETO.
        ...(activePresales.has(productId)
          ? { isPreorder: true, presaleId: activePresales.get(productId)!.id }
          : {}),
      });
    }

    if (errors.length > 0) throw ErrorFactory.InvalidRequest(errors.join(", "));

    let coupon: Coupon | null = null;
    if (couponCode) {
      coupon = await prismadb.coupon.findFirst({
        where: activeCouponWhere(prismadb, params.storeId, couponCode),
      });

      if (!coupon) {
        throw ErrorFactory.NotFound(
          "Este cupón no es válido: puede estar inactivo, no haber iniciado aún o ya haber expirado",
        );
      }

      // Aquí solo se responde pronto con un mensaje claro; la comprobación que
      // manda corre dentro de la transacción que crea el pedido, porque dos
      // compras simultáneas pasan las dos por esta.
      await assertCouponHasUses(prismadb, coupon);

      if (subtotal < Number(coupon.minOrderValue ?? 0)) {
        throw ErrorFactory.Conflict(
          `El pedido debe ser mayor a ${currencyFormatter(coupon.minOrderValue ?? 0)} para usar este cupón`,
        );
      }

      await assertWelcomeBenefitEligibility({
        coupon,
        storeId: params.storeId,
        userId: authenticatedUserId,
        checkoutEmail: email,
        database: prismadb,
      });
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

        const finalPrice = pricedLines.get(productId)?.unitPrice ?? product.price;

        return {
          product: { price: finalPrice },
          quantity,
        };
      },
    );

    // Free shipping promise: the storefront applies the same rule on the
    // product subtotal, so both sides agree on the total being validated.
    // Fail safe: if the column has not been migrated yet, charge shipping
    // normally instead of blocking the order.
    const storeSettings = await prismadb.store
      .findUnique({
        where: { id: params.storeId },
        select: { freeShippingThreshold: true },
      })
      .catch((error: unknown) => {
        console.error(
          "[ORDER_CHECKOUT] Could not read free-shipping threshold:",
          error,
        );
        return null;
      });
    const productSubtotal = itemsWithPrices.reduce(
      (sum: number, item: { product: { price: number }; quantity: number }) =>
        sum + Number(item.product.price) * item.quantity,
      0,
    );
    const shippingRule = getEffectiveShippingCost(
      productSubtotal,
      Number(selectedQuote.totalCost) || 0,
      storeSettings?.freeShippingThreshold,
    );
    if (shippingRule.freeShipping) {
      console.log(
        `🎁 Free shipping applied: subtotal ${currencyFormatter(productSubtotal)} reaches ${currencyFormatter(storeSettings?.freeShippingThreshold ?? 0)}`,
      );
      selectedQuote = {
        ...selectedQuote,
        totalCost: 0,
        flete: 0,
        freeShipping: true,
      };
    }

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

    const createNewOrder = (
      database: Pick<Prisma.TransactionClient, "order" | "customerAddress">,
    ) =>
      database.order.create({
        data: {
          storeId: params.storeId,
          userId: authenticatedUserId,
          guestId: !authenticatedUserId ? guestId : null,
          orderNumber: orderNumber,
          status: OrderStatus.PENDING,
          fullName,
          phone: normalizedPhone,
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
          ...(normalizedAnalyticsConsent === null
            ? {}
            : { analyticsConsent: normalizedAnalyticsConsent }),
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
      });

    const createStandardOrder = async (
      database: Pick<Prisma.TransactionClient, "order" | "customerAddress">,
    ) => {
      const createdOrder = await createNewOrder(database);

      if (shouldSaveCustomerAddress && customerAddressUserId) {
        await saveCustomerAddressFromCheckout(database, {
          storeId: params.storeId,
          userId: customerAddressUserId,
          savedAddressId: normalizedSavedAddressId,
          label: normalizedAddressLabel,
          fullName,
          phone: normalizedPhone,
          documentId,
          address,
          address2,
          city,
          department,
          daneCode,
          neighborhood,
          addressReference,
          company,
        });
      }

      return createdOrder;
    };

    if (coupon?.isWelcomeBenefit && !authenticatedUserId) {
      throw ErrorFactory.Unauthenticated();
    }

    // Todo el pedido se crea en UNA transacción, también cuando no hay cupón
    // ni dirección que guardar. Es lo que permite que el cupo del cupón se
    // compruebe y se tome sin que dos compras simultáneas se lo repartan.
    order = (await prismadb.$transaction(async (tx) => {
      if (coupon) {
        await assertCouponHasUses(tx, coupon);
      }

      const createdOrder = await createStandardOrder(tx);

      if (coupon?.isWelcomeBenefit) {
        await reserveWelcomeBenefit(tx, {
          couponId: coupon.id,
          storeId: params.storeId,
          userId: authenticatedUserId!,
          orderId: createdOrder.id,
        });
      }

      return createdOrder;
    })) as unknown as CheckoutOrder;

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
