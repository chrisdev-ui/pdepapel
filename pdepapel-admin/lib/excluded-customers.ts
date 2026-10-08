import "server-only";

const NAMES_ENV = "STORE_EXCLUDED_CUSTOMER_NAMES";
const PHONES_ENV = "STORE_EXCLUDED_CUSTOMER_PHONES";

const list = (name: string) =>
  (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

/**
 * Personas del equipo que no cuentan como clientes en los reportes. Sin las
 * variables los reportes siguen funcionando, solo que las incluyen.
 */
export function getExcludedCustomers() {
  const names = list(NAMES_ENV);
  const phones = list(PHONES_ENV);
  if (names.length === 0 && phones.length === 0) {
    console.warn(`Sin ${NAMES_ENV} ni ${PHONES_ENV}: los reportes de clientes incluyen al equipo.`);
  }
  return { names, phones };
}
