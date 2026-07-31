"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, CustomDate } from "@/lib/utils";
import { format, isValid } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DateRange } from "react-day-picker";
import {
  Control,
  FieldPath,
  FieldValues,
  useController,
} from "react-hook-form";

interface DateRangePickerProps<
  T extends FieldValues,
> extends React.HTMLAttributes<HTMLDivElement> {
  customDates?: Array<CustomDate> | (() => Array<CustomDate>);
  name: FieldPath<T>;
  control: Control<T>;
  placeholder?: string;
  disabled?: boolean;
}

interface CompleteDateRange {
  from: Date;
  to: Date;
}

function normalizeDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return isValid(value) ? value : undefined;
  }

  if (typeof value === "string") {
    const parsedDate = new Date(value);
    return isValid(parsedDate) ? parsedDate : undefined;
  }

  return undefined;
}

function normalizeDateRange(value: unknown): DateRange | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const range = value as { from?: unknown; to?: unknown };
  const from = normalizeDate(range.from);
  const to = normalizeDate(range.to);

  if (!from && !to) {
    return undefined;
  }

  return { from, to };
}

function hasSerializedDate(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const range = value as { from?: unknown; to?: unknown };
  return (
    (typeof range.from === "string" && Boolean(normalizeDate(range.from))) ||
    (typeof range.to === "string" && Boolean(normalizeDate(range.to)))
  );
}

export function DateRangePicker<T extends FieldValues>({
  className,
  customDates = [],
  placeholder = "Selecciona un rango de fechas",
  name,
  control,
  disabled = false,
  ...props
}: DateRangePickerProps<T>) {
  const [customDateSelected, setCustomDateselected] = useState<string>("");
  const [open, setOpen] = useState(false);

  const {
    field: { value, onChange },
  } = useController({ name, control });

  const selectedDateRange = useMemo(() => normalizeDateRange(value), [value]);
  const presets = useMemo(
    () => (typeof customDates === "function" ? customDates() : customDates),
    [customDates, open],
  );
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [month, setMonth] = useState<Date>(
    () => selectedDateRange?.from ?? new Date(),
  );

  useEffect(() => {
    if (selectedDateRange?.from) {
      setMonth(selectedDateRange.from);
    }
  }, [selectedDateRange?.from]);

  useEffect(() => {
    if (hasSerializedDate(value) && selectedDateRange) {
      onChange(selectedDateRange);
    }
  }, [onChange, selectedDateRange, value]);

  const handleSelect = (selectedDate: DateRange | undefined) => {
    setCustomDateselected("");
    if (selectedDate?.from) {
      setMonth(selectedDate.from);
    }
    onChange(selectedDate);
  };

  const handleCustomDates = (
    customDateSelected: string,
    selectedDate: CompleteDateRange,
  ) => {
    setCustomDateselected(customDateSelected);
    setMonth(selectedDate.from);
    onChange(selectedDate);
  };

  return (
    <div className={cn("grid gap-2", className)} {...props}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            disabled={disabled}
            variant={"outline"}
            className={cn("justify-between bg-white px-3.5 py-2.5")}
          >
            {selectedDateRange?.from ? (
              selectedDateRange.to ? (
                <>
                  {format(selectedDateRange.from, "PPPP", { locale: es })} -{" "}
                  {format(selectedDateRange.to, "PPPP", { locale: es })}
                </>
              ) : (
                format(selectedDateRange.from, "PPPP", { locale: es })
              )
            ) : (
              <span>{placeholder}</span>
            )}
            <CalendarDays className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex flex-row">
            <div className="flex max-h-[350px] flex-col overflow-y-auto">
              {presets.map((customDate: CustomDate) => (
                <Button
                  key={customDate.name}
                  type="button"
                  variant="ghost"
                  className={cn("justify-start", {
                    "bg-accent text-accent-foreground":
                      customDateSelected === customDate.name,
                  })}
                  onClick={() => {
                    handleCustomDates(customDate.name, {
                      from: customDate.from,
                      to: customDate.to,
                    });
                  }}
                >
                  {customDate.name}
                </Button>
              ))}
            </div>
            <Calendar
              mode="range"
              month={month}
              onMonthChange={setMonth}
              selected={selectedDateRange}
              onSelect={handleSelect}
              fromYear={currentYear - 5}
              toYear={currentYear + 5}
              captionLayout="dropdown-buttons"
              locale={es}
              formatters={{
                formatCaption: (date, options) => {
                  return format(date, "MMMM yyyy", { locale: es });
                },
              }}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
