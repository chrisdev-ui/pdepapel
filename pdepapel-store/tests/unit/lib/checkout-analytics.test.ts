import { describe, expect, it } from "vitest";

import {
  getBrowserContext,
  getCheckoutRequestFailureAnalytics,
  getCheckoutStepName,
  summarizeCheckoutValidationErrors,
} from "@/lib/checkout-analytics";

describe("checkout analytics", () => {
  it("uses stable Spanish step names", () => {
    expect(getCheckoutStepName(1)).toBe("informacion");
    expect(getCheckoutStepName(3)).toBe("pago");
    // The old review screen no longer exists as a step.
    expect(getCheckoutStepName(4)).toBeNull();
    expect(getCheckoutStepName(9)).toBeNull();
  });

  it("summarizes validation failures without exposing field values", () => {
    expect(
      summarizeCheckoutValidationErrors(2, [
        "address1",
        "city",
        "daneCode",
        "envioClickIdRate",
      ]),
    ).toEqual({
      checkout_step: 2,
      checkout_step_name: "envio",
      error_group_count: 3,
      error_groups: "direccion_entrega,tarifa_envio,ubicacion_entrega",
      invalid_field_count: 4,
    });
  });

  it("classifies request failures without exposing server messages", () => {
    expect(
      getCheckoutRequestFailureAnalytics({
        message: "customer@example.com",
        response: { status: 500 },
      }),
    ).toEqual({ failure_type: "server_error", http_status: 500 });
    expect(getCheckoutRequestFailureAnalytics(new Error("offline"))).toEqual({
      failure_type: "network_or_client_error",
    });
  });
});

describe("browser context", () => {
  it("names the in-app browsers we care about", () => {
    expect(
      getBrowserContext(
        "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Instagram 302.0.0.23.109",
      ),
    ).toBe("instagram");
    expect(
      getBrowserContext("Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/450.0.0.38.108]"),
    ).toBe("facebook");
    expect(
      getBrowserContext("Mozilla/5.0 (Linux; Android 13) WhatsApp/2.23.20.79"),
    ).toBe("whatsapp");
  });

  it("calls an ordinary browser standard", () => {
    expect(
      getBrowserContext(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1",
      ),
    ).toBe("standard");
  });

  it("prefers Instagram, whose browser also carries the Facebook markers", () => {
    expect(
      getBrowserContext("Mozilla/5.0 (iPhone) [FBAN/FBIOS] Instagram 302.0"),
    ).toBe("instagram");
  });

  it("falls back to standard when there is no user agent", () => {
    expect(getBrowserContext(undefined)).toBe("standard");
    expect(getBrowserContext(null)).toBe("standard");
    expect(getBrowserContext("")).toBe("standard");
  });
});
