import {
  cleanPhoneNumber,
  ENVIOCLICK_DEFAULTS,
  getPickupDate,
  splitFullName,
  STORE_SHIPPING_INFO,
} from "@/constants/shipping";
import prismadb from "@/lib/prismadb";
import { ErrorFactory } from "./api-errors";
import { envioClickClient } from "./envioclick";
import { ShippingStatus } from "@prisma/client";
import { getColombiaDate } from "./date-utils";

export async function createGuideForOrder(
  orderId: string,
  storeId: string,
  orderData?: any, // Optional: pass order data to avoid re-querying
  prismaClient?: any // Optional: pass transaction client for use within transactions
) {
  // Use provided client (transaction) or default prismadb
  const db = prismaClient || prismadb;

  // 1. Obtener orden completa (o usar datos proporcionados)
  const order = orderData || await db.order.findUnique({
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
  });

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
        path: '$[*].idRate',
        array_contains: order.shipping.envioClickIdRate,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!shippingQuote) {
    throw ErrorFactory.InvalidRequest(
      "La cotización de envío ha expirado o no se encontró. Por favor, elimina la cotización actual y solicita una nueva."
    );
  }

  if (shippingQuote.expiresAt < new Date()) {
    throw ErrorFactory.InvalidRequest(
      "La cotización de envío ha expirado. Por favor, solicita una nueva cotización para esta orden."
    );
  }

  const packageDimensions = {
    weight: shippingQuote.weight,
    height: shippingQuote.height,
    width: shippingQuote.width,
    length: shippingQuote.length,
  };

  if (!packageDimensions.weight || !packageDimensions.height || 
      !packageDimensions.width || !packageDimensions.length) {
    throw ErrorFactory.InvalidRequest(
      "La cotización no tiene las dimensiones del paquete. Por favor, solicita una nueva cotización."
    );
  }

  if (packageDimensions.weight < 1.0 || packageDimensions.weight > 1000) {
    throw ErrorFactory.InvalidRequest(
      `El peso del paquete (${packageDimensions.weight}kg) no cumple con los requisitos de EnvioClick (1-1000kg).`
    );
  }

  if (packageDimensions.height < 1 || packageDimensions.height > 300 ||
      packageDimensions.width < 1 || packageDimensions.width > 300 ||
      packageDimensions.length < 1 || packageDimensions.length > 300) {
    throw ErrorFactory.InvalidRequest(
      `Las dimensiones del paquete no cumplen con los requisitos de EnvioClick (1-300cm).`
    );
  }

  // 4. Crear guía (with error handling for expired rates)
  let result;
  try {
    result = await envioClickClient.createShipment({
    idRate: order.shipping.envioClickIdRate,
    myShipmentReference: order.orderNumber,
    requestPickup: ENVIOCLICK_DEFAULTS.requestPickup,
    pickupDate: getPickupDate(),
    insurance: ENVIOCLICK_DEFAULTS.insurance,
    description: ENVIOCLICK_DEFAULTS.defaultDescription,
    contentValue: shippingQuote.declaredValue,
    packages: [{
      weight: packageDimensions.weight,
      height: packageDimensions.height,
      width: packageDimensions.width,
      length: packageDimensions.length,
    }],
    origin: {
      company: STORE_SHIPPING_INFO.company,
      firstName: storeName.firstName,
      lastName: storeName.lastName,
      email: STORE_SHIPPING_INFO.email,
      phone: cleanPhoneNumber(STORE_SHIPPING_INFO.phone),
      address: STORE_SHIPPING_INFO.address,
      suburb: STORE_SHIPPING_INFO.suburb || "NA",
      crossStreet: STORE_SHIPPING_INFO.crossStreet || "NA",
      reference: STORE_SHIPPING_INFO.reference || "NA",
      daneCode: STORE_SHIPPING_INFO.daneCode,
    },
    destination: {
      company: order.company || "NA",
      firstName: customerName.firstName,
      lastName: customerName.lastName,
      email: order.email || "",
      phone: cleanPhoneNumber(order.phone),
      address: order.address,
      suburb: order.neighborhood || "NA",
      crossStreet: order.address2 || "NA",
      reference: order.addressReference || "NA",
      daneCode: order.daneCode!,
    },
  });
  } catch (error: any) {
    // Check if error is due to invalid/expired idRate
    const errorMessage = error?.response?.data?.status_messages?.[0]?.request || error?.message || '';

    if (
      errorMessage.includes('idRate') ||
      errorMessage.includes('rate') ||
      errorMessage.includes('cotización') ||
      errorMessage.includes('expirado') ||
      errorMessage.includes('inválido') ||
      error?.response?.status === 400
    ) {
      throw ErrorFactory.InvalidRequest(
        `La cotización de envío ha expirado o es inválida. Por favor, solicita una nueva cotización para esta orden. Error: ${errorMessage}`
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
