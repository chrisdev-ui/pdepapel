import { getBoldConfig } from "./bold";

export interface BoldDatafonoPushParams {
  terminalId?: string;
  amount: number;
  currency?: string;
  orderNumber: string;
  description?: string;
  email?: string;
}

export interface BoldDatafonoPushResult {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * Pushes a real-time payment intent directly to the physical Bold Smart POS Datáfono terminal.
 * Endpoint: POST https://integrations.api.bold.co/payments/app-checkout
 */
export async function pushToBoldDatafono(
  params: BoldDatafonoPushParams,
): Promise<BoldDatafonoPushResult> {
  try {
    const config = getBoldConfig();
    const apiKey = config.datafonoIdentityKey || config.identityKey;
    const terminalSerial =
      params.terminalId || config.datafonoSn || "01233050202505074185";
    const userEmail =
      params.email || process.env.STORE_CONTACT_EMAIL || "web.christian.dev@gmail.com";

    if (!apiKey) {
      return {
        success: false,
        message: "No se encontró la configuración necesaria para el datáfono.",
      };
    }

    const payload = {
      terminal_serial: terminalSerial,
      terminal_model: "D20",
      user_email: userEmail,
      payment_method: "CARD",
      amount: {
        currency: params.currency || "COP",
        total_amount: Math.round(params.amount),
        tip_amount: 0,
        taxes: [],
      },
      reference: params.orderNumber,
      description:
        params.description || `Pago Orden P de Papel #${params.orderNumber}`,
    };

    const response = await fetch(`${config.baseUrl}/payments/app-checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `x-api-key ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const resData = await response.json().catch(() => null);

    if (!response.ok) {
      console.warn("Bold Datáfono push returned error:", resData);
      const firstError = resData?.errors?.[0]?.message || resData?.message;
      return {
        success: false,
        message:
          firstError || `Error (${response.status}) al conectar con el datáfono.`,
        data: resData,
      };
    }

    return {
      success: true,
      message: `¡Notificación enviada con éxito al datáfono (${terminalSerial})! ID: ${resData?.payload?.integration_id || "OK"}`,
      data: resData,
    };
  } catch (error: any) {
    console.error("Error in pushToBoldDatafono:", error);
    return {
      success: false,
      message: `Excepción de conexión al Datáfono: ${error?.message || error}`,
    };
  }
}
