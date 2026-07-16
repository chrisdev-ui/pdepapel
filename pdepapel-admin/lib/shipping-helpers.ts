import {
  ENVIOCLICK_DEFAULTS,
  getPickupDate,
  prepareShipmentDescription,
  splitFullName,
  STORE_SHIPPING_INFO,
  truncateField,
} from "@/constants/shipping";
import prismadb from "@/lib/prismadb";
import { ErrorFactory } from "./api-errors";
import { envioClickClient } from "./envioclick";
import { ShippingStatus } from "@prisma/client";
import { getColombiaDate } from "./date-utils";
import { parsePhoneNumberFromString } from "libphonenumber-js/mobile";
import {
  calculatePackageDimensions,
  BoxConfiguration,
} from "./package-calculator";

/**
 * Extracts national phone number (10 digits) from E.164 format for EnvioClick API
 * Uses libphonenumber-js (server-safe) for parsing
 */
export function phoneToNational(phone: string): string {
  try {
    const parsed = parsePhoneNumberFromString(phone);
    if (parsed?.nationalNumber) {
      return parsed.nationalNumber;
    }
  } catch {
    // Fallback if parsing fails
  }
  // Fallback: extract digits manually
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("57") && digits.length === 12) {
    return digits.substring(2);
  }
  return digits.substring(0, 10);
}

export async function createGuideForOrder(
  orderId: string,
  storeId: string,
  orderData?: any, // Optional: pass order data to avoid re-querying
  prismaClient?: any, // Optional: pass transaction client for use within transactions
) {
  // Use provided client (transaction) or default prismadb
  const db = prismaClient || prismadb;

  // 1. Obtener orden completa (o usar datos proporcionados)
  const order =
    orderData ||
    (await db.order.findUnique({
      where: { id: orderId, storeId },
      include: {
        shipping: true,
        orderItems: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                size: { select: { value: true, name: true } },
              },
            },
          },
        },
      },
    }));

  if (!order || !order.shipping) {
    throw ErrorFactory.NotFound("Order or shipping not found");
  }

  if (order.shipping.envioClickIdOrder) {
    throw ErrorFactory.InvalidRequest("Guide already exists");
  }

  if (!order.shipping.envioClickIdRate) {
    throw ErrorFactory.InvalidRequest(
      "No shipping rate associated with the order shipping",
    );
  }

  // 2. Preparar datos
  const customerName = splitFullName(order.fullName);
  const storeName = splitFullName(
    `${STORE_SHIPPING_INFO.firstName} ${STORE_SHIPPING_INFO.lastName}`,
  );

  // 3. Get the EXACT quote data that was used for this specific rate
  const shippingQuote = await db.shippingQuote.findFirst({
    where: {
      storeId,
      destDaneCode: order.daneCode!,
      quotesData: {
        path: "$[*].idRate",
        array_contains: order.shipping.envioClickIdRate,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  let packageDimensions: {
    weight: number;
    height: number;
    width: number;
    length: number;
  };
  let declaredValue: number;

  if (shippingQuote && shippingQuote.expiresAt >= new Date()) {
    packageDimensions = {
      weight: shippingQuote.weight,
      height: shippingQuote.height,
      width: shippingQuote.width,
      length: shippingQuote.length,
    };
    declaredValue = shippingQuote.declaredValue;
  } else {
    // FALLBACK: Calculate dynamically if quote is missing or expired
    console.log(
      `[SHIPPING_HELPERS] Quote not found or expired for order ${order.orderNumber}. Calculating dynamically.`,
    );

    // Fetch boxes configurations
    const dbBoxes = await db.box.findMany({
      where: { storeId },
    });

    const boxConfigurations: Record<string, BoxConfiguration> = {};
    const types = ["XS", "S", "M", "L", "XL"];

    types.forEach((type) => {
      const defaultBox = dbBoxes.find(
        (b: any) => b.type === type && b.isDefault,
      );
      const anyBox = dbBoxes.find((b: any) => b.type === type);
      const boxToUse = defaultBox || anyBox;

      if (boxToUse) {
        boxConfigurations[type] = {
          width: boxToUse.width,
          height: boxToUse.height,
          length: boxToUse.length,
          type: "box",
          size: boxToUse.type as any,
          id: boxToUse.id,
          name: boxToUse.name,
        };
      }
    });

    const validItems = order.orderItems.filter(
      (oi: any) => oi.productId && oi.product,
    );

    const items = validItems.map((oi: any) => ({
      productId: oi.productId!,
      quantity: oi.quantity,
    }));
    const products = validItems.map((oi: any) => oi.product!);

    let calculatedDims;
    const savedBoxId = order.shipping?.boxId;
    if (savedBoxId) {
      const manualBox = dbBoxes.find((b: any) => b.id === savedBoxId);
      if (manualBox) {
        const tempDims = calculatePackageDimensions(items, products); // Get weight
        calculatedDims = {
          weight: tempDims.weight,
          width: manualBox.width,
          height: manualBox.height,
          length: manualBox.length,
        };
      } else {
        calculatedDims = calculatePackageDimensions(
          items,
          products,
          boxConfigurations,
        );
      }
    } else {
      calculatedDims = calculatePackageDimensions(
        items,
        products,
        boxConfigurations,
      );
    }

    packageDimensions = {
      weight: calculatedDims.weight,
      height: calculatedDims.height,
      width: calculatedDims.width,
      length: calculatedDims.length,
    };
    declaredValue = order.total;
  }

  if (
    !packageDimensions.weight ||
    !packageDimensions.height ||
    !packageDimensions.width ||
    !packageDimensions.length
  ) {
    throw ErrorFactory.InvalidRequest(
      "La cotización no tiene las dimensiones del paquete. Por favor, solicita una nueva cotización.",
    );
  }

  if (packageDimensions.weight < 1.0 || packageDimensions.weight > 1000) {
    throw ErrorFactory.InvalidRequest(
      `El peso del paquete (${packageDimensions.weight}kg) no cumple con los requisitos de EnvioClick (1-1000kg).`,
    );
  }

  if (
    packageDimensions.height < 1 ||
    packageDimensions.height > 300 ||
    packageDimensions.width < 1 ||
    packageDimensions.width > 300 ||
    packageDimensions.length < 1 ||
    packageDimensions.length > 300
  ) {
    throw ErrorFactory.InvalidRequest(
      `Las dimensiones del paquete no cumplen con los requisitos de EnvioClick (1-300cm).`,
    );
  }

  if (order.shipping.isCOD) {
    if (order.total < 0 || order.total > 3000000) {
      throw ErrorFactory.InvalidRequest(
        `El valor a recaudar contra entrega ($${order.total}) debe estar entre $0 y $3.000.000 COP.`,
      );
    }
  }

  // 4. Crear guía (with error handling for expired rates)
  let result;
  try {
    const shipmentParams = {
      idRate: order.shipping.envioClickIdRate,
      myShipmentReference: order.orderNumber,
      requestPickup: ENVIOCLICK_DEFAULTS.requestPickup,
      pickupDate: getPickupDate(),
      insurance: ENVIOCLICK_DEFAULTS.insurance,
      description: prepareShipmentDescription(
        ENVIOCLICK_DEFAULTS.defaultDescription,
      ),
      contentValue: declaredValue,
      packages: [
        {
          weight: packageDimensions.weight,
          height: packageDimensions.height,
          width: packageDimensions.width,
          length: packageDimensions.length,
        },
      ],
      origin: {
        company: truncateField(STORE_SHIPPING_INFO.company, "company"),
        firstName: storeName.firstName,
        lastName: storeName.lastName,
        email: truncateField(STORE_SHIPPING_INFO.email, "email"),
        phone: phoneToNational(STORE_SHIPPING_INFO.phone),
        address: truncateField(STORE_SHIPPING_INFO.address, "address"),
        suburb: truncateField(STORE_SHIPPING_INFO.suburb || "NA", "suburb"),
        crossStreet: truncateField(
          STORE_SHIPPING_INFO.crossStreet || "NA",
          "crossStreet",
        ),
        reference: truncateField(
          STORE_SHIPPING_INFO.reference || "NA",
          "reference",
        ),
        daneCode: STORE_SHIPPING_INFO.daneCode,
      },
      destination: {
        company: truncateField(order.company || "NA", "company"),
        firstName: customerName.firstName,
        lastName: customerName.lastName,
        email: truncateField(order.email || "", "email"),
        phone: phoneToNational(order.phone),
        address: truncateField(order.address, "address"),
        suburb: truncateField(order.neighborhood || "NA", "suburb"),
        crossStreet: truncateField(order.address2 || "NA", "crossStreet"),
        reference: truncateField(order.addressReference || "NA", "reference"),
        daneCode: order.daneCode!,
      },
      ...(order.shipping.isCOD && {
        codValue: order.total,
        codPaymentMethod: order.shipping.codPaymentMethod || ENVIOCLICK_DEFAULTS.codPaymentMethod,
        includeGuideCost: order.shipping.includeGuideCost || ENVIOCLICK_DEFAULTS.includeGuideCost,
      }),
    };

    console.log(
      "[ORDER_SHIPPING_CREATE_GUIDE] Attempting to create guide with params:",
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        idRate: shipmentParams.idRate,
        origin: shipmentParams.origin,
        destination: shipmentParams.destination,
        packages: shipmentParams.packages,
      },
    );

    result = await envioClickClient.createShipment(shipmentParams);
  } catch (error: any) {
    // Check if error is due to invalid/expired idRate
    const errorMessage =
      error?.response?.data?.status_messages?.[0]?.request ||
      error?.message ||
      "";

    if (
      errorMessage.includes("idRate") ||
      errorMessage.includes("rate") ||
      errorMessage.includes("cotización") ||
      errorMessage.includes("expirado") ||
      errorMessage.includes("inválido") ||
      error?.response?.status === 400
    ) {
      throw ErrorFactory.InvalidRequest(
        `La cotización de envío ha expirado o es inválida. Por favor, solicita una nueva cotización para esta orden. Error: ${errorMessage}`,
      );
    }

    // Re-throw other errors
    throw error;
  }

  // 5. Actualizar shipping
  await db.shipping.update({
    where: { id: order.shipping.id },
    data: {
      envioClickIdOrder: result.data.idOrder,
      trackingCode: result.data.tracker,
      guideUrl: result.data.url,
      guidePdfBase64: result.data.guide,
      requestPickup: result.data.requestPickup,
      status: ShippingStatus.Shipped,
      externalOrderId: result.data.external_order_id,
      originData: JSON.stringify(result.data.origin),
      destinationData: JSON.stringify(result.data.destination),
      pickupDate: getColombiaDate(new Date(getPickupDate())),
    },
  });

  return result;
}
