import { NextResponse } from "next/server";
import {
  searchLocations,
  formatLocationForDisplay,
  getAllLocationsWithCache,
} from "@/lib/dane-api";
import { handleErrorResponse } from "@/lib/api-error-response";
import { ErrorFactory } from "@/lib/api-errors";;
import { CACHE_HEADERS } from "@/lib/utils";
import { POPULAR_CITY_CODES } from "@/constants";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/[storeId]/dane/search?q=medellin
 * Busca ubicaciones por query (ciudad o departamento)
 * Público - usado por admin y frontend store para autocomplete y cotización
 */
export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) ErrorFactory.MissingStoreId();

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");
    const limitParam = searchParams.get("limit");

    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    let locations;

    // Si no hay query o está vacío, retornar ciudades populares de Colombia
    if (!query || query.trim().length === 0) {
      const allLocations = await getAllLocationsWithCache();

      locations = allLocations.filter((loc) =>
        POPULAR_CITY_CODES.includes(loc.locationCode),
      );
    } else {
      locations = await searchLocations(query, limit);
    }

    // Formatear para autocomplete
    const formatted = locations.map((location) => ({
      value: location.locationCode,
      label: formatLocationForDisplay(location),
      daneCode: location.locationCode,
      city: location.locationName,
      department: location.departmentOrStateName,
      raw: location, // Datos completos si se necesitan
    }));

    // Eliminar duplicados basados en el código DANE (value)
    const uniqueFormatted = formatted.filter(
      (item, index, self) =>
        index === self.findIndex((t) => t.value === item.value),
    );

    return NextResponse.json(
      {
        results: uniqueFormatted,
        count: uniqueFormatted.length,
      },
      {
        headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
      },
    );
  } catch (error: any) {
    return handleErrorResponse(error, "DANE_SEARCH_ERROR", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  }
}
