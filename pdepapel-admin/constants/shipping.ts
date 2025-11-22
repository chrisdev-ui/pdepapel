import { addDays, format, isWeekend, nextMonday } from "date-fns";
import { utcToZonedTime } from "date-fns-tz";

type CodPaymentMethod = "cash" | "data_phone";

export interface ShippingCarrier {
  idCarrier: number;
  carrier: string;
  code: string;
  comercialName: string;
  logoUrl: string;
  color: string;
}

export const SHIPPINGCARRIERS: ShippingCarrier[] = [
  {
    idCarrier: 14,
    carrier: "COORDINADORA",
    code: "COORDCOL",
    comercialName: "COORDINADORA",
    logoUrl: "https://www.envioclick.com/img/paqueterias/COORDINADORA.svg",
    color: "#2d61a6",
  },
  {
    idCarrier: 17,
    carrier: "MENSAJEROS ASAP",
    code: "ASAPM",
    comercialName: "MENSAJEROS ASAP",
    logoUrl:
      "https://www.envioclickpro.com.co/img/couriers/mensajeros_asap.png",
    color: "#ffffff",
  },
  {
    idCarrier: 20,
    carrier: "DHL",
    code: "DHL",
    comercialName: "DHL",
    logoUrl: "https://www.envioclick.com/img/paqueterias/DHL.svg",
    color: "#FFCC00",
  },
  {
    idCarrier: 28,
    carrier: "ENVIA",
    code: "ENV",
    comercialName: "ENVIA",
    logoUrl: "https://www.envioclick.com/img/paqueterias/ENVIA.svg",
    color: "#c42928",
  },
  {
    idCarrier: 30,
    carrier: "99MINUTOS",
    code: "99M",
    comercialName: "99 MINUTOS",
    logoUrl: "https://www.envioclick.com/img/paqueterias/99MINUTOS.svg",
    color: "#85C440",
  },
  {
    idCarrier: 40,
    carrier: "MENSAJEROS_URBANOS_EXPRESS",
    code: "MUE",
    comercialName: "Mensajeros Urbanos EXPRESS",
    logoUrl: "https://www.envioclick.com/img/paqueterias/MENSAJEROSURBANOS.svg",
    color: "#E4F7FA",
  },
  {
    idCarrier: 44,
    carrier: "TCC",
    code: "TCC",
    comercialName: "Tcc",
    logoUrl: "https://www.envioclick.com/img/paqueterias/TCC.svg",
    color: "#cd413f",
  },
  {
    idCarrier: 46,
    carrier: "INTERRAPIDISIMO",
    code: "INTER",
    comercialName: "INTERRAPIDISIMO",
    logoUrl: "https://www.envioclick.com/img/paqueterias/INTERRAPIDISIMO.svg",
    color: "#000000",
  },
  {
    idCarrier: 49,
    carrier: "PIBOX",
    code: "PIBOX",
    comercialName: "Pibox",
    logoUrl: "https://www.envioclick.com/img/paqueterias/PIBOX.svg",
    color: "#6f2bb6",
  },
  {
    idCarrier: 64,
    carrier: "DEPRISA",
    code: "DEPRISA",
    comercialName: "DEPRISA",
    logoUrl: "https://www.envioclickpro.com.co/img/couriers/deprisa.png",
    color: "#ffffff",
  },
  {
    idCarrier: 1,
    carrier: "SERVIENTREGA",
    code: "SERVIENTREGA",
    comercialName: "SERVIENTREGA",
    logoUrl: "https://www.envioclick.com/img/paqueterias/SERVIENTREGA.svg",
    color: "#55a962",
  },
];

export const STORE_SHIPPING_INFO = {
  company: "Papelería P de Papel",
  firstName: "Paula Fernanda",
  lastName: "Morales Rodriguez",
  email: "papeleria.pdepapel@gmail.com",
  phone: "3142829044",
  address: "Calle 12 AA sur #55d-30 T1 Apto1801 villaterra",
  suburb: null,
  crossStreet: null,
  reference: null,
  daneCode: "05001000",

  // Datos legibles
  cityName: "Medellín",
  departmentName: "Antioquia",
} as const;

// ============================================================================
// CONFIGURACIÓN DE ENVIOCLICK
// ============================================================================

/**
 * Configuración predeterminada para envíos
 */
export const ENVIOCLICK_DEFAULTS = {
  // Siempre solicitar recolección
  requestPickup: true,

  // Siempre incluir seguro
  insurance: false,

  // Método de pago para COD (siempre efectivo según requerimientos)
  codPaymentMethod: "cash" as CodPaymentMethod,

  // No incluir costo de guía en el monto a recaudar
  includeGuideCost: false,

  // Descripción por defecto
  defaultDescription: "Productos P de Papel",

  // Límite de descripción para EnvioClick
  descriptionMaxLength: 25,
} as const;

// ============================================================================
// DÍAS PARA RECOLECCIÓN
// ============================================================================

/**
 * Calcula la fecha de recolección (siguiente día hábil)
 */
export function getPickupDate(): string {
  const now = utcToZonedTime(new Date(), "America/Bogota");
  const tomorrow = addDays(now, 1);

  const pickupDate = isWeekend(tomorrow) ? nextMonday(tomorrow) : tomorrow;

  return format(pickupDate, "yyyy-MM-dd");
}

// ============================================================================
// VALIDACIONES
// ============================================================================

/**
 * Configuración de caché para cotizaciones de envío
 */
export const SHIPPING_QUOTE_CACHE = {
  /**
   * Tiempo de expiración de cotizaciones en milisegundos
   * Por defecto: 2 horas (las tarifas de EnvioClick pueden cambiar)
   *
   * Opciones recomendadas:
   * - 1 hora: 1 * 60 * 60 * 1000
   * - 2 horas: 2 * 60 * 60 * 1000 (recomendado)
   * - 4 horas: 4 * 60 * 60 * 1000
   * - 24 horas: 24 * 60 * 60 * 1000 (no recomendado)
   */
  TTL_MS: 2 * 60 * 60 * 1000, // 2 hours in milliseconds

  /**
   * Probabilidad de ejecutar auto-limpieza en cada request
   * 0.05 = 5% de probabilidad
   */
  AUTO_CLEANUP_PROBABILITY: 0.05,
} as const;

/**
 * Límites de EnvioClick API
 */
export const ENVIOCLICK_LIMITS = {
  description: { min: 3, max: 25 },
  contentValue: { min: 0, max: 3000000 },
  codValue: { min: 0, max: 3000000 },

  weight: { min: 1.0, max: 1000 },
  height: { min: 1.0, max: 300 },
  width: { min: 1.0, max: 300 },
  length: { min: 1.0, max: 300 },

  company: { min: 2, max: 28 },
  firstName: { min: 2, max: 14 },
  lastName: { max: 14 },
  email: { max: 68 },
  phone: { length: 10 },

  address: { min: 2, max: 50 },
  suburb: { min: 2, max: 38 },
  crossStreet: { min: 2, max: 35 },
  reference: { min: 2, max: 25 },
  daneCode: { length: 8 },
} as const;

/**
 * Valida un campo según los límites de EnvioClick
 */
export function validateEnvioClickField(
  field: keyof typeof ENVIOCLICK_LIMITS,
  value: string | number,
): { valid: boolean; error?: string } {
  const limits = ENVIOCLICK_LIMITS[field];

  if (typeof value === "string") {
    const length = value.length;

    if ("length" in limits) {
      if (length !== limits.length) {
        return {
          valid: false,
          error: `${field} debe tener exactamente ${limits.length} caracteres`,
        };
      }
    } else {
      if ("min" in limits && length < limits.min) {
        return {
          valid: false,
          error: `${field} debe tener al menos ${limits.min} caracteres`,
        };
      }
      if ("max" in limits && length > limits.max) {
        return {
          valid: false,
          error: `${field} no puede exceder ${limits.max} caracteres`,
        };
      }
    }
  }

  if (typeof value === "number") {
    if ("min" in limits && value < limits.min) {
      return {
        valid: false,
        error: `${field} debe ser al menos ${limits.min}`,
      };
    }
    if ("max" in limits && value > limits.max) {
      return {
        valid: false,
        error: `${field} no puede exceder ${limits.max}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Trunca texto para ajustarse a límites de EnvioClick
 */
export function truncateForEnvioClick(
  text: string,
  field: keyof typeof ENVIOCLICK_LIMITS,
): string {
  const limits = ENVIOCLICK_LIMITS[field];
  if ("max" in limits && text.length > limits.max) {
    return text.substring(0, limits.max);
  }
  return text;
}

/**
 * Divide nombre completo en firstName y lastName respetando límites
 */
export function splitFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/);

  if (parts.length === 1) {
    return {
      firstName: parts[0].substring(0, 14),
      lastName: "",
    };
  }

  const firstName = parts[0].substring(0, 14);
  const lastName = parts.slice(1).join(" ").substring(0, 14);

  return { firstName, lastName };
}

/**
 * Valida y limpia número de teléfono colombiano
 */
export function cleanPhoneNumber(phone: string): string {
  // Remover caracteres no numéricos
  const cleaned = phone.replace(/\D/g, "");

  // Si tiene código de país, removerlo
  if (cleaned.startsWith("57") && cleaned.length === 12) {
    return cleaned.substring(2);
  }

  // Tomar solo los primeros 10 dígitos
  return cleaned.substring(0, 10);
}

/**
 * Prepara la descripción del pedido para EnvioClick
 */
export function prepareShipmentDescription(description: string): string {
  // Truncar si es muy largo
  let cleaned = description.substring(0, 25);

  // Asegurar mínimo 3 caracteres
  if (cleaned.length < 3) {
    cleaned = ENVIOCLICK_DEFAULTS.defaultDescription;
  }

  return cleaned;
}

// ============================================================================
// HELPER FUNCTIONS FOR CARRIER INFO
// ============================================================================

/**
 * Obtiene información de transportadora por nombre
 * Busca de forma flexible (case insensitive, ignorando espacios extras)
 */
export function getCarrierInfo(
  carrierName: string,
): ShippingCarrier | undefined {
  const normalized = carrierName.toUpperCase().trim().replace(/\s+/g, "_");

  return SHIPPINGCARRIERS.find(
    (c) =>
      c.carrier.toUpperCase() === normalized ||
      c.comercialName.toUpperCase().includes(normalized) ||
      normalized.includes(c.carrier.toUpperCase()),
  );
}

/**
 * Determina si un color es claro u oscuro
 * Útil para decidir si usar texto blanco o negro sobre el color de fondo
 */
export function isLightColor(hexColor: string): boolean {
  // Remover # si existe
  const hex = hexColor.replace("#", "");

  // Convertir a RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calcular luminancia (fórmula ITU-R BT.709)
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // Si luminancia > 128, es un color claro
  return luminance > 128;
}
