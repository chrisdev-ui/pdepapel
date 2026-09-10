/**
 * Which checkout step owns each form field. Used to send the customer back
 * to the right step when the final submit finds an invalid value that was
 * saved from a previous session (that failure used to be silent).
 *
 * Steps: 1 datos de contacto · 2 entrega · 3 pago y confirmación.
 */
export const CHECKOUT_TOTAL_STEPS = 3;

export const CHECKOUT_FIELD_STEPS: Record<string, number> = {
  fullName: 1,
  email: 1,
  telephone: 1,
  documentId: 1,
  newsletterOptIn: 1,
  address1: 2,
  address2: 2,
  neighborhood: 2,
  addressReference: 2,
  company: 2,
  city: 2,
  department: 2,
  daneCode: 2,
  saveAddress: 2,
  savedAddressId: 2,
  addressLabel: 2,
  shippingProvider: 2,
  shippingOptionType: 2,
  envioClickIdRate: 2,
  shipping: 2,
  paymentMethod: 3,
  couponCode: 3,
};

/** Lowest step that has at least one invalid field, or null when all is valid. */
export function getFirstInvalidStep(
  errors: Record<string, unknown>,
  fallbackStep = 1,
): number | null {
  const fields = Object.keys(errors ?? {});
  if (fields.length === 0) return null;

  const steps = fields.map(
    (field) => CHECKOUT_FIELD_STEPS[field] ?? fallbackStep,
  );
  return Math.min(...steps);
}

/** Fields that belong to a given step, for `form.trigger`. */
export function getStepFields(step: number): string[] {
  return Object.entries(CHECKOUT_FIELD_STEPS)
    .filter(([, fieldStep]) => fieldStep === step)
    .map(([field]) => field);
}

/** Joins the legacy first/last name pair into the single name field. */
export function joinFullName(
  firstName?: string | null,
  lastName?: string | null,
): string {
  return [firstName, lastName]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}
