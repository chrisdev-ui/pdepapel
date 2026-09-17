import crypto from "node:crypto";
import type { Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * El id lo decide el sembrado de la administración (`E2E_ADMIN_STORE_ID`), así
 * que se lee de su propio archivo en vez de repetirlo aquí y que se separen.
 */
function resolveSeededStoreId(): string {
  if (process.env.E2E_LOCAL_STORE_ID) return process.env.E2E_LOCAL_STORE_ID;

  const file = path.resolve(process.cwd(), "../pdepapel-admin/.env.e2e.local");
  if (existsSync(file)) {
    const match = readFileSync(file, "utf8").match(
      /^\s*(?:export\s+)?E2E_ADMIN_STORE_ID\s*=\s*"?([^"\r\n]+)"?\s*$/m,
    );
    if (match) return match[1].trim();
  }
  return "e2e-admin-store";
}

export const SEEDED_STORE_ID = resolveSeededStoreId();

export const LOCAL_ADMIN_PORT = 3101;
export const LOCAL_STORE_PORT = 3100;

/**
 * Clave de firma sólo para estas pruebas. No es un secreto: firma webhooks que
 * esta misma suite inventa contra una base desechable. Se inyecta en el
 * servidor local, nunca se lee la de producción.
 *
 * Se usa una clave real —no la cadena vacía— a propósito:
 * `verifyBoldWebhookSignature` rechaza una clave vacía para que nadie pueda
 * firmar un pago, y esa defensa se prueba tal cual está.
 */
export const LOCAL_BOLD_SECRET_KEY =
  process.env.E2E_BOLD_SECRET_KEY || "e2e-local-bold-signing-key";

export const LOCAL_BOLD_IDENTITY_KEY =
  process.env.E2E_BOLD_IDENTITY_KEY || "e2e-local-bold-identity";

export const localAdminOrigin = `http://localhost:${LOCAL_ADMIN_PORT}`;

export const localApiUrl = (storeId: string) =>
  `${localAdminOrigin}/api/${storeId}`;

/**
 * El buscador de ciudades sale del DANE por Redis y un servicio externo, no de
 * la base local: en frío devuelve vacío en silencio y el paso de entrega se
 * queda sin opciones. Es un tercero, como el script de Bold.
 */
export async function stubDaneLookup(page: Page) {
  await page.route("**/api/locations**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            value: "05001000",
            label: "MEDELLÍN - ANTIOQUIA",
            city: "MEDELLÍN",
            department: "ANTIOQUIA",
            daneCode: "05001000",
            raw: {
              locationCode: "05001000",
              cityName: "MEDELLÍN",
              departmentName: "ANTIOQUIA",
            },
          },
        ],
        count: 1,
      }),
    }),
  );
}

export type BoldWebhookEvent =
  | "SALE_APPROVED"
  | "SALE_REJECTED"
  | "VOID_APPROVED";

/** Misma fórmula que `verifyBoldWebhookSignature`: HMAC sobre el cuerpo en base64. */
export function signBoldWebhook(rawBody: string, secretKey: string) {
  return crypto
    .createHmac("sha256", secretKey)
    .update(Buffer.from(rawBody, "utf8").toString("base64"))
    .digest("hex");
}

export function buildBoldWebhookBody(options: {
  type: BoldWebhookEvent;
  reference: string;
  total: number;
  currency?: string;
  paymentId?: string;
}) {
  return JSON.stringify({
    type: options.type,
    data: {
      // `payment_id` es lo primero que busca el handler; sin él la orden queda
      // sin identificador de transacción y el movimiento de inventario se
      // guarda «sin referencia», que no es lo que pasa en producción.
      payment_id: options.paymentId ?? `e2e-${options.reference}`,
      metadata: { reference: options.reference },
      amount: { total: options.total, currency: options.currency ?? "COP" },
    },
  });
}

/**
 * Simula la llamada que haría Bold. Sus servidores no alcanzan `localhost`, así
 * que la suite firma y entrega el webhook ella misma; el handler la verifica
 * con el mismo rigor que en producción.
 */
export async function deliverBoldWebhook(options: {
  storeId: string;
  type: BoldWebhookEvent;
  reference: string;
  total: number;
  secretKey?: string;
  paymentId?: string;
}) {
  const body = buildBoldWebhookBody(options);
  const secretKey = options.secretKey ?? LOCAL_BOLD_SECRET_KEY;

  const response = await fetch(
    `${localAdminOrigin}/api/webhook/bold?store=${encodeURIComponent(options.storeId)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bold-signature": signBoldWebhook(body, secretKey),
      },
      body,
    },
  );

  return { status: response.status, body: await response.text() };
}

export async function readOrderFromAdmin(storeId: string, orderId: string) {
  // `_t` por la misma razón que en `check-live-stock`: sin él una lectura
  // anterior puede quedar cacheada y devolver el estado viejo justo después
  // de que el webhook lo cambió.
  const response = await fetch(
    `${localApiUrl(storeId)}/orders/${orderId}?_t=${Date.now()}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error(`La orden ${orderId} no se pudo leer`);
  return response.json();
}

export async function readProductStock(storeId: string, productId: string) {
  const response = await fetch(
    `${localApiUrl(storeId)}/products/${productId}?_t=${Date.now()}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error(`El producto ${productId} no se pudo leer`);
  const product = await response.json();
  return Number(product.stock);
}
