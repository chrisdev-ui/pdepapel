import { getColombiaDate } from "@/lib/date-utils";

export const BUSINESS_GROWTH_START_YEAR = 2024;

type RawPeriodValue = string | string[] | null | undefined;

export type BusinessGrowthPeriodSelection = {
  year: number;
  month: number;
  monthIndex: number;
  referenceDate: Date;
  isCurrent: boolean;
};

export type BusinessGrowthPeriodIdentity = {
  year: number;
  month: number;
  isCurrent: boolean;
};

function parsePeriodNumber(value: RawPeriodValue) {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (!normalized || !/^\d+$/.test(normalized)) return null;
  return Number(normalized);
}

export function resolveBusinessGrowthPeriod(
  values: { year?: RawPeriodValue; month?: RawPeriodValue },
  currentDate = getColombiaDate(),
): BusinessGrowthPeriodSelection {
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  const requestedYear = parsePeriodNumber(values.year);
  const requestedMonth = parsePeriodNumber(values.month);
  const hasCompleteSelection =
    requestedYear !== null && requestedMonth !== null;
  const isValidSelection =
    hasCompleteSelection &&
    requestedYear >= BUSINESS_GROWTH_START_YEAR &&
    requestedYear <= currentYear &&
    requestedMonth >= 1 &&
    requestedMonth <= 12 &&
    (requestedYear < currentYear || requestedMonth <= currentMonth);
  const year = isValidSelection ? requestedYear : currentYear;
  const month = isValidSelection ? requestedMonth : currentMonth;

  return {
    year,
    month,
    monthIndex: month - 1,
    referenceDate: new Date(year, month - 1, 15),
    isCurrent: year === currentYear && month === currentMonth,
  };
}

export function getBusinessGrowthPeriodDateBounds(
  period: Pick<BusinessGrowthPeriodIdentity, "year" | "month">,
) {
  const month = String(period.month).padStart(2, "0");
  const lastDay = new Date(period.year, period.month, 0).getDate();

  return {
    min: `${period.year}-${month}-01`,
    max: `${period.year}-${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function formatColombiaDateInput(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function getDefaultBusinessMovementDate(
  period: BusinessGrowthPeriodIdentity,
  currentDate = new Date(),
) {
  return period.isCurrent
    ? formatColombiaDateInput(currentDate)
    : getBusinessGrowthPeriodDateBounds(period).max;
}
