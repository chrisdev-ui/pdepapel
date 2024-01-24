/**
 * Validates the mandatory fields of an object.
 * @template T - The type of the object.
 * @param {T} obj - The object to validate.
 * @param {Array<keyof T>} requiredFields - The array of required fields.
 * @returns {string[] | null} - An array of missing fields or null if all fields are present.
 */
export function validateMandatoryFields<T extends Record<string, any>>(
  obj: T,
  requiredFields: Array<keyof T>,
): string[] | null {
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (obj[field] === undefined || obj[field] === null) {
      missingFields.push(field as string);
    } else if (Array.isArray(obj[field]) && obj[field].length === 0) {
      missingFields.push(field as string);
    } else if (typeof obj[field] === "number" && obj[field] < 0) {
      missingFields.push(field as string);
    }
  }

  return missingFields.length > 0 ? missingFields : null;
}
