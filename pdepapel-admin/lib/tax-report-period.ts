import { getColombiaDate } from "@/lib/date-utils";

/**
 * El período del reporte tributario: cuál viene puesto, qué atajos hay y cómo
 * se nombra.
 *
 * Vive aparte de `lib/tax-reports.ts` porque ese archivo importa Prisma y la
 * pantalla lo necesita: hasta ahora el cliente se limitaba a **volver a
 * escribir** las mismas dos fechas, así que había dos sitios que definían lo
 * mismo y solo uno se corregía. Aquí no hay nada de servidor a propósito.
 */

/** `AAAA-MM-DD` en la zona de Colombia, que es como viajan las fechas del reporte. */
function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface TaxReportPeriodValue {
  startDate: string;
  endDate: string;
}

/**
 * Lo que se ve al entrar: **el año en curso hasta hoy**.
 *
 * Antes eran dos fechas escritas a mano —1 jul a 31 dic de 2025— que no
 * cambiaban nunca. En septiembre de 2026 la pantalla abría nueve meses tarde,
 * con los totales de otro año y sin decirlo. Se calcula, y así no vuelve a
 * envejecer sola.
 */
export function getDefaultTaxReportPeriod(
  now = getColombiaDate(),
): TaxReportPeriodValue {
  return {
    startDate: `${now.getFullYear()}-01-01`,
    endDate: toISODate(now),
  };
}

export interface TaxReportPreset extends TaxReportPeriodValue {
  id: string;
  label: string;
}

/**
 * Los rangos que de verdad se piden en tributario. Antes había que teclear
 * cuatro fechas a mano cada vez: el selector traía los atajos apagados.
 */
export function getTaxReportPeriodPresets(
  now = getColombiaDate(),
): TaxReportPreset[] {
  const year = now.getFullYear();
  const today = toISODate(now);
  return [
    {
      id: "este-ano",
      label: "Este año",
      startDate: `${year}-01-01`,
      endDate: today,
    },
    {
      id: "ano-pasado",
      label: "Año pasado",
      startDate: `${year - 1}-01-01`,
      endDate: `${year - 1}-12-31`,
    },
    {
      id: "primer-semestre",
      label: "1.er semestre",
      startDate: `${year}-01-01`,
      endDate: `${year}-06-30`,
    },
    {
      id: "segundo-semestre",
      label: "2.º semestre",
      startDate: `${year}-07-01`,
      endDate: `${year}-12-31`,
    },
  ];
}

/** El atajo que coincide exactamente con un período, si alguno lo hace. */
export function matchTaxReportPreset(
  period: TaxReportPeriodValue,
  now?: Date,
): TaxReportPreset | null {
  return (
    getTaxReportPeriodPresets(now).find(
      (preset) =>
        preset.startDate === period.startDate &&
        preset.endDate === period.endDate,
    ) ?? null
  );
}

export function isSameTaxReportPeriod(
  a: TaxReportPeriodValue,
  b: TaxReportPeriodValue,
): boolean {
  return a.startDate === b.startDate && a.endDate === b.endDate;
}

const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/** «1 ene – 21 sep 2026», para decir qué se lleva el archivo. */
export function formatTaxPeriodLabel(period: TaxReportPeriodValue): string {
  const part = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return value;
    return { year, month: MONTHS[month - 1] ?? String(month), day };
  };
  const from = part(period.startDate);
  const to = part(period.endDate);
  if (typeof from === "string" || typeof to === "string") {
    return `${period.startDate} a ${period.endDate}`;
  }
  const left =
    from.year === to.year
      ? `${from.day} ${from.month}`
      : `${from.day} ${from.month} ${from.year}`;
  return `${left} – ${to.day} ${to.month} ${to.year}`;
}
