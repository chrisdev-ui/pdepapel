import {
  parsePhoneNumberFromString,
  type CountryCode,
  type PhoneNumber,
} from "libphonenumber-js";

/**
 * Cómo se muestra un teléfono en el panel.
 *
 * Vive aparte de `lib/phone.ts` porque esto corre en el navegador, dentro de
 * tablas: solo describe cómo pintar un número y no toca nada más. Usa la
 * entrada por defecto de libphonenumber-js, que es la que ya usa el resto del
 * panel (y que de por sí carga la metadata «min», la liviana).
 *
 * El problema que resuelve: WhatsApp entrega los números sin «+»
 * (573024686403). `formatPhoneNumber` de react-phone-number-input exige E.164
 * con «+», así que devolvía vacío y la tabla terminaba mostrando los dígitos
 * pelados. Aquí se prueban las tres formas en que un número puede llegar y se
 * usa la primera que resulte válida.
 */

export const DEFAULT_PHONE_COUNTRY: CountryCode = "CO";

export interface PhoneDescription {
  /** Lo que estaba guardado, sin tocar. */
  raw: string;
  /** `+573024686403`, o null si no se pudo interpretar. */
  e164: string | null;
  /** `CO`, `CN`… null si el número no dice de dónde es. */
  country: CountryCode | null;
  /** «Colombia», «China». En español; null si el navegador no sabe traducirlo. */
  countryName: string | null;
  /** `+57 302 4686403` */
  international: string | null;
  /** `302 4686403` */
  national: string | null;
  isValid: boolean;
}

const EMPTY: PhoneDescription = {
  raw: "",
  e164: null,
  country: null,
  countryName: null,
  international: null,
  national: null,
  isValid: false,
};

/**
 * Los nombres de país se piden una sola vez por código: `Intl.DisplayNames`
 * es caro de construir y una tabla lo llamaría en cada fila.
 */
let regionNames: Intl.DisplayNames | null | undefined;

function getCountryName(country: CountryCode | null): string | null {
  if (!country) return null;
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(["es-CO"], { type: "region" });
    } catch {
      regionNames = null;
    }
  }
  if (!regionNames) return null;
  try {
    const name = regionNames.of(country);
    // `of` devuelve el mismo código cuando no conoce la región.
    return name && name !== country ? name : null;
  } catch {
    return null;
  }
}

/**
 * Interpreta un teléfono guardado en cualquiera de las formas que recibimos y
 * describe cómo mostrarlo. Nunca lanza: un número ilegible vuelve como
 * `isValid: false` con el texto original intacto, para no esconder el dato.
 */
export function describePhoneNumber(
  value: string | null | undefined,
  defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY,
): PhoneDescription {
  const raw = (value ?? "").trim();
  if (!raw) return EMPTY;

  const digits = raw.replace(/\D/g, "");

  // En orden: tal cual venga («+57…»), con «+» delante (WhatsApp) y como
  // número local colombiano. Gana el primero que sea válido de verdad.
  const candidates = [
    () => parsePhoneNumberFromString(raw),
    () => (digits ? parsePhoneNumberFromString(`+${digits}`) : undefined),
    () => parsePhoneNumberFromString(raw, defaultCountry),
  ];

  // Ojo: `parsePhoneNumberFromString` devuelve `undefined` con una entrada
  // ilegible, no lanza. Por eso aquí no hay try/catch: si algo lanzara sería
  // un problema de configuración de la librería y queremos verlo, no taparlo
  // como si fuera «número raro de una clienta».
  let fallback: PhoneNumber | undefined;

  for (const attempt of candidates) {
    const parsed = attempt();
    if (!parsed) continue;
    if (parsed.isValid()) return describe(raw, parsed, true);
    fallback ??= parsed;
  }

  // Se pudo leer pero no es un número asignable: se muestra formateado y
  // marcado como dudoso, en vez de desaparecer.
  if (fallback) return describe(raw, fallback, false);

  return { ...EMPTY, raw };
}

function describe(
  raw: string,
  parsed: PhoneNumber,
  isValid: boolean,
): PhoneDescription {
  const country = (parsed.country ?? null) as CountryCode | null;
  return {
    raw,
    e164: parsed.number,
    country,
    countryName: getCountryName(country),
    international: parsed.formatInternational(),
    national: country ? parsed.formatNational() : null,
    isValid,
  };
}

/** Etiqueta corta de país: «Colombia», si no el código, si no nada. */
export function getPhoneCountryLabel(
  description: PhoneDescription,
): string | null {
  return description.countryName ?? description.country ?? null;
}
