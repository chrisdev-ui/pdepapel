import { createHash } from "node:crypto";

export type MercadoLibreWebhookPayload = Record<string, unknown>;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function parseMercadoLibreWebhookPayload(body: string) {
  let payload: MercadoLibreWebhookPayload;
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid");
    }
    payload = parsed as MercadoLibreWebhookPayload;
  } catch {
    throw new Error("El webhook de Mercado Libre no contiene JSON válido");
  }

  const topic = payload.topic;
  const resource = payload.resource;
  const sellerId = payload.user_id;
  if (typeof topic !== "string" || !topic.trim()) {
    throw new Error("El webhook de Mercado Libre no incluye el tema");
  }
  if (typeof resource !== "string" || !resource.trim()) {
    throw new Error("El webhook de Mercado Libre no incluye el recurso");
  }
  if (typeof sellerId !== "string" && typeof sellerId !== "number") {
    throw new Error("El webhook de Mercado Libre no incluye el vendedor");
  }

  return {
    payload,
    topic: topic.trim(),
    resource: resource.trim(),
    sellerId: String(sellerId),
  };
}

export function getMercadoLibreWebhookEventKey(
  payload: MercadoLibreWebhookPayload,
) {
  const notificationId = payload._id ?? payload.id;
  if (typeof notificationId === "string" && notificationId.trim()) {
    return notificationId.trim();
  }
  if (typeof notificationId === "number" && Number.isFinite(notificationId)) {
    return String(notificationId);
  }

  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}
