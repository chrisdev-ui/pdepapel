import { parsePhoneNumber } from "react-phone-number-input";

export function normalizePhoneForInput(
  phone: string | null | undefined,
): string {
  const value = phone?.trim();

  if (!value) {
    return "";
  }

  try {
    const parsedPhone = parsePhoneNumber(value, "CO");
    return parsedPhone?.isValid() ? parsedPhone.number : "";
  } catch {
    return "";
  }
}
