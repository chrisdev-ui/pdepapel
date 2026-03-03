"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { utcToZonedTime } from "date-fns-tz";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

interface BiMonthPickerProps {
  /** The active year (e.g. 2026). Plain number avoids Date serialization issues. */
  activeYear: number;
  /** The active month index (0-11). Plain number avoids Date serialization issues. */
  activeMonth: number;
}

export const BiMonthPicker: React.FC<BiMonthPickerProps> = ({
  activeYear,
  activeMonth,
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Always use Colombia timezone for "today" so the picker limits match
  // the business timezone, regardless of browser or server timezone.
  const today = utcToZonedTime(new Date(), "America/Bogota");
  const currentYear = today.getFullYear();
  const currentMonthIdx = today.getMonth(); // 0-11

  const activeMonthIdx = activeMonth;

  // Hardcode starting year or get it dynamically. Let's start from 2024 for example.
  const START_YEAR = 2024;
  const years = Array.from(
    { length: currentYear - START_YEAR + 1 },
    (_, i) => START_YEAR + i,
  ).reverse();

  // Determine how many months to show based on the selected year
  const maxMonthIdx = activeYear >= currentYear ? currentMonthIdx : 11;
  const months = Array.from({ length: maxMonthIdx + 1 }, (_, i) => i);

  const updateParams = (year: number, monthIdx: number) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    current.set("month", (monthIdx + 1).toString());
    current.set("year", year.toString());

    const search = current.toString();
    const query = search ? `?${search}` : "";

    router.push(`${window.location.pathname}${query}`);
  };

  const handlePrevMonth = () => {
    let newYear = activeYear;
    let newMonth = activeMonthIdx - 1;

    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    }

    // Prevent going before START_YEAR
    if (newYear < START_YEAR) return;

    updateParams(newYear, newMonth);
  };

  const handleNextMonth = () => {
    let newYear = activeYear;
    let newMonth = activeMonthIdx + 1;

    if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }

    // Prevent going into the future
    if (
      newYear > currentYear ||
      (newYear === currentYear && newMonth > currentMonthIdx)
    ) {
      return;
    }

    updateParams(newYear, newMonth);
  };

  const isCurrentMonth = () => {
    return activeMonthIdx === currentMonthIdx && activeYear === currentYear;
  };

  const isMinMonth = () => {
    return activeMonthIdx === 0 && activeYear === START_YEAR;
  };

  const onMonthChange = (val: string) => {
    updateParams(activeYear, parseInt(val));
  };

  const onYearChange = (val: string) => {
    const newYear = parseInt(val);
    let newMonth = activeMonthIdx;

    // If changing to current year and the active month is ahead of the current real month, cap it
    if (newYear === currentYear && newMonth > currentMonthIdx) {
      newMonth = currentMonthIdx;
    }

    updateParams(newYear, newMonth);
  };

  return (
    <div className="flex items-center space-x-2">
      <Button
        variant="outline"
        size="icon"
        onClick={handlePrevMonth}
        disabled={isMinMonth()}
        className="h-8 w-8"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex items-center space-x-1">
        <Select value={activeMonthIdx.toString()} onValueChange={onMonthChange}>
          <SelectTrigger className="h-8 w-[120px] font-medium capitalize">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((mIdx) => {
              const dateObj = new Date(activeYear, mIdx, 15);
              return (
                <SelectItem
                  key={mIdx}
                  value={mIdx.toString()}
                  className="capitalize"
                >
                  {format(dateObj, "MMMM", { locale: es })}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <Select value={activeYear.toString()} onValueChange={onYearChange}>
          <SelectTrigger className="h-8 w-[80px] font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={y.toString()}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        variant="outline"
        size="icon"
        onClick={handleNextMonth}
        disabled={isCurrentMonth()}
        className="h-8 w-8"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
};
