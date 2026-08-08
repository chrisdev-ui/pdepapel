import { describe, expect, it } from "vitest";

import {
  MercadoLibreConfigurationError,
  getMercadoLibreConfig,
  getMercadoLibreConfigurationStatus,
} from "@/lib/mercadolibre/config";

const validEnvironment = {
  MERCADOLIBRE_CLIENT_ID: "client-id",
  MERCADOLIBRE_CLIENT_SECRET: "client-secret",
  MERCADOLIBRE_OAUTH_REDIRECT_URI:
    "https://admin.papeleriapdepapel.com/api/integrations/mercadolibre/callback",
  MERCADOLIBRE_TOKEN_ENCRYPTION_KEY: "a".repeat(44),
};

describe("Mercado Libre configuration", () => {
  it("reports the exact missing server variables without exposing values", () => {
    expect(getMercadoLibreConfigurationStatus({})).toEqual({
      configured: false,
      missing: [
        "MERCADOLIBRE_CLIENT_ID",
        "MERCADOLIBRE_CLIENT_SECRET",
        "MERCADOLIBRE_OAUTH_REDIRECT_URI",
        "MERCADOLIBRE_TOKEN_ENCRYPTION_KEY",
      ],
    });
  });

  it("accepts a complete HTTPS configuration", () => {
    expect(getMercadoLibreConfig(validEnvironment)).toMatchObject({
      clientId: "client-id",
      clientSecret: "client-secret",
    });
  });

  it("rejects non-HTTPS redirect URLs", () => {
    expect(() =>
      getMercadoLibreConfig({
        ...validEnvironment,
        MERCADOLIBRE_OAUTH_REDIRECT_URI: "http://localhost:3001/callback",
      }),
    ).toThrow(MercadoLibreConfigurationError);
  });
});
