import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { ShippingStatus } from "@prisma/enums";

import { handleErrorResponse } from "@/lib/api-error-response";
import { ErrorFactory } from "@/lib/api-errors";;
import prismadb from "@/lib/prismadb";
import {
  cleanPhoneNumber,
  ENVIOCLICK_DEFAULTS,
  getPickupDate,
  splitFullName,
  STORE_SHIPPING_INFO,
} from "@/constants/shipping";
import {
  calculatePackageDimensions,
  BoxConfiguration,
} from "@/lib/package-calculator";
import { envioClickClient } from "@/lib/envioclick";
import { CACHE_HEADERS } from "@/lib/utils";
import { env } from "@/lib/env.mjs";
import { getColombiaDate } from "@/lib/date-utils";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    // Allow either authenticated admin OR internal webhook calls
    const { userId } = auth();
    const internalSecret = req.headers.get("x-internal-secret");

    const isAuthenticated = !!userId;
    const isInternalCall =
      internalSecret && internalSecret === env.INTERNAL_API_SECRET;

    if (!isAuthenticated && !isInternalCall) {
      throw ErrorFactory.Unauthenticated();
    }

    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const { orderId } = await req.json();

    // 1. Obtener orden completa con shipping
    const order = await prismadb.order.findUnique({
      where: { id: orderId, storeId: params.storeId },
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

    if (!order || !order.shipping)
      throw ErrorFactory.NotFound("Orden o información de envío no encontrada");

    if (order.status !== OrderStatus.PAID)
      throw ErrorFactory.InvalidRequest(
        "Solo se pueden crear guías para órdenes pagadas",
      );

    if (!order.shipping.envioClickIdRate)
      throw ErrorFactory.InvalidRequest(
        "No se ha cotizado el envío para esta orden",
      );

    if (order.shipping.envioClickIdOrder)
      throw ErrorFactory.InvalidRequest(
        "Ya se ha creado una guía para esta orden",
        {
          guideUrl: order.shipping.guideUrl,
        },
      );

    const customerName = splitFullName(order.fullName);
    const storeName = splitFullName(
      `${STORE_SHIPPING_INFO.firstName} ${STORE_SHIPPING_INFO.lastName}`,
    );

    const items = order.orderItems.map((oi) => ({
      productId: oi.productId,
      quantity: oi.quantity,
    }));
    const products = order.orderItems.map((oi) => oi.product);

    // Fetch boxes to ensure we have the latest config
    const dbBoxes = await prismadb.box.findMany({
      where: { storeId: params.storeId },
    });

    // Build configuration map
    const boxConfigurations: Record<string, BoxConfiguration> = {};
    const types = ["XS", "S", "M", "L", "XL"];

    // Fill with defaults or fallbacks
    types.forEach((type) => {
      const defaultBox = dbBoxes.find((b) => b.type === type && b.isDefault);
      const anyBox = dbBoxes.find((b) => b.type === type);
      const boxToUse = defaultBox || anyBox;

      if (boxToUse) {
        boxConfigurations[type] = {
          width: boxToUse.width,
          height: boxToUse.height,
          length: boxToUse.length,
          type: "box",
          size: boxToUse.type as "XS" | "S" | "M" | "L" | "XL",
          id: boxToUse.id,
          name: boxToUse.name,
        };
      }
    });

    // If manual box was used (saved in shipping), override/prioritize it
    let packageDimensions;
    const savedBoxId = order.shipping?.boxId;
    if (savedBoxId) {
      const manualBox = dbBoxes.find((b) => b.id === savedBoxId);
      if (manualBox) {
        const tempDims = calculatePackageDimensions(items, products); // Get weight
        packageDimensions = {
          weight: tempDims.weight,
          width: manualBox.width,
          height: manualBox.height,
          length: manualBox.length,
          type: "box" as const,
          size: manualBox.type as "XS" | "S" | "M" | "L" | "XL",
        };
      } else {
        // Fallback to auto if manual box deleted?
        console.warn(
          `[CREATE_GUIDE] Saved boxId ${order.shipping.boxId} not found in DB. Falling back to auto.`,
        );
        packageDimensions = calculatePackageDimensions(
          items,
          products,
          boxConfigurations,
        );
      }
    } else {
      packageDimensions = calculatePackageDimensions(
        items,
        products,
        boxConfigurations,
      );
    }

    // Crear guía en EnvioClick
    const result = await envioClickClient.createShipment({
      idRate: order.shipping.envioClickIdRate,
      myShipmentReference: order.orderNumber,
      requestPickup: ENVIOCLICK_DEFAULTS.requestPickup,
      pickupDate: getPickupDate(),
      insurance: ENVIOCLICK_DEFAULTS.insurance,
      description: ENVIOCLICK_DEFAULTS.defaultDescription,
      contentValue: order.total,
      packages: [packageDimensions],
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

    const updatedShipping = await prismadb.shipping.update({
      where: { id: order.shipping.id },
      data: {
        envioClickIdOrder: result.data.idOrder,
        trackingCode: result.data.tracker,
        guideUrl: result.data.url,
        guidePdfBase64: result.data.guide,
        requestPickup: result.data.requestPickup,
        status: ShippingStatus.Preparing,
        externalOrderId: result.data.external_order_id,
        originData: JSON.stringify(result.data.origin),
        destinationData: JSON.stringify(result.data.destination),
        pickupDate: getColombiaDate(new Date(getPickupDate())),
      },
    });

    return NextResponse.json(
      {
        success: true,
        shipping: updatedShipping,
      },
      {
        headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
      },
    );
  } catch (error: any) {
    return handleErrorResponse(error, "CREATE_GUIDE", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  }
}
