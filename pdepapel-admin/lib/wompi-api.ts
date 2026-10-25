import { fetchGatewayJson, type GatewayFetchOptions, type GatewayLookup } from "@/lib/payment-gateway-lookup";

export interface WompiTransaction {
  id: string;
  status: string;
  reference: string;
  amount_in_cents: number;
  currency?: string;
  created_at?: string;
  finalized_at?: string | null;
  payment_method_type?: string;
  customer_email?: string;
}

export interface WompiApiConfig {
  /** `WOMPI_API_URL`, con o sin `/v1`. */
  baseUrl: string;
  /** La llave privada (`WOMPI_API_SECRET`): la pública responde 401 en esta búsqueda. */
  privateKey: string;
}

export function wompiApiBase(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return /\/v1$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

/**
 * Las transacciones de Wompi con nuestra referencia (el id del pedido,
 * `generateWompiPayment`). `data` llega como lista; un objeto suelto también
 * se acepta. Solo se quedan las de esa referencia exacta.
 */
export async function findWompiTransactionsByReference(
  reference: string,
  config: WompiApiConfig,
  options: GatewayFetchOptions = {},
): Promise<GatewayLookup<WompiTransaction>> {
  const url = `${wompiApiBase(config.baseUrl)}/transactions?reference=${encodeURIComponent(reference)}`;
  const result = await fetchGatewayJson(url, { authorization: `Bearer ${config.privateKey}` }, options);
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) return { kind: "key-rejected", status: result.status };
    return { kind: "unavailable", status: result.status, reason: result.reason };
  }
  const data = result.body?.data;
  const list: unknown[] = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
  const items = list.filter(
    (item): item is WompiTransaction =>
      !!item && typeof item === "object" && (item as WompiTransaction).reference === reference && typeof (item as WompiTransaction).status === "string",
  );
  return items.length > 0 ? { kind: "found", items } : { kind: "none" };
}
