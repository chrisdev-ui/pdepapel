import { parsePhoneNumber } from "libphonenumber-js";

export const formatPhoneNumber = (phone: string | null | undefined) => {
  if (!phone) return null;

  try {
    const phoneNumber = parsePhoneNumber(phone);
    return phoneNumber ? phoneNumber.format("INTERNATIONAL") : phone;
  } catch {
    return phone;
  }
};

export const normalizePhone = (phone: string | null | undefined) => {
  if (!phone) return "";

  try {
    const phoneNumber = parsePhoneNumber(phone, "CO");
    return phoneNumber ? phoneNumber.number.toString() : phone.trim();
  } catch {
    return phone.trim();
  }
};
