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
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

interface BiMonthPickerProps {
  currentDate: Date;
}

export const BiMonthPicker: React.FC<BiMonthPickerProps> = ({
  currentDate,
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonthIdx = today.getMonth(); // 0-11

  const activeYear = currentDate.getFullYear();
  const activeMonthIdx = currentDate.getMonth();

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
    const newDate = new Date(currentDate);
    newDate.setMonth(currentDate.getMonth() - 1);

    // Prevent going before START_YEAR
    if (newDate.getFullYear() < START_YEAR) return;

    updateParams(newDate.getFullYear(), newDate.getMonth());
  };

  const handleNextMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(currentDate.getMonth() + 1);

    // Prevent going into the future
    if (
      newDate.getFullYear() > currentYear ||
      (newDate.getFullYear() === currentYear &&
        newDate.getMonth() > currentMonthIdx)
    ) {
      return;
    }

    updateParams(newDate.getFullYear(), newDate.getMonth());
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
              const dateObj = new Date(activeYear, mIdx, 1);
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
