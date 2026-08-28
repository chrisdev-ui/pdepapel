export const CHECKOUT_STEP_NAMES = {
  1: "informacion",
  2: "envio",
  3: "pago",
  4: "revision",
} as const;

export type CheckoutStepNumber = keyof typeof CHECKOUT_STEP_NAMES;
export type CheckoutStepName = (typeof CHECKOUT_STEP_NAMES)[CheckoutStepNumber];

const CHECKOUT_FIELD_GROUPS: Record<string, string> = {
  address1: "direccion_entrega",
  address2: "direccion_entrega",
  addressLabel: "direccion_guardada",
  addressReference: "direccion_entrega",
  city: "ubicacion_entrega",
  company: "direccion_entrega",
  daneCode: "ubicacion_entrega",
  department: "ubicacion_entrega",
  documentId: "informacion_contacto",
  email: "informacion_contacto",
  envioClickIdRate: "tarifa_envio",
  firstName: "informacion_contacto",
  lastName: "informacion_contacto",
  neighborhood: "direccion_entrega",
  paymentMethod: "metodo_pago",
  savedAddressId: "direccion_guardada",
  shippingOptionType: "opcion_envio",
  telephone: "informacion_contacto",
};

export function getCheckoutStepName(step: number): CheckoutStepName | null {
  return CHECKOUT_STEP_NAMES[step as CheckoutStepNumber] ?? null;
}

export function summarizeCheckoutValidationErrors(
  step: number,
  invalidFields: string[],
) {
  const errorGroups = Array.from(
    new Set(
      invalidFields.map(
        (fieldName) => CHECKOUT_FIELD_GROUPS[fieldName] ?? "otro_campo",
      ),
    ),
  ).sort();

  return {
    checkout_step: step,
    checkout_step_name: getCheckoutStepName(step) ?? "desconocido",
    error_group_count: errorGroups.length,
    error_groups: errorGroups.join(",") || "desconocido",
    invalid_field_count: invalidFields.length,
  };
}

function getResponseStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("response" in error)) {
    return null;
  }

  const response = error.response;
  if (!response || typeof response !== "object" || !("status" in response)) {
    return null;
  }

  return typeof response.status === "number" ? response.status : null;
}

export function getCheckoutRequestFailureAnalytics(error: unknown) {
  const httpStatus = getResponseStatus(error);

  let failureType = "network_or_client_error";
  if (httpStatus === 429) failureType = "rate_limited";
  else if (httpStatus !== null && httpStatus >= 500)
    failureType = "server_error";
  else if (httpStatus === 400 || httpStatus === 409 || httpStatus === 422) {
    failureType = "request_rejected";
  } else if (httpStatus !== null) failureType = "http_error";

  return {
    failure_type: failureType,
    ...(httpStatus !== null ? { http_status: httpStatus } : {}),
  };
}
