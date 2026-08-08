import { Client, Receiver } from "@upstash/qstash";

import prismadb from "@/lib/prismadb";

type QueueEnvironment = Record<string, string | undefined>;

type QueueFailureCallbackPayload = {
  maxRetries?: unknown;
  retried?: unknown;
  sourceBody?: unknown;
  status?: unknown;
  url?: unknown;
};

export type MercadoLibreQueueFailure =
  | {
      kind: "webhook";
      eventId: string;
      message: string;
    }
  | {
      kind: "stock-sync";
      eventId: string;
      message: string;
    }
  | {
      kind: "recovery";
      connectionId: string;
      message: string;
    };

const REQUIRED_QUEUE_VARIABLES = [
  "QSTASH_TOKEN",
  "QSTASH_CURRENT_SIGNING_KEY",
  "QSTASH_NEXT_SIGNING_KEY",
  "ADMIN_WEB_URL",
] as const;

export const MERCADOLIBRE_FAILURE_CALLBACK_HEADERS = {
  "Upstash-Failure-Callback-Retries": "3",
  "Upstash-Failure-Callback-Timeout": "30s",
} as const;

export function getMercadoLibreQueueConfigurationStatus(
  environment: QueueEnvironment = process.env,
) {
  const missing = REQUIRED_QUEUE_VARIABLES.filter(
    (key) => !environment[key]?.trim(),
  );

  return {
    configured: missing.length === 0,
    missing,
  };
}

function getAdminEndpointUrl(
  path: string,
  environment: QueueEnvironment = process.env,
) {
  const adminUrl = environment.ADMIN_WEB_URL;
  if (!adminUrl) {
    throw new Error("ADMIN_WEB_URL es requerida para procesar Mercado Libre");
  }

  return new URL(path, adminUrl).toString();
}

function getFailureMessage(payload: QueueFailureCallbackPayload) {
  const status =
    typeof payload.status === "number" ? ` HTTP ${payload.status}` : "";
  const retries =
    typeof payload.retried === "number" &&
    typeof payload.maxRetries === "number"
      ? ` tras ${payload.retried} de ${payload.maxRetries} reintentos`
      : " después de agotar los reintentos";

  return `QStash no pudo entregar una tarea de Mercado Libre${retries}${status}`;
}

function parseQueuedMessage(sourceBody: unknown) {
  if (typeof sourceBody !== "string") return null;

  try {
    const decoded = Buffer.from(sourceBody, "base64").toString("utf8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function enqueueMercadoLibreWebhookEvent(
  eventId: string,
  connectionId: string,
  environment: QueueEnvironment = process.env,
) {
  if (!getMercadoLibreQueueConfigurationStatus(environment).configured) {
    return false;
  }

  const client = new Client({
    token: environment.QSTASH_TOKEN,
    enableTelemetry: false,
  });
  await client.publishJSON({
    url: getMercadoLibreProcessorUrl(environment),
    body: { eventId },
    retries: 5,
    timeout: 50,
    failureCallback: getMercadoLibreFailureUrl(environment),
    flowControl: {
      key: `mercadolibre-connection-${connectionId}`,
      parallelism: 1,
    },
    label: ["mercadolibre", "webhook"],
    headers: {
      ...MERCADOLIBRE_FAILURE_CALLBACK_HEADERS,
    },
    redact: { body: true },
  });

  return true;
}

export async function verifyMercadoLibreProcessorRequest(
  body: string,
  signature: string | null,
  requestUrl: string,
  region: string | null,
  environment: QueueEnvironment = process.env,
) {
  const status = getMercadoLibreQueueConfigurationStatus(environment);
  if (!status.configured || !signature) return false;

  const receiver = new Receiver({
    currentSigningKey: environment.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: environment.QSTASH_NEXT_SIGNING_KEY,
  });

  return receiver.verify({
    body,
    signature,
    url: requestUrl,
    upstashRegion: region ?? undefined,
  });
}

export function getMercadoLibreProcessorUrl(
  environment: QueueEnvironment = process.env,
) {
  return getAdminEndpointUrl(
    "/api/internal/marketplaces/mercadolibre/process",
    environment,
  );
}

export function getMercadoLibreFailureUrl(
  environment: QueueEnvironment = process.env,
) {
  return getAdminEndpointUrl(
    "/api/internal/marketplaces/mercadolibre/failure",
    environment,
  );
}

export function parseMercadoLibreQueueFailureCallback(
  payload: unknown,
  environment: QueueEnvironment = process.env,
): MercadoLibreQueueFailure | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const callback = payload as QueueFailureCallbackPayload;
  const sourceMessage = parseQueuedMessage(callback.sourceBody);
  if (!sourceMessage || typeof callback.url !== "string") return null;

  const message = getFailureMessage(callback);
  if (
    callback.url === getMercadoLibreProcessorUrl(environment) &&
    typeof sourceMessage.eventId === "string" &&
    sourceMessage.eventId
  ) {
    return { kind: "webhook", eventId: sourceMessage.eventId, message };
  }
  if (
    callback.url === getMercadoLibreSyncUrl(environment) &&
    typeof sourceMessage.eventId === "string" &&
    sourceMessage.eventId
  ) {
    return { kind: "stock-sync", eventId: sourceMessage.eventId, message };
  }
  if (
    callback.url === getMercadoLibreRecoveryUrl(environment) &&
    typeof sourceMessage.connectionId === "string" &&
    sourceMessage.connectionId
  ) {
    return {
      kind: "recovery",
      connectionId: sourceMessage.connectionId,
      message,
    };
  }

  return null;
}

export async function enqueueMercadoLibreOutboxEvent(
  eventId: string,
  connectionId: string,
  environment: QueueEnvironment = process.env,
) {
  if (!getMercadoLibreQueueConfigurationStatus(environment).configured) {
    return false;
  }

  const client = new Client({
    token: environment.QSTASH_TOKEN,
    enableTelemetry: false,
  });
  await client.publishJSON({
    url: getMercadoLibreSyncUrl(environment),
    body: { eventId },
    retries: 5,
    timeout: 50,
    failureCallback: getMercadoLibreFailureUrl(environment),
    flowControl: {
      key: `mercadolibre-connection-${connectionId}`,
      parallelism: 1,
    },
    label: ["mercadolibre", "stock-sync"],
    headers: {
      ...MERCADOLIBRE_FAILURE_CALLBACK_HEADERS,
    },
    redact: { body: true },
  });

  return true;
}

export function getMercadoLibreSyncUrl(
  environment: QueueEnvironment = process.env,
) {
  return getAdminEndpointUrl(
    "/api/internal/marketplaces/mercadolibre/sync",
    environment,
  );
}

export function getMercadoLibreRecoveryUrl(
  environment: QueueEnvironment = process.env,
) {
  return getAdminEndpointUrl(
    "/api/internal/marketplaces/mercadolibre/recover",
    environment,
  );
}

export async function ensureMercadoLibreRecoverySchedule(
  connectionId: string,
  environment: QueueEnvironment = process.env,
) {
  if (!getMercadoLibreQueueConfigurationStatus(environment).configured) {
    return false;
  }

  const connection = await prismadb.marketplaceConnection.findUniqueOrThrow({
    where: { id: connectionId },
    select: { id: true, recoveryScheduleId: true },
  });
  if (connection.recoveryScheduleId) return true;

  const client = new Client({
    token: environment.QSTASH_TOKEN,
    enableTelemetry: false,
  });
  const schedule = await client.schedules.create({
    destination: getMercadoLibreRecoveryUrl(environment),
    cron: "*/5 * * * *",
    method: "POST",
    body: JSON.stringify({ connectionId }),
    headers: {
      "Content-Type": "application/json",
      ...MERCADOLIBRE_FAILURE_CALLBACK_HEADERS,
    },
    retries: 3,
    timeout: 50,
    failureCallback: getMercadoLibreFailureUrl(environment),
    flowControl: {
      key: `mercadolibre-recovery-${connectionId}`,
      parallelism: 1,
    },
    label: ["mercadolibre", "recovery"],
    redact: { body: true },
  });

  const claim = await prismadb.marketplaceConnection.updateMany({
    where: { id: connection.id, recoveryScheduleId: null },
    data: { recoveryScheduleId: schedule.scheduleId },
  });
  if (claim.count === 1) return true;

  await client.schedules.delete(schedule.scheduleId);
  return true;
}
