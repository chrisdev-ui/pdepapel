import { NextResponse } from "next/server";
import { searchLocations, formatLocationForDisplay } from "@/lib/dane-api";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { CACHE_HEADERS } from "@/lib/utils";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/dane/search?q=medellin
 * Busca ubicaciones por query (ciudad o departamento)
 * Público - usado por admin y frontend store para autocomplete y cotización
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");
    const limitParam = searchParams.get("limit");

    if (!query || query.trim().length < 2)
      throw ErrorFactory.InvalidRequest(
        "La búsqueda debe tener al menos 2 caracteres",
      );

    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    const locations = await searchLocations(query, limit);

    // Formatear para autocomplete
    const formatted = locations.map((location) => ({
      value: formatLocationForDisplay(location), // "Medellín - Antioquia"
      label: formatLocationForDisplay(location),
      daneCode: location.locationCode,
      city: location.locationName,
      department: location.departmentOrStateName,
      raw: location, // Datos completos si se necesitan
    }));

    return NextResponse.json(
      {
        results: formatted,
        count: formatted.length,
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
