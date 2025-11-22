"use server";
import {
  getAllLocationsWithCache,
  formatLocationForDisplay,
} from "@/lib/dane-api";
import type { LocationOption } from "@/components/ui/location-combobox";
import { headers } from "next/headers";

/**
 * Obtiene TODAS las ubicaciones de Colombia con caché de 24h
 * Para cargar en el combobox del formulario de órdenes
 *
 * Usa getAllLocationsWithCache() que implementa caché en memoria para máxima performance.
 * La primera llamada fetch desde MiPaquete API, las siguientes usan caché por 24 horas.
 *
 * @returns Array de LocationOption para el combobox con TODAS las ubicaciones
 */
export const getDaneLocations = async (): Promise<LocationOption[]> => {
  headers();
  try {
    // Obtener TODAS las ubicaciones con caché de 24h en memoria
    const locations = await getAllLocationsWithCache();

    // Usar Set para eliminar duplicados por locationCode de forma eficiente
    const seen = new Set<string>();
    const uniqueLocations: LocationOption[] = [];

    for (const location of locations) {
      const daneCode = location.locationCode;

      // Solo agregar si no hemos visto este DANE code antes
      if (!seen.has(daneCode)) {
        seen.add(daneCode);
        uniqueLocations.push({
          value: location.locationCode, // daneCode como value
          label: formatLocationForDisplay(location), // "Medellín - Antioquia"
          city: location.locationName,
          department: location.departmentOrStateName,
          daneCode: location.locationCode,
        });
      }
    }

    return uniqueLocations;
  } catch (error) {
    console.error("[GET_DANE_LOCATIONS]", error);
    return [];
  }
};
