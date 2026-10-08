/**
 * El repositorio es público. En vez de guardar huellas de datos reales (un
 * celular o una cuenta se recuperan de su hash en minutos), se buscan formas:
 * todo lo que parezca un celular colombiano, una cuenta bancaria o una
 * dirección tiene que ser un dato ficticio o público de esta lista.
 */
/** Números ficticios de pruebas y documentación. */
const FAKE_PHONES = [
  "3000000000",
  "3000000001",
  "3000000002",
  "3000000003",
  "3000000004",
  "3000000018",
  "3001110000",
  "3001112233",
  "3001112244",
  "3001234567",
  "3003179332",
  "3005510000",
  "3007778899",
  "3009998877",
  "3009999999",
  "3015550001",
  "3015550002",
  "3024680000",
  "3025556677",
  "3112223344",
  "3115550000",
  "3999999999",
];
/** Línea pública de WhatsApp de la tienda (aparece en el sitio). */
const PUBLIC_PHONES = [
  "3132582293",
];
/** Ejemplo de la documentación del panel; falta decidir si es un número real. */
const PENDING_REVIEW_PHONES = [
  "3024686403",
];
export const ALLOWED_PHONES = new Set<string>([...FAKE_PHONES, ...PUBLIC_PHONES, ...PENDING_REVIEW_PHONES]);

/** Identificadores de 11 dígitos que no son cuentas: corridas de GitHub Actions, envíos de Mercado Libre y fixtures. */
export const ALLOWED_ACCOUNTS = new Set<string>([
  "00000000000",
  "12345678901",
  "14155552671",
  "37272537823",
  "37362198609",
  "37372680240",
  "37375514871",
  "37516685927",
  "37584516155",
  "37584953172",
  "37587933430",
  "37588002579",
  "47712931618",
]);

/** Direcciones ficticias de pruebas y ejemplos, normalizadas. */
export const ALLOWED_ADDRESSES = new Set<string>([
  "calle102030",
  "calle104020",
  "calle104321",
  "calle123",
  "calle1234",
  "calle1234567",
  "calle453218",
  "carrera123",
  "carrera501020",
  "carrera999",
  "cra123",
  "cra567",
]);

/** Archivos donde un número es público a propósito (se le muestra a la clienta). */
export const CUSTOMER_FACING: Record<string, { accounts?: true; phones?: true }> = {
  "pdepapel-store/components/bank-transfer-instructions.tsx": { accounts: true },
  "pdepapel-store/components/ui/payment-method-selector.tsx": { accounts: true },
};

const PHONE = /(?<![\w+])(?:\+?57[\s.-]?)?\(?(3\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})(?![\w])/g;
const ACCOUNT = /(?<![\w.-])(\d{3})[\s.-]?(\d{6})[\s.-]?(\d{2})(?![\w-])/g;
const ADDRESS =
  /\b(?:calle|cl|carrera|cra|kr|cr|diagonal|dg|transversal|tv|avenida|av|circular|cq)\.?\s*\d{1,3}\s*[a-z]{0,3}(?:\s+(?:bis|sur|norte|este))?\s*(?:#|no\.?|n°|nº)\s*\d{1,3}\s*[a-z]{0,2}\s*-\s*\d{1,3}/gi;

export const normalizeAddress = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export type SensitiveHit = { kind: "teléfono" | "cuenta" | "dirección"; line: number };

export function findSensitiveValues(
  content: string,
  options: { allowAccounts?: boolean; allowPhones?: boolean } = {},
): SensitiveHit[] {
  const hits: SensitiveHit[] = [];
  const lineOf = (index: number) => content.slice(0, index).split("\n").length;
  if (!options.allowPhones) {
    for (const match of Array.from(content.matchAll(PHONE))) {
      const digits = match.slice(1, 4).join("");
      if (!ALLOWED_PHONES.has(digits)) hits.push({ kind: "teléfono", line: lineOf(match.index ?? 0) });
    }
  }
  if (!options.allowAccounts) {
    for (const match of Array.from(content.matchAll(ACCOUNT))) {
      const digits = match.slice(1, 4).join("");
      if (!ALLOWED_ACCOUNTS.has(digits)) hits.push({ kind: "cuenta", line: lineOf(match.index ?? 0) });
    }
  }
  for (const match of Array.from(content.matchAll(ADDRESS))) {
    if (!ALLOWED_ADDRESSES.has(normalizeAddress(match[0]))) hits.push({ kind: "dirección", line: lineOf(match.index ?? 0) });
  }
  return hits;
}
