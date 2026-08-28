import { describe, expect, it } from "vitest";

import {
  getCheckoutRequestFailureAnalytics,
  getCheckoutStepName,
  summarizeCheckoutValidationErrors,
} from "@/lib/checkout-analytics";

describe("checkout analytics", () => {
  it("uses stable Spanish step names", () => {
    expect(getCheckoutStepName(1)).toBe("informacion");
    expect(getCheckoutStepName(4)).toBe("revision");
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
