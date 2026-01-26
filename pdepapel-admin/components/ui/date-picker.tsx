"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { addDays, format, isValid } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Control,
  FieldPath,
  FieldValues,
  useController,
} from "react-hook-form";

export interface CustomSingleDate {
  name: string;
  value: Date;
}

interface DatePickerProps<T extends FieldValues> {
  readonly placeholder?: string;
  readonly name: FieldPath<T>;
  readonly control: Control<T>;
  readonly disabled?: boolean;
  readonly needFutureYears?: number;
  readonly customDates?: CustomSingleDate[];
}

export function DatePicker<T extends FieldValues>({
  placeholder,
  name,
  control,
  disabled = false,
  needFutureYears = 2,
  className,
  customDates,
}: DatePickerProps<T> & { className?: string }) {
  const [customDateSelected, setCustomDateselected] = useState<string>("");

  const {
    field: { value, onChange },
  } = useController({ name, control });

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  // Handle potential string values from persisted state (localStorage) or serialization
  const dateValue = useMemo(() => {
    if (!value) return undefined;
    if ((value as any) instanceof Date) return value;
    if (typeof value === "string") {
      const parsed = new Date(value);
      return isValid(parsed) ? parsed : undefined;
    }
    return undefined;
  }, [value]);

  const defaultPresets = useMemo<CustomSingleDate[]>(
    () => [
      { name: "Hoy", value: new Date() },
      { name: "Mañana", value: addDays(new Date(), 1) },
      { name: "En 3 días", value: addDays(new Date(), 3) },
      { name: "En una semana", value: addDays(new Date(), 7) },
      { name: "En 2 semanas", value: addDays(new Date(), 14) },
      { name: "En 30 días", value: addDays(new Date(), 30) },
    ],
    [],
  );

  const presets = customDates || defaultPresets;

  const handleSelect = (selectedDate: Date | undefined) => {
    setCustomDateselected("");
    onChange(selectedDate);
  };

  const handleCustomDateSelect = (name: string, value: Date) => {
    setCustomDateselected(name);
    onChange(value);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          disabled={disabled}
          variant={"outline"}
          className={cn(
            "w-[280px] items-center justify-between text-left font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          {dateValue && isValid(dateValue) ? (
            format(dateValue, "PPP", { locale: es })
          ) : (
            <span>{placeholder}</span>
          )}
          <CalendarDays className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-row">
          <div className="flex max-h-[350px] flex-col overflow-y-auto border-r p-2">
            {presets.map((preset) => (
              <Button
                key={preset.name}
                variant="ghost"
                className={cn("justify-start font-normal", {
                  "bg-accent text-accent-foreground":
                    customDateSelected === preset.name,
                })}
                onClick={() =>
                  handleCustomDateSelect(preset.name, preset.value)
                }
              >
                {preset.name}
              </Button>
            ))}
          </div>
          <div className="rounded-md">
            <Calendar
              mode="single"
              selected={dateValue}
              onSelect={handleSelect}
              fromYear={currentYear - needFutureYears}
              toYear={currentYear + needFutureYears}
              captionLayout="dropdown-buttons"
              locale={es}
              formatters={{
                formatCaption: (date, options) => {
                  return format(date, "MMMM yyyy", { locale: es });
                },
              }}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
