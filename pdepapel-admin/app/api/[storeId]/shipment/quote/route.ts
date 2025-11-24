import { NextResponse } from "next/server";
import {
  ENVIOCLICK_DEFAULTS,
  SHIPPING_QUOTE_CACHE,
  STORE_SHIPPING_INFO,
} from "@/constants/shipping";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { calculatePackageDimensions } from "@/lib/package-calculator";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { envioClickClient } from "@/lib/envioclick";

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
    const { destination, orderTotal, items, forceRefresh } = await req.json();

    if (!orderTotal || isNaN(orderTotal) || orderTotal <= 0)
      throw ErrorFactory.InvalidRequest("El total del pedido es inválido");

    if (!items || !Array.isArray(items) || items.length === 0)
      throw ErrorFactory.InvalidRequest("Los items del pedido son requeridos");

    if (!destination?.address)
      throw ErrorFactory.InvalidRequest("La dirección de destino es requerida");

    if (!destination?.daneCode)
      throw ErrorFactory.InvalidRequest(
        "El código DANE de destino es requerido",
      );

    const products = await prismadb.product.findMany({
      where: {
        id: { in: items.map((item: any) => item.productId) },
        storeId: params.storeId,
      },
      select: {
        id: true,
        name: true,
        size: { select: { value: true, name: true } },
      },
    });

    if (products.length === 0)
      throw ErrorFactory.InvalidRequest("Productos no encontrados");

    const packageDimensions = calculatePackageDimensions(items, products);

    const cacheKey = {
      storeId: params.storeId,
      originDaneCode: STORE_SHIPPING_INFO.daneCode,
      destDaneCode: destination.daneCode,
      weight: packageDimensions.weight,
      declaredValue: Math.round(orderTotal / 1000) * 1000,
    };

    // 5. CACHE: Buscar en caché (si no es forzado)
    if (!forceRefresh) {
      const cached = await prismadb.shippingQuote.findUnique({
        where: {
          storeId_originDaneCode_destDaneCode_weight_declaredValue: cacheKey,
        },
      });

      // Si existe y no ha expirado, retornar del caché
      if (cached && cached.expiresAt > new Date()) {
        // Incrementar hit count
        await prismadb.shippingQuote.update({
          where: { id: cached.id },
          data: { hitCount: { increment: 1 } },
        });

        return NextResponse.json(
          {
            success: true,
            quotes: cached.quotesData,
            daneCode: destination.daneCode,
            packageDimensions,
            cached: true,
          },
          {
            headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
          },
        );
      }
    }

    const packageForApi = {
      weight: packageDimensions.weight,
      height: packageDimensions.height,
      width: packageDimensions.width,
      length: packageDimensions.length,
    };

    const quotation = await envioClickClient.quoteShipment({
      packages: [packageForApi],
      description: ENVIOCLICK_DEFAULTS.defaultDescription,
      contentValue: orderTotal,
      origin: {
        daneCode: STORE_SHIPPING_INFO.daneCode,
        address: STORE_SHIPPING_INFO.address,
      },
      destination: {
        daneCode: destination.daneCode,
        address: destination.address,
      },
    });

    const processedPackage = quotation.data.packages?.[0] || packageForApi;

    const finalDimensions = {
      weight: processedPackage.weight ?? packageForApi.weight,
      height: processedPackage.height ?? packageForApi.height,
      width: processedPackage.width ?? packageForApi.width,
      length: processedPackage.length ?? packageForApi.length,
    };

    const quotes = quotation.data.rates.map((rate) => ({
      idRate: rate.idRate,
      idCarrier: rate.idCarrier,
      idProduct: rate.idProduct,
      carrier: rate.carrier,
      product: rate.product,
      flete: rate.flete,
      minimumInsurance: rate.minimumInsurance,
      totalCost: rate.flete + rate.minimumInsurance,
      deliveryDays: rate.deliveryDays,
      isCOD: rate.cod,
    }));

    await prismadb.shippingQuote.upsert({
      where: {
        storeId_originDaneCode_destDaneCode_weight_declaredValue: cacheKey,
      },
      create: {
        ...cacheKey,
        weight: finalDimensions.weight,
        height: finalDimensions.height,
        width: finalDimensions.width,
        length: finalDimensions.length,
        quotesData: quotes,
        expiresAt: new Date(Date.now() + SHIPPING_QUOTE_CACHE.TTL_MS),
      },
      update: {
        weight: finalDimensions.weight,
        height: finalDimensions.height,
        width: finalDimensions.width,
        length: finalDimensions.length,
        quotesData: quotes,
        expiresAt: new Date(Date.now() + SHIPPING_QUOTE_CACHE.TTL_MS),
        hitCount: 0, // Reset hit count on refresh
      },
    });

    if (Math.random() < SHIPPING_QUOTE_CACHE.AUTO_CLEANUP_PROBABILITY) {
      prismadb.shippingQuote
        .deleteMany({
          where: {
            expiresAt: { lt: new Date() },
          },
        })
        .catch((err) => console.error("[SHIPPING_QUOTE] Cleanup error:", err));
    }

    return NextResponse.json(
      {
        success: true,
        quotes,
        daneCode: destination.daneCode,
        packageDimensions: {
          ...finalDimensions,
          type: packageDimensions.type,
          size: packageDimensions.size,
        },
      },
      {
        headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
      },
    );
  } catch (error: any) {
    return handleErrorResponse(error, "QUOTE_SHIPPING", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  }
}
