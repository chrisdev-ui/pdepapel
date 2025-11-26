/**
 * Cliente API para EnvioClick Pro
 * Documentación: https://apidoc.envioclickpro.com.co/
 */

import { env } from "./env.mjs";

// ============================================================================
// TYPES
// ============================================================================

export interface QuoteShipmentParams {
  packages: Array<{
    weight: number; // kg (min: 1.0, max: 1000)
    height: number; // cm (min: 1.0, max: 300)
    width: number; // cm (min: 1.0, max: 300)
    length: number; // cm (min: 1.0, max: 300)
  }>;
  description: string; // min: 3, max: 25
  contentValue: number; // min: 0, max: 3000000
  codValue?: number; // Para servicios COD
  includeGuideCost?: boolean;
  codPaymentMethod?: "cash" | "data_phone";
  origin: {
    daneCode: string; // 8 dígitos
    address: string; // min: 2, max: 50
  };
  destination: {
    daneCode: string; // 8 dígitos
    address: string; // min: 2, max: 50
  };
}

export interface QuoteResponse {
  status: string;
  status_codes: number[];
  status_messages: Array<{ request: string }>;
  data: {
    packages: any[];
    description: string;
    contentValue: number;
    origin: any;
    destination: any;
    rates: Array<{
      idRate: number; // ⭐ ID único para crear guía
      idProduct: number;
      product: string; // "Normal", "Normal COD", etc.
      idCarrier: number;
      carrier: string; // "COORDINADORA", "ENVIA", etc.
      flete: number; // Costo base
      minimumInsurance: number; // Seguro obligatorio
      extraInsurance: number; // Seguro extra
      deliveryDays: number; // Días estimados
      distance: number | null;
      quotationType: string;
      cod: boolean;
      codDetails: {
        codCost: number;
        codCostWithInsurance: number;
        codPaymentMethod: string;
        includeGuideCost: boolean;
      } | null;
    }>;
    idCarriersNoWsResult: number[];
  };
}

export interface CreateShipmentParams {
  idRate: number; // ⭐ ID de cotización
  myShipmentReference: string; // Tu número de orden
  external_order_id?: string;
  requestPickup: boolean; // true si requieres recolección
  pickupDate?: string; // "YYYY-MM-DD"
  insurance: boolean; // Siempre true
  description: string; // min: 3, max: 25
  contentValue: number;
  codValue?: number;
  includeGuideCost?: boolean;
  codPaymentMethod?: "cash" | "data_phone";
  packages: Array<{
    weight: number | string;
    height: number;
    width: number;
    length: number;
  }>;
  origin: {
    company: string; // min: 2, max: 28
    firstName: string; // min: 2, max: 14
    lastName: string; // max: 14
    email: string; // max: 68
    phone: string; // 10 dígitos
    address: string; // min: 2, max: 50
    suburb: string; // min: 2, max: 38
    crossStreet: string; // min: 2, max: 35
    reference: string; // min: 2, max: 25
    daneCode: string; // 8 dígitos
  };
  destination: {
    company: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
    suburb: string;
    crossStreet: string;
    reference: string;
    daneCode: string;
  };
}

export interface ShipmentResponse {
  status: string;
  status_codes: number[];
  status_messages: Array<{ request: string }>;
  data: {
    idRate: number;
    myShipmentReference: string;
    external_order_id?: string;
    requestPickup: boolean;
    insurance: boolean;
    description: string;
    contentValue: number;
    packages: any[];
    origin: any;
    destination: any;
    guide: string; // PDF en base64
    url: string; // URL del PDF en S3
    tracker: string; // Código de rastreo
    idOrder: number; // ⭐ ID de orden en EnvioClick
  };
}

export interface TrackingByCodeParams {
  trackingCode: string;
}

export interface TrackingResponse {
  status: string;
  status_codes: number[];
  status_messages: Array<{ request: string }>;
  data:
    | {
        status: string;
        statusDetail: string;
        arrivalDate: string | null;
        realPickupDate?: string | null;
        realDeliveryDate?: string | null;
        receivedBy?: string | null;
      }
    | string; // Puede ser string si hay error
}

export interface TrackingBatchParams {
  orders: number[];
}

export interface TrackingBatchResponse {
  status: string;
  status_codes: number[];
  status_messages: Array<{ request: string }>;
  data: Record<
    string,
    | {
        status: string;
        statusDetail: string;
        arrivalDate: string | null;
        realPickupDate: string | null;
        realDeliveryDate: string | null;
        receivedBy: string | null;
      }
    | string
  >; // String si hay error para ese ID
}

export interface CancellationParams {
  idOrders: number[];
}

export interface CancellationResponse {
  status: string;
  status_codes: number[];
  status_messages: Array<{ request: string }>;
  data: {
    not_valid_orders: number[];
    only_cancel_orders: number[];
    to_refund_orders: number[];
  };
}

// ============================================================================
// CLIENT CLASS
// ============================================================================

const ERROR_MAPPINGS: Record<string, string> = {
  "Invalid address":
    "La dirección proporcionada no es válida. Por favor verifícala.",
  "Service not available": "No hay cobertura de envíos para esta ubicación.",
  "Dimensions exceeded":
    "Las dimensiones del paquete exceden los límites permitidos.",
  "Authentication failed": "Error de configuración en el servicio de envíos.",
  "Rate not found": "No se encontraron cotizaciones para este destino.",
  not_valid_orders:
    "La orden no es válida para esta operación o ya fue procesada.",
  "Error al cancelar":
    "No se pudo cancelar el envío. Verifica el estado o intenta más tarde.",
};

export class EnvioClickClient {
  private apiKey: string;
  private baseUrl: string;
  private userAgent: string;

  constructor() {
    this.apiKey = env.ENVIOCLICK_API_KEY;
    this.baseUrl = env.ENVIOCLICK_API_URL || "https://api.envioclickpro.com.co";
    this.userAgent = "EcUserAgent-2/27248";
  }

  /**
   * Headers comunes para todas las peticiones
   */
  private getHeaders(): HeadersInit {
    return {
      Authorization: this.apiKey,
      "Content-Type": "application/json",
      "User-Agent": this.userAgent,
    };
  }

  /**
   * Obtiene un mensaje de error amigable basado en el error original
   */
  private getFriendlyErrorMessage(rawError: any): string {
    const message = rawError?.message || String(rawError);

    // Check for exact matches or substrings
    for (const [key, friendly] of Object.entries(ERROR_MAPPINGS)) {
      if (message.includes(key)) return friendly;
    }

    // Fallback for generic API errors
    if (message.includes("status_messages")) {
      return "Error en el servicio de envíos. Por favor intenta más tarde.";
    }

    return message;
  }

  /**
   * Manejo de errores de la API
   */
  private handleApiError(error: any, method: string): never {
    // Log full error details for debugging
    console.error(`[EnvioClick] Error in ${method}:`, {
      message: error?.message,
      response: error?.response?.data,
      status: error?.response?.status,
      stack: error?.stack,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
    });

    // Handle Fetch Network Errors
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      const customError: any = new Error(
        "No se pudo conectar con el servicio de envíos. Revisa tu conexión a internet.",
      );
      customError.code = "ENVIOCLICK_CONNECTION_ERROR";
      throw customError;
    }

    // Handle Custom Errors thrown by us (e.g. data.status !== "OK")
    const friendlyMessage = this.getFriendlyErrorMessage(
      error?.message || String(error),
    );
    const customError: any = new Error(friendlyMessage);
    customError.originalError = error;
    customError.code = "ENVIOCLICK_API_ERROR";
    throw customError;
  }

  /**
   * 1. COTIZAR ENVÍO
   * POST /api/v2/quotation
   */
  async quoteShipment(params: QuoteShipmentParams): Promise<QuoteResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v2/quotation`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(params),
      });

      const data = await response.json();

      if (data.status !== "OK") {
        const errorMsg =
          data.status_messages?.[0]?.error ||
          data.status_messages?.error ||
          "Error en cotización";
        throw new Error(errorMsg);
      }

      return data;
    } catch (error) {
      this.handleApiError(error, "quoteShipment");
    }
  }

  /**
   * 2. CREAR GUÍA DE ENVÍO
   * POST /api/v2/shipment
   */
  async createShipment(
    params: CreateShipmentParams,
  ): Promise<ShipmentResponse> {
    try {
      const apiUrl =
        env.NODE_ENV === "production"
          ? `${this.baseUrl}/api/v2/shipment`
          : `${this.baseUrl}/api/v2/shipment_sandbox`;

      const body = JSON.stringify(params);

      console.log(
        "[EnvioClick] Creating shipment with params:",
        JSON.stringify(params, null, 2),
      );

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: this.getHeaders(),
        body,
      });

      const data = await response.json();

      console.log("[EnvioClick] API Response:", JSON.stringify(data, null, 2));

      if (data.status !== "OK") {
        // Extract detailed error information
        const statusMessages = data.status_messages || [];
        const errorDetails = Array.isArray(statusMessages)
          ? statusMessages
              .map((msg: any) =>
                typeof msg === "object" ? JSON.stringify(msg) : String(msg),
              )
              .join(", ")
          : String(statusMessages);

        const errorMsg = `EnvioClick API Error: ${data.status || "FAILED"}. Details: ${errorDetails}`;

        console.error("[EnvioClick] Shipment creation failed:", {
          status: data.status,
          statusCodes: data.status_codes,
          statusMessages: data.status_messages,
          data: data.data,
          requestParams: params,
        });

        throw new Error(errorMsg);
      }

      return data;
    } catch (error) {
      this.handleApiError(error, "createShipment");
    }
  }

  /**
   * 3. TRACKING POR CÓDIGO
   * POST /api/v2/track
   */
  async trackByCode(trackingCode: string): Promise<TrackingResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v2/track`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ trackingCode }),
      });

      const data = await response.json();

      return data;
    } catch (error) {
      this.handleApiError(error, "trackByCode");
    }
  }

  /**
   * 4. TRACKING POR ID DE ORDEN
   * GET /api/v2/track-by-orders/:idOrder
   */
  async trackByOrderId(idOrder: number): Promise<TrackingResponse> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/v2/track-by-orders/${idOrder}`,
        {
          method: "GET",
          headers: this.getHeaders(),
        },
      );

      const data = await response.json();

      return data;
    } catch (error) {
      this.handleApiError(error, "trackByOrderId");
    }
  }

  /**
   * 5. TRACKING BATCH (MÚLTIPLES ÓRDENES)
   * POST /api/v2/track-by-orders
   */
  async trackBatch(orderIds: number[]): Promise<TrackingBatchResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v2/track-by-orders`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ orders: orderIds }),
      });

      const data = await response.json();

      return data;
    } catch (error) {
      this.handleApiError(error, "trackBatch");
    }
  }

  /**
   * 6. CANCELAR ÓRDENES
   * POST /api/v2/cancellation/batch/order
   */
  async cancelOrders(orderIds: number[]): Promise<CancellationResponse> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/v2/cancellation/batch/order`,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify({ idOrders: orderIds }),
        },
      );

      const data = await response.json();

      if (data.status !== "OK") {
        const errorMsg =
          data.status_messages?.[0]?.error ||
          data.status_messages?.error ||
          "Error al cancelar";
        throw new Error(errorMsg);
      }

      return data;
    } catch (error) {
      this.handleApiError(error, "cancelOrders");
    }
  }
}

// ============================================================================
// EXPORT SINGLETON INSTANCE
// ============================================================================

export const envioClickClient = new EnvioClickClient();
