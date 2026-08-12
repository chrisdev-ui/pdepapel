import { describe, expect, it } from "vitest";

import {
  MERCADOLIBRE_FAILURE_CALLBACK_HEADERS,
  getMercadoLibreFailureUrl,
  getMercadoLibreOutboxFlowControlKey,
  getMercadoLibreOutboxQueueLabel,
  getMercadoLibreProcessorUrl,
  getMercadoLibreQueueConfigurationStatus,
  getMercadoLibreRecoveryUrl,
  getMercadoLibreSyncUrl,
  parseMercadoLibreQueueFailureCallback,
} from "@/lib/mercadolibre/queue";

const queueEnvironment = {
  ADMIN_WEB_URL: "https://admin.papeleriapdepapel.com",
  QSTASH_TOKEN: "qstash-token",
  QSTASH_CURRENT_SIGNING_KEY: "current-signing-key",
  QSTASH_NEXT_SIGNING_KEY: "next-signing-key",
};

describe("Mercado Libre durable queue", () => {
  it("uses an explicit duration for failure callback timeouts", () => {
    expect(MERCADOLIBRE_FAILURE_CALLBACK_HEADERS).toEqual({
      "Upstash-Failure-Callback-Retries": "3",
      "Upstash-Failure-Callback-Timeout": "30s",
    });
  });

  it("requires QStash credentials before activating processing", () => {
    expect(getMercadoLibreQueueConfigurationStatus({})).toEqual({
      configured: false,
      missing: [
        "QSTASH_TOKEN",
        "QSTASH_CURRENT_SIGNING_KEY",
        "QSTASH_NEXT_SIGNING_KEY",
        "ADMIN_WEB_URL",
      ],
    });
  });

  it("builds fixed administrative endpoints for signed jobs", () => {
    expect(getMercadoLibreQueueConfigurationStatus(queueEnvironment)).toEqual({
      configured: true,
      missing: [],
    });
    expect(getMercadoLibreSyncUrl(queueEnvironment)).toBe(
      "https://admin.papeleriapdepapel.com/api/internal/marketplaces/mercadolibre/sync",
    );
    expect(getMercadoLibreRecoveryUrl(queueEnvironment)).toBe(
      "https://admin.papeleriapdepapel.com/api/internal/marketplaces/mercadolibre/recover",
    );
    expect(getMercadoLibreFailureUrl(queueEnvironment)).toBe(
      "https://admin.papeleriapdepapel.com/api/internal/marketplaces/mercadolibre/failure",
    );
  });

  it("uses a separate queue lane for sale notifications", () => {
    expect(
      getMercadoLibreOutboxFlowControlKey("connection-id", "notification"),
    ).toBe("mercadolibre-notification-connection-id");
    expect(
      getMercadoLibreOutboxFlowControlKey("connection-id", "operation"),
    ).toBe("mercadolibre-operation-connection-id");
  });

  it("labels a sale notification separately from marketplace operations", () => {
    expect(getMercadoLibreOutboxQueueLabel("notification")).toEqual([
      "mercadolibre",
      "sale-notification",
    ]);
    expect(getMercadoLibreOutboxQueueLabel("operation")).toEqual([
      "mercadolibre",
      "operation",
    ]);
  });

  it("identifies the failed source task without trusting arbitrary destinations", () => {
    const sourceBody = Buffer.from(
      JSON.stringify({ eventId: "event-id" }),
    ).toString("base64");
    expect(
      parseMercadoLibreQueueFailureCallback(
        {
          url: getMercadoLibreProcessorUrl(queueEnvironment),
          sourceBody,
          status: 500,
          retried: 5,
          maxRetries: 5,
        },
        queueEnvironment,
      ),
    ).toEqual({
      kind: "webhook",
      eventId: "event-id",
      message:
        "QStash no pudo entregar una tarea de Mercado Libre tras 5 de 5 reintentos HTTP 500",
    });
    expect(
      parseMercadoLibreQueueFailureCallback(
        { url: "https://example.com", sourceBody },
        queueEnvironment,
      ),
    ).toBeNull();
  });
});
