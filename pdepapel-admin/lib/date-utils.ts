import { TimeStatus } from "@/components/coupon-badge";
import {
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  isAfter,
  isBefore,
  isEqual,
} from "date-fns";
import { utcToZonedTime } from "date-fns-tz";

export function getTimeStatus(startDate: Date, endDate: Date): TimeStatus {
  const now = new Date();

  if (isBefore(now, startDate) || isEqual(now, startDate)) {
    const days = differenceInDays(startDate, now);
    const hours = differenceInHours(startDate, now);
    const minutes = differenceInMinutes(startDate, now);

    return {
      status: "pending",
      timeRemaining:
        days > 0
          ? `${days} ${days === 1 ? "día" : "días"}`
          : hours > 0
            ? `${hours} ${hours === 1 ? "hora" : "horas"}`
            : `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`,
    };
  }

  // If current date is after end date
  if (isAfter(now, endDate)) {
    return {
      status: "expired",
      timeRemaining: null,
    };
  }

  // If current date is between start and end date
  const days = differenceInDays(endDate, now);
  const hours = differenceInHours(endDate, now);
  const minutes = differenceInMinutes(endDate, now);

  return {
    status: "active",
    timeRemaining:
      days > 0
        ? `${days} ${days === 1 ? "día" : "días"}`
        : hours > 0
          ? `${hours} ${hours === 1 ? "hora" : "horas"}`
          : `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`,
  };
}

export function getColombiaDate(date?: Date): Date {
  if (!date) return utcToZonedTime(new Date(), "America/Bogota");
  return utcToZonedTime(date, "America/Bogota");
}
