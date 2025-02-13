"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { useMemo } from "react";
import {
  Control,
  FieldPath,
  FieldValues,
  useController,
} from "react-hook-form";

interface DatePickerProps<T extends FieldValues> {
  readonly placeholder?: string;
  readonly name: FieldPath<T>;
  readonly control: Control<T>;
  readonly disabled?: boolean;
  readonly needFutureYears?: number;
}

export function DatePicker<T extends FieldValues>({
  placeholder,
  name,
  control,
  disabled = false,
  needFutureYears = 2,
}: DatePickerProps<T>) {
  const {
    field: { value, onChange },
  } = useController({ name, control });

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const handleSelect = (selectedDate: Date | undefined) => {
    onChange(selectedDate);
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
          )}
        >
          {value ? (
            format(value, "PPP", { locale: es })
          ) : (
            <span>{placeholder}</span>
          )}
          <CalendarDays className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-auto flex-col space-y-2 p-2">
        <Select
          onValueChange={(value) =>
            onChange(addDays(new Date(), parseInt(value)))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Escoge una opción" />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="0">Hoy</SelectItem>
            <SelectItem value="1">Mañana</SelectItem>
            <SelectItem value="3">En 3 días</SelectItem>
            <SelectItem value="7">En una semana</SelectItem>
            <SelectItem value="14">En 2 semanas</SelectItem>
            <SelectItem value="30">En 30 días</SelectItem>
          </SelectContent>
        </Select>
        <div className="rounded-md border">
          <Calendar
            mode="single"
            selected={value}
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
      </PopoverContent>
    </Popover>
  );
}
