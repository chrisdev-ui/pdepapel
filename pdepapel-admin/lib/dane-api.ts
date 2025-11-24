/**
 * Cliente API para códigos DANE de Colombia
 * Usa la API de MiPaquete para obtener información de ubicaciones
 * Caché con Upstash Redis para producción en Vercel
 */

import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env.mjs";

// Initialize Redis client
const redis = Redis.fromEnv();

export interface DaneLocation {
  _id: string;
  locationName: string;
  departmentOrStateName: string;
  locationCode: string; // Código DANE (8 dígitos)
  departmentOrStateCode: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  departmentCode: string;
  tccCode?: string;
  deprisaCode?: string;
  deprisaName?: string;
}

interface DaneApiResponse {
  locations: DaneLocation[];
}

/**
 * Genera un session-tracker único para cada petición
 */
function generateSessionTracker(): string {
  return uuidv4();
}

/**
 * Obtiene todas las ubicaciones de Colombia con sus códigos DANE
 */
export async function getAllLocations(): Promise<DaneLocation[]> {
  try {
    const response = await axios.get<DaneLocation[] | DaneApiResponse>(
      "https://api-v2.mpr.mipaquete.com/getLocations",
      {
        headers: {
          "session-tracker": generateSessionTracker(),
          apikey: env.MIPAQUETE_API_KEY || "",
        },
        timeout: 10000, // 10 second timeout
      },
    );

    if (!response.status || response.status !== 200) {
      throw new Error(`MiPaquete API error: ${response.status}`);
    }

    if (!response.data) {
      throw new Error("No data received from MiPaquete API");
    }

    // Handle two possible response formats:
    // 1. Direct array of locations
    // 2. Object with locations property
    let locations: DaneLocation[];

    if (Array.isArray(response.data)) {
      // Format 1: Direct array
      locations = response.data;
    } else if (
      response.data.locations &&
      Array.isArray(response.data.locations)
    ) {
      // Format 2: Object with locations property
      locations = response.data.locations;
    } else {
      throw new Error("Invalid response structure from MiPaquete API");
    }

    if (locations.length === 0) {
      console.warn("[DANE API] Received empty locations array from API");
    }

    return locations;
  } catch (error) {
    console.error("[DANE API] Error fetching locations:", error);
    throw error;
  }
}

/**
 * Busca una ubicación por código DANE
 */
export async function getLocationByDaneCode(
  daneCode: string,
): Promise<DaneLocation | null> {
  try {
    const response = await axios.get<DaneLocation[] | DaneApiResponse>(
      `https://api-v2.mpr.mipaquete.com/getLocations?locationCode=${daneCode}`,
      {
        headers: {
          "session-tracker": generateSessionTracker(),
          apikey: env.MIPAQUETE_API_KEY || "",
        },
        timeout: 10000,
      },
    );

    if (!response.status || response.status !== 200) {
      throw new Error(`MiPaquete API error: ${response.status}`);
    }

    if (!response.data) {
      return null;
    }

    // Handle two possible response formats
    let locations: DaneLocation[];

    if (Array.isArray(response.data)) {
      locations = response.data;
    } else if (
      response.data.locations &&
      Array.isArray(response.data.locations)
    ) {
      locations = response.data.locations;
    } else {
      return null;
    }

    // Puede haber duplicados, retornar el primero
    return locations.length > 0 ? locations[0] : null;
  } catch (error) {
    console.error(`[DANE API] Error fetching location ${daneCode}:`, error);
    return null;
  }
}

/**
 * Normaliza texto removiendo acentos para búsquedas
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Busca ubicaciones por nombre de ciudad (con soporte de acentos)
 */
export async function searchLocationsByCity(
  cityName: string,
): Promise<DaneLocation[]> {
  try {
    const allLocations = await getAllLocationsWithCache();

    const normalizedSearch = normalizeText(cityName);

    return allLocations.filter((location) => {
      const normalizedLocationName = normalizeText(location.locationName);
      const normalizedDeprisaName = location.deprisaName
        ? normalizeText(location.deprisaName)
        : "";

      return (
        normalizedLocationName.includes(normalizedSearch) ||
        normalizedDeprisaName.includes(normalizedSearch)
      );
    });
  } catch (error) {
    console.error(`[DANE API] Error searching city ${cityName}:`, error);
    return [];
  }
}

/**
 * Busca ubicaciones por departamento (con soporte de acentos)
 */
export async function searchLocationsByDepartment(
  departmentName: string,
): Promise<DaneLocation[]> {
  try {
    const allLocations = await getAllLocationsWithCache();

    const normalizedSearch = normalizeText(departmentName);

    return allLocations.filter((location) =>
      normalizeText(location.departmentOrStateName).includes(normalizedSearch),
    );
  } catch (error) {
    console.error(
      `[DANE API] Error searching department ${departmentName}:`,
      error,
    );
    return [];
  }
}

/**
 * Obtiene el código DANE por ciudad y departamento (con soporte de acentos)
 */
export async function getDaneCode(
  cityName: string,
  departmentName: string,
): Promise<string | null> {
  try {
    const allLocations = await getAllLocationsWithCache();

    const normalizedCity = normalizeText(cityName);
    const normalizedDepartment = normalizeText(departmentName);

    // Buscar coincidencia exacta
    const exactMatch = allLocations.find((location) => {
      const locCity = normalizeText(location.locationName);
      const locDeprisaCity = location.deprisaName
        ? normalizeText(location.deprisaName)
        : "";
      const locDepartment = normalizeText(location.departmentOrStateName);

      return (
        (locCity === normalizedCity || locDeprisaCity === normalizedCity) &&
        locDepartment === normalizedDepartment
      );
    });

    if (exactMatch) {
      return exactMatch.locationCode;
    }

    // Buscar coincidencia parcial
    const partialMatch = allLocations.find((location) => {
      const locCity = normalizeText(location.locationName);
      const locDeprisaCity = location.deprisaName
        ? normalizeText(location.deprisaName)
        : "";
      const locDepartment = normalizeText(location.departmentOrStateName);

      return (
        (locCity.includes(normalizedCity) ||
          locDeprisaCity.includes(normalizedCity)) &&
        locDepartment.includes(normalizedDepartment)
      );
    });

    return partialMatch ? partialMatch.locationCode : null;
  } catch (error) {
    console.error(
      `[DANE API] Error getting DANE code for ${cityName}, ${departmentName}:`,
      error,
    );
    return null;
  }
}

/**
 * Valida si un código DANE existe
 */
export async function validateDaneCode(daneCode: string): Promise<boolean> {
  if (!/^\d{8}$/.test(daneCode)) {
    return false;
  }

  const location = await getLocationByDaneCode(daneCode);
  return location !== null;
}

/**
 * Configuración de caché Redis para ubicaciones DANE
 */
const REDIS_CACHE_KEY = "dane:locations:all";
const REDIS_CACHE_TTL = 24 * 60 * 60; // 24 horas en segundos

/**
 * Obtiene ubicaciones con caché Redis (Upstash)
 * PERSISTENTE entre invocaciones serverless en Vercel
 */
export async function getAllLocationsWithCache(): Promise<DaneLocation[]> {
  try {
    // 1. Intentar obtener del caché Redis
    const cached = await redis.get<DaneLocation[]>(REDIS_CACHE_KEY);

    if (cached && Array.isArray(cached) && cached.length > 0) {
      return cached;
    }

    // 2. Fetch desde API de MiPaquete
    const locations = await getAllLocations();

    // 3. Validar que locations sea un array válido antes de cachear
    if (!locations || !Array.isArray(locations) || locations.length === 0) {
      console.error("[DANE_API] Invalid locations data received from API");
      return [];
    }

    // 4. Guardar en Redis con TTL de 24 horas
    try {
      await redis.set(REDIS_CACHE_KEY, locations, { ex: REDIS_CACHE_TTL });
      console.log(
        `[DANE_API] Cached ${locations.length} locations in Redis for 24 hours`,
      );
    } catch (redisError) {
      console.error("[DANE_API] Redis set error:", redisError);
      // Continue even if Redis cache fails
    }

    return locations;
  } catch (error) {
    console.error("[DANE_API] Error in getAllLocationsWithCache:", error);
    // Fallback: si Redis falla, obtener directamente de la API
    try {
      const locations = await getAllLocations();
      if (locations && Array.isArray(locations)) {
        return locations;
      }
    } catch (apiError) {
      console.error("[DANE_API] Fallback API call also failed:", apiError);
    }
    // Return empty array as last resort
    return [];
  }
}

/**
 * Invalida el caché de ubicaciones en Redis
 */
export async function clearLocationsCache(): Promise<void> {
  try {
    await redis.del(REDIS_CACHE_KEY);
  } catch (error) {
    console.error("[DANE_API] Error clearing Redis cache:", error);
  }
}

/**
 * Obtiene estadísticas del caché Redis
 */
export async function getCacheStats() {
  try {
    const ttl = await redis.ttl(REDIS_CACHE_KEY);
    const exists = await redis.exists(REDIS_CACHE_KEY);

    return {
      exists: exists === 1,
      ttl: ttl > 0 ? ttl : null,
      expiresIn:
        ttl > 0
          ? `${Math.floor(ttl / 3600)}h ${Math.floor((ttl % 3600) / 60)}m`
          : null,
      cacheKey: REDIS_CACHE_KEY,
    };
  } catch (error) {
    console.error("[DANE_API] Error getting cache stats:", error);
    return null;
  }
}

/**
 * Busca ubicaciones por query general (ciudad o ciudad + departamento)
 * Útil para autocomplete
 */
export async function searchLocations(
  query: string,
  limit: number = 50,
): Promise<DaneLocation[]> {
  try {
    const allLocations = await getAllLocationsWithCache();

    if (!query || query.trim().length < 2) {
      return allLocations;
    }

    const normalizedQuery = normalizeText(query);

    // Filtrar ubicaciones que coincidan con el query
    const matches = allLocations.filter((location) => {
      const normalizedLocationName = normalizeText(location.locationName);
      const normalizedDeprisaName = location.deprisaName
        ? normalizeText(location.deprisaName)
        : "";
      const normalizedDepartment = normalizeText(
        location.departmentOrStateName,
      );

      // Buscar en ciudad, deprisaName o departamento
      return (
        normalizedLocationName.includes(normalizedQuery) ||
        normalizedDeprisaName.includes(normalizedQuery) ||
        normalizedDepartment.includes(normalizedQuery)
      );
    });

    // Ordenar por relevancia (coincidencias exactas primero)
    const sorted = matches.sort((a, b) => {
      const aCityNorm = normalizeText(a.locationName);
      const bCityNorm = normalizeText(b.locationName);

      // Priorizar coincidencias exactas
      if (aCityNorm === normalizedQuery) return -1;
      if (bCityNorm === normalizedQuery) return 1;

      // Priorizar coincidencias que empiezan con el query
      if (aCityNorm.startsWith(normalizedQuery)) return -1;
      if (bCityNorm.startsWith(normalizedQuery)) return 1;

      // Alfabético
      return a.locationName.localeCompare(b.locationName);
    });

    return sorted.slice(0, limit);
  } catch (error) {
    console.error(`[DANE API] Error searching locations:`, error);
    return [];
  }
}

/**
 * Formatea una ubicación para mostrar en autocomplete
 * Formato: "Ciudad - Departamento"
 */
export function formatLocationForDisplay(location: DaneLocation): string {
  return `${location.locationName} - ${location.departmentOrStateName}`;
}

/**
 * Parsea un texto de autocomplete "Ciudad - Departamento" a partes
 */
export function parseLocationDisplay(
  display: string,
): { city: string; department: string } | null {
  const parts = display.split(" - ");
  if (parts.length !== 2) return null;

  return {
    city: parts[0].trim(),
    department: parts[1].trim(),
  };
}

/**
 * Obtiene una ubicación completa dado un display string
 */
export async function getLocationFromDisplay(
  display: string,
): Promise<DaneLocation | null> {
  const parsed = parseLocationDisplay(display);
  if (!parsed) return null;

  try {
    const allLocations = await getAllLocationsWithCache();

    const normalizedCity = normalizeText(parsed.city);
    const normalizedDepartment = normalizeText(parsed.department);

    const location = allLocations.find((loc) => {
      const locCity = normalizeText(loc.locationName);
      const locDeprisaCity = loc.deprisaName
        ? normalizeText(loc.deprisaName)
        : "";
      const locDepartment = normalizeText(loc.departmentOrStateName);

      return (
        (locCity === normalizedCity || locDeprisaCity === normalizedCity) &&
        locDepartment === normalizedDepartment
      );
    });

    return location || null;
  } catch (error) {
    console.error(`[DANE API] Error getting location from display:`, error);
    return null;
  }
}
