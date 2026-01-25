import { NextResponse } from "next/server";
import {
  ENVIOCLICK_DEFAULTS,
  SHIPPING_QUOTE_CACHE,
  STORE_SHIPPING_INFO,
} from "@/constants/shipping";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  calculatePackageDimensions,
  BoxConfiguration,
} from "@/lib/package-calculator";
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
    const { destination, orderTotal, items, forceRefresh, boxId } =
      await req.json();

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

    // Filter valid product IDs (exclude manual items or undefined IDs)
    // Manual items usually have IDs starting with "MAN-" or similar non-standard formats
    const validProductIds = items
      .map((item: any) => item.productId)
      .filter((id: string) => id && !id.startsWith("MAN-"));

    const products =
      validProductIds.length > 0
        ? await prismadb.product.findMany({
            where: {
              id: { in: validProductIds },
              storeId: params.storeId,
            },
            select: {
              id: true,
              name: true,
              size: { select: { value: true, name: true } },
            },
          })
        : [];

    // Allow proceeding even if NO products are found (e.g. all items are manual)
    // The calculator will default to minimum size/weight if no products match
    if (
      products.length === 0 &&
      items.length > 0 &&
      validProductIds.length > 0
    ) {
      // Only throw if we expected to find products (had valid IDs) but found none
      throw ErrorFactory.InvalidRequest("Productos no encontrados");
    }

    // Fetch all boxes for this store
    const dbBoxes = await prismadb.box.findMany({
      where: { storeId: params.storeId },
      orderBy: { createdAt: "desc" },
    });

    let manualBox = null;

    if (boxId) {
      manualBox = dbBoxes.find((b) => b.id === boxId);
    }

    // Build configuration map prioritizing defaults
    const boxConfigurations: Record<string, BoxConfiguration> = {};

    // First fill with specific type defaults if any
    const types = ["XS", "S", "M", "L", "XL"];
    types.forEach((type) => {
      const defaultBox = dbBoxes.find((b) => b.type === type && b.isDefault);
      if (defaultBox) {
        boxConfigurations[type] = {
          width: defaultBox.width,
          height: defaultBox.height,
          length: defaultBox.length,
          type: "box",
          size: defaultBox.type as "XS" | "S" | "M" | "L" | "XL",
          id: defaultBox.id,
          name: defaultBox.name,
        };
      } else {
        // Fallback to any box of that type if no default
        const anyBox = dbBoxes.find((b) => b.type === type);
        if (anyBox) {
          boxConfigurations[type] = {
            width: anyBox.width,
            height: anyBox.height,
            length: anyBox.length,
            type: "box",
            size: anyBox.type as "XS" | "S" | "M" | "L" | "XL",
            id: anyBox.id,
            name: anyBox.name,
          };
        }
      }
    });

    let packageDimensions;

    if (manualBox) {
      // Manual Override: Use the selected box dimensions, but still calculate weight based on items
      // We pass the manual box as the ONLY configuration for its type to force selection if logic matches?
      // Actually, cleaner way: Calculate weight first, then combine with manual box dims.
      // But calculatePackageDimensions handles weight summing logic.
      // Let's pass a config where ALL types map to this manual box? No, that breaks logic.
      // Better: Construct the dimensions manually here using the helper for weight only?
      // Or: Update calculatePackageDimensions to support "forced box".
      // START OF MANUAL OVERRIDE LOGIC
      const tempDims = calculatePackageDimensions(items, products); // Get weight
      packageDimensions = {
        weight: tempDims.weight, // Keep calculated weight
        width: manualBox.width,
        height: manualBox.height,
        length: manualBox.length,
        type: "box" as const,
        size: manualBox.type as "XS" | "S" | "M" | "L" | "XL",
        id: manualBox.id,
        name: manualBox.name,
      };
    } else {
      packageDimensions = calculatePackageDimensions(
        items,
        products,
        boxConfigurations,
      );
    }

    // Find used box info if automatic and merge into packageDimensions
    if (!manualBox && packageDimensions.type === "box") {
      const size = packageDimensions.size;
      // Try to find the box object that matches these dims/type in our config
      if (boxConfigurations[size]) {
        Object.assign(packageDimensions, {
          id: boxConfigurations[size].id,
          name: boxConfigurations[size].name,
        });
      }
    }

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
          id: (packageDimensions as any).id,
          name: (packageDimensions as any).name,
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
