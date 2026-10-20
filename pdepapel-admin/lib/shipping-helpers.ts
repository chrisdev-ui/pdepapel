import { amountToCollect, NOTHING_TO_COLLECT_MESSAGE } from "@/lib/cod-fee";
import {
  ENVIOCLICK_DEFAULTS,
  getPickupDate,
  prepareShipmentDescription,
  splitFullName,
  STORE_SHIPPING_ORIGIN,
  truncateField,
} from "@/constants/shipping";
import { capsulePackageFor } from "@/lib/capsule-quote";
import { assertCapsuleDrawsClosed } from "@/lib/capsule-shipping-guard";
import prismadb from "@/lib/prismadb";
import { getShippingContact } from "@/lib/gift-orders";
import { getStoreSender } from "@/lib/store-sender";
import { ErrorFactory } from "./api-errors";
import { envioClickClient } from "./envioclick";
import { ShippingStatus } from "@prisma/client";
import { getColombiaDate } from "./date-utils";
import { parsePhoneNumberFromString } from "libphonenumber-js/mobile";
import {
  calculatePackageDimensions,
  BoxConfiguration,
} from "./package-calculator";
import { SHIPPING_WITHOUT_GUIDE_PDF } from "@/lib/shipping-guide-pdf";

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

type GuidePackage = { weight: number; height: number; width: number; length: number };

async function capsuleGuidePackage(db: any, storeId: string, order: any, current: GuidePackage, fromQuote: boolean): Promise<GuidePackage> {
  const capsuleOrder = await db.capsuleOrder.findUnique({ where: { orderId: order.id }, select: { suggestedBox: true } });
  if (!capsuleOrder) return current;
  const boxes = await db.box.findMany({ where: { storeId } });
  const configurations: Record<string, BoxConfiguration> = {};
  for (const type of ["XS", "S", "M", "L", "XL"]) {
    const box = boxes.find((candidate: any) => candidate.type === type && candidate.isDefault) ?? boxes.find((candidate: any) => candidate.type === type);
    if (box) configurations[type] = { width: box.width, height: box.height, length: box.length, type: "box", size: box.type, id: box.id, name: box.name };
  }
  let weight = current.weight;
  if (!fromQuote) {
    const items = order.orderItems.filter((item: any) => item.productId && item.product).map((item: any) => ({ productId: item.productId, quantity: item.quantity }));
    const worst = await capsulePackageFor(db, items, order.orderItems.filter((item: any) => item.product).map((item: any) => item.product), configurations);
    if (worst) weight = worst.weight;
  }
  const box = capsuleOrder.suggestedBox ? configurations[capsuleOrder.suggestedBox] : undefined;
  return box ? { weight, width: box.width, height: box.height, length: box.length } : { ...current, weight };
}

export async function createGuideForOrder(
  orderId: string,
  storeId: string,
  orderData?: any, // Optional: pass order data to avoid re-querying
  prismaClient?: any, // Optional: pass transaction client for use within transactions
) {
  // Use provided client (transaction) or default prismadb
  const db = prismaClient || prismadb;
  await assertCapsuleDrawsClosed(db, [orderId]);

  // 1. Obtener orden completa (o usar datos proporcionados)
  const order =
    orderData ||
    (await db.order.findUnique({
      where: { id: orderId, storeId },
      include: {
        shipping: SHIPPING_WITHOUT_GUIDE_PDF,
        orderItems: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                isArchived: true,
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

  // 2. Preparar datos. En un regalo el paquete sale a nombre y teléfono de
  // quien recibe; el correo sigue siendo el de quien compra.
  const shippingContact = getShippingContact(order);
  const customerName = splitFullName(shippingContact.fullName);
  const sender = getStoreSender();
  const storeName = splitFullName(`${sender.firstName} ${sender.lastName}`);

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

  // Cápsulas: la caja es la sugerida al cerrar el sorteo (lo que salió de
  // verdad); el peso, el del peor caso que se cotizó. Solo se consulta si el
  // pedido trae un producto archivado, como lo es el de una edición.
  if (order.orderItems?.some((item: any) => item.product?.isArchived)) {
    packageDimensions = await capsuleGuidePackage(db, storeId, order, packageDimensions, Boolean(shippingQuote && shippingQuote.expiresAt >= new Date()));
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

  // Contra entrega se recauda lo que la clienta debe al recibir, no el total.
  const codValue = amountToCollect(order);
  if (order.shipping.isCOD) {
    if (codValue <= 0) {
      throw ErrorFactory.InvalidRequest(NOTHING_TO_COLLECT_MESSAGE);
    }
    if (codValue > 3000000) {
      throw ErrorFactory.InvalidRequest(
        `El valor a recaudar contra entrega ($${codValue}) debe estar entre $0 y $3.000.000 COP.`,
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
        company: truncateField(sender.company, "company"),
        firstName: storeName.firstName,
        lastName: storeName.lastName,
        email: truncateField(sender.email, "email"),
        phone: phoneToNational(sender.phone),
        address: truncateField(sender.address, "address"),
        suburb: truncateField(sender.suburb || "NA", "suburb"),
        crossStreet: truncateField(
          sender.crossStreet || "NA",
          "crossStreet",
        ),
        reference: truncateField(
          sender.reference || "NA",
          "reference",
        ),
        daneCode: sender.daneCode,
      },
      destination: {
        company: truncateField(order.company || "NA", "company"),
        firstName: customerName.firstName,
        lastName: customerName.lastName,
        email: truncateField(order.email || "", "email"),
        phone: phoneToNational(shippingContact.phone),
        address: truncateField(order.address, "address"),
        suburb: truncateField(order.neighborhood || "NA", "suburb"),
        crossStreet: truncateField(order.address2 || "NA", "crossStreet"),
        reference: truncateField(order.addressReference || "NA", "reference"),
        daneCode: order.daneCode!,
      },
      ...(order.shipping.isCOD && {
        codValue,
        codPaymentMethod:
          order.shipping.codPaymentMethod ||
          ENVIOCLICK_DEFAULTS.codPaymentMethod,
        includeGuideCost:
          order.shipping.includeGuideCost ||
          ENVIOCLICK_DEFAULTS.includeGuideCost,
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

    if (errorMessage.includes(COD_RATE_MISMATCH)) {
      throw ErrorFactory.InvalidRequest(COD_RATE_MISMATCH_MESSAGE);
    }

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
      // La guía existe: el último intento fallido deja de ser noticia.
      guideError: null,
      guideAttemptedAt: null,
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

export interface RequotedRate {
  idRate: number;
  idCarrier: number | null;
  idProduct: number | null;
  carrier: string;
  product: string;
  flete: number;
  minimumInsurance: number;
  totalCost: number;
  deliveryDays: number;
  isCOD: boolean;
  /** Lo que cobra EnvioClick por recaudar; null si la tarifa no recauda. */
  codCost: number | null;
}

/** Mensaje de EnvioClick cuando se pide guía contra entrega con una tarifa cotizada sin recaudo. */
export const COD_RATE_MISMATCH = "idRate válido para COD";

export const COD_RATE_MISMATCH_MESSAGE =
  "La tarifa guardada se cotizó sin recaudo y el pedido es contra entrega. Pulsa «Cotizar de nuevo» con «Pago contra entrega» marcado, elige una tarifa que diga «Recauda contra entrega», guarda y crea la guía.";

/**
 * Cotiza el carrito contra la transportadora, en el momento.
 *
 * La usa el checkout cuando la tarifa que manda el cliente no está en la caché
 * de cotizaciones: sin esto, el servidor se creía el costo de envío que venía
 * en la petición y cualquiera podía pedir envío gratis.
 */
/**
 * Cuánto puede bailar el peso y seguir siendo el mismo carrito.
 *
 * La transportadora redondea y ajusta, así que el peso guardado nunca es
 * exactamente el calculado. Un 10 % cubre ese ajuste sin llegar a confundir un
 * carrito con otro: añadir o quitar un artículo mueve el peso mucho más.
 */
export const QUOTE_WEIGHT_REUSE_TOLERANCE = 0.1;

export function isSameCartWeight(
  storedWeight: number,
  calculatedWeight: number,
): boolean {
  if (storedWeight <= 0 || calculatedWeight <= 0) return false;
  const mayor = Math.max(storedWeight, calculatedWeight);
  return Math.abs(storedWeight - calculatedWeight) / mayor <= QUOTE_WEIGHT_REUSE_TOLERANCE;
}

/**
 * Las medidas de la última cotización a ese destino, si el carrito es el mismo.
 *
 * Se mira aunque esté vencida: lo que interesa no es la tarifa (esa se vuelve
 * a pedir igual) sino con qué medidas se pidió, para que la transportadora
 * devuelva las mismas opciones y no haya que reconciliar nada.
 */
export async function findReusableQuoteDimensions(input: {
  storeId: string;
  destDaneCode: string;
  calculatedWeight: number;
}): Promise<{ weight: number; height: number; width: number; length: number } | null> {
  const previa = await prismadb.shippingQuote
    .findFirst({
      where: { storeId: input.storeId, destDaneCode: input.destDaneCode },
      orderBy: { createdAt: "desc" },
      select: { weight: true, height: true, width: true, length: true },
    })
    .catch(() => null);

  if (!previa?.height || !previa.width || !previa.length) return null;
  if (!isSameCartWeight(previa.weight, input.calculatedWeight)) return null;

  return {
    weight: previa.weight,
    height: previa.height,
    width: previa.width,
    length: previa.length,
  };
}

export async function requoteCartShipping(input: {
  storeId: string;
  items: { productId: string; quantity: number }[];
  destination: { daneCode: string; address: string };
  contentValue: number;
  /** Contra entrega: el valor a recaudar. Sin esto EnvioClick devuelve tarifas sin recaudo. */
  cod?: { value: number };
}): Promise<RequotedRate[]> {
  const productIds = Array.from(
    new Set(input.items.map((item) => item.productId)),
  );
  const [products, dbBoxes] = await Promise.all([
    prismadb.product.findMany({
      where: { id: { in: productIds }, storeId: input.storeId },
      include: { size: true },
    }),
    prismadb.box.findMany({
      where: { storeId: input.storeId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const boxConfigurations: Record<string, BoxConfiguration> = {};
  for (const type of ["XS", "S", "M", "L", "XL"]) {
    const box =
      dbBoxes.find(
        (candidate) => candidate.type === type && candidate.isDefault,
      ) ?? dbBoxes.find((candidate) => candidate.type === type);
    if (!box) continue;
    boxConfigurations[type] = {
      width: box.width,
      height: box.height,
      length: box.length,
      type: "box",
      size: box.type as "XS" | "S" | "M" | "L" | "XL",
      id: box.id,
      name: box.name,
    };
  }

  // Cápsulas: la misma caja del peor caso que cotizó `/shipment/quote`.
  const calculadas =
    (products.some((product) => product.isArchived) ? await capsulePackageFor(prismadb, input.items, products, boxConfigurations) : null) ??
    calculatePackageDimensions(input.items as never, products as never, boxConfigurations);

  // Se reaprovechan las medidas de la cotización original cuando el carrito
  // no ha cambiado. Por qué: `/shipment/quote` guarda las medidas que devolvió
  // la TRANSPORTADORA (`quotation.data.packages[0]`), que no son las que se
  // calculan aquí, y además tiene un camino de «caja forzada» que aquí no
  // existe. Con el mismo carrito, las dos rutas mandaban pesos distintos, y el
  // `idRate` depende del peso: de ahí salía el fallo.
  //
  // Si el carrito cambió de verdad, el peso calculado ya no se parece al
  // guardado y se cotiza de cero, que es lo correcto: otro carrito, otro
  // precio.
  const dimensions =
    (await findReusableQuoteDimensions({
      storeId: input.storeId,
      destDaneCode: input.destination.daneCode,
      calculatedWeight: calculadas.weight,
    })) ?? calculadas;

  const quotation = await envioClickClient.quoteShipment({
    packages: [
      {
        weight: dimensions.weight,
        height: dimensions.height,
        width: dimensions.width,
        length: dimensions.length,
      },
    ],
    description: ENVIOCLICK_DEFAULTS.defaultDescription,
    contentValue: input.contentValue,
    origin: {
      daneCode: STORE_SHIPPING_ORIGIN.daneCode,
      address: getStoreSender().address,
    },
    destination: {
      daneCode: input.destination.daneCode,
      address: truncateField(input.destination.address, "address"),
    },
    ...(input.cod && {
      codValue: input.cod.value,
      codPaymentMethod: ENVIOCLICK_DEFAULTS.codPaymentMethod,
      includeGuideCost: ENVIOCLICK_DEFAULTS.includeGuideCost,
    }),
  });

  return (quotation.data.rates ?? []).map((rate) => ({
    idRate: rate.idRate,
    idCarrier: rate.idCarrier ?? null,
    idProduct: rate.idProduct ?? null,
    carrier: rate.carrier,
    product: rate.product,
    flete: rate.flete,
    minimumInsurance: rate.minimumInsurance,
    totalCost: rate.flete + rate.minimumInsurance,
    deliveryDays: rate.deliveryDays,
    isCOD: rate.cod,
    codCost: rate.codDetails?.codCost ?? null,
  }));
}
