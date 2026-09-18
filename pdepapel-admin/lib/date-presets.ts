import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";

export interface CustomDate {
  name: string;
  from: Date;
  to: Date;
}

/** Sábado de esta semana, o el que viene si ya pasó el domingo. */
function nextWeekendStart(referenceDate: Date): Date {
  const day = referenceDate.getDay();
  const offset = day === 0 ? 6 : 6 - day;
  return addDays(referenceDate, offset);
}

export function getDatePresets(referenceDate = new Date()): Array<CustomDate> {
  return [
    {
      name: "Hoy",
      from: startOfDay(referenceDate),
      to: endOfDay(referenceDate),
    },
    {
      name: "Mañana",
      from: startOfDay(addDays(referenceDate, 1)),
      to: endOfDay(addDays(referenceDate, 1)),
    },
    {
      name: "Este fin de semana",
      from: startOfDay(nextWeekendStart(referenceDate)),
      to: endOfDay(addDays(nextWeekendStart(referenceDate), 1)),
    },
    {
      name: "Esta semana",
      from: startOfWeek(referenceDate, { locale: es }),
      to: endOfWeek(referenceDate, { locale: es }),
    },
    {
      name: "La próxima semana",
      from: startOfWeek(addWeeks(referenceDate, 1), { locale: es }),
      to: endOfWeek(addWeeks(referenceDate, 1), { locale: es }),
    },
    {
      name: "Este mes",
      from: startOfMonth(referenceDate),
      to: endOfMonth(referenceDate),
    },
    {
      name: "El próximo mes",
      from: startOfMonth(addMonths(referenceDate, 1)),
      to: endOfMonth(addMonths(referenceDate, 1)),
    },
  ];
}
