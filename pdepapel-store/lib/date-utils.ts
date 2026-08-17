import { Season } from "@/types";
import { utcToZonedTime } from "date-fns-tz";

export const getCurrentSeason = (): Season => {
  const now = new Date();
  const timeZone = "America/Bogota";
  const zonedDate = utcToZonedTime(now, timeZone);

  const month = zonedDate.getMonth(); // 0-11
  const day = zonedDate.getDate();

  // Spooky season: September 30th to November 3rd
  if (
    (month === 8 && day === 30) ||
    month === 9 ||
    (month === 10 && day <= 3)
  ) {
    return Season.Spooky;
  }

  // Christmas season: December 1st to January 7th
  if (month === 11) {
    // December
    return Season.Christmas;
  } else if (month === 0 && day <= 7) {
    // January 1st - 7th
    return Season.Christmas;
  }

  return Season.Default;
};
