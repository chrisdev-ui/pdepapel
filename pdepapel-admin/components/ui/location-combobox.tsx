import { cn } from "@/lib/utils";
import { Command as CommandPrimitive } from "cmdk";
import { Check, MapPin } from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { Skeleton } from "./skeleton";

export interface LocationOption {
  value: string; // daneCode: "05001000"
  label: string; // "Medellín - Antioquia"
  city: string; // "Medellín"
  department: string; // "Antioquia"
  daneCode: string; // "05001000"
}

interface LocationComboboxProps {
  options: LocationOption[];
  value?: string; // daneCode
  onChange: (value: string, location?: LocationOption) => void;
  disabled?: boolean;
  placeholder?: string;
  isLoading?: boolean;
  emptyMessage?: string;
}

// Normalize text for search (remove accents, lowercase)
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export const LocationCombobox: React.FC<LocationComboboxProps> = ({
  options,
  value,
  onChange,
  disabled,
  placeholder = "Seleccionar ciudad...",
  isLoading = false,
  emptyMessage = "No se encontraron ciudades.",
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setOpen] = useState(false);
  const [selected, setSelected] = useState<LocationOption | undefined>(() =>
    options.find((location) => location.value === value),
  );
  const [inputValue, setInputValue] = useState<string>(selected?.label || "");

  // Defer the input value to prevent blocking the UI
  const deferredInputValue = useDeferredValue(inputValue);

  // Memoize filtered results to avoid re-filtering on every render
  const filteredOptions = useMemo(() => {
    // Show first 50 results if input is empty or too short
    if (!deferredInputValue || deferredInputValue.trim().length < 2) {
      return options.slice(0, 50);
    }

    const normalized = normalizeText(deferredInputValue);

    // Filter and limit to 100 results for performance
    const matches = options.filter((option) => {
      const normalizedCity = normalizeText(option.city);
      const normalizedDepartment = normalizeText(option.department);
      const normalizedDaneCode = option.daneCode;

      return (
        normalizedCity.includes(normalized) ||
        normalizedDepartment.includes(normalized) ||
        normalizedDaneCode.includes(normalized)
      );
    });

    // Prioritize exact matches and matches at the beginning
    matches.sort((a, b) => {
      const aCityNorm = normalizeText(a.city);
      const bCityNorm = normalizeText(b.city);

      // Exact match comes first
      if (aCityNorm === normalized) return -1;
      if (bCityNorm === normalized) return 1;

      // Starts with query comes next
      if (aCityNorm.startsWith(normalized)) return -1;
      if (bCityNorm.startsWith(normalized)) return 1;

      // Alphabetical order
      return a.city.localeCompare(b.city);
    });

    return matches.slice(0, 100);
  }, [options, deferredInputValue]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const input = inputRef.current;
      if (!input) {
        return;
      }

      // Keep the options displayed when the user is typing
      if (!isOpen) {
        setOpen(true);
      }

      // This is not a default behaviour of the <input /> field
      if (event.key === "Enter" && input.value !== "") {
        const optionToSelect = filteredOptions.find(
          (option) => option.label === input.value,
        );
        if (optionToSelect) {
          setSelected(optionToSelect);
          onChange(optionToSelect.value, optionToSelect);
        }
      }

      if (event.key === "Escape") {
        input.blur();
      }
    },
    [isOpen, filteredOptions, onChange],
  );

  const handleBlur = useCallback(() => {
    setOpen(false);
    setInputValue(selected?.label || "");
  }, [selected]);

  const handleSelectOption = useCallback(
    (selectedOption: LocationOption) => {
      setInputValue(selectedOption.label);
      setSelected(selectedOption);
      onChange(selectedOption.value, selectedOption);

      // This is a hack to prevent the input from being focused after the user selects an option
      // We can call this hack: "The next tick"
      setTimeout(() => {
        inputRef?.current?.blur();
      }, 0);
    },
    [onChange],
  );

  return (
    <CommandPrimitive onKeyDown={handleKeyDown}>
      <div>
        <CommandInput
          ref={inputRef}
          value={inputValue}
          onValueChange={isLoading ? undefined : setInputValue}
          onBlur={handleBlur}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
        />
      </div>
      <div className="relative mt-1">
        <div
          className={cn(
            "absolute top-0 z-10 w-full rounded-xl bg-white outline-none animate-in fade-in-0 zoom-in-95",
            isOpen ? "block" : "hidden",
          )}
        >
          <CommandList className="rounded-lg ring-1 ring-slate-200">
            {isLoading ? (
              <CommandPrimitive.Loading>
                <div className="p-1">
                  <Skeleton className="h-8 w-full" />
                </div>
              </CommandPrimitive.Loading>
            ) : null}
            {filteredOptions.length > 0 && !isLoading ? (
              <CommandGroup className="max-h-[300px]">
                {filteredOptions.map((location) => {
                  const isSelected = selected?.value === location.value;
                  return (
                    <CommandItem
                      key={location.value}
                      value={`${location.city} ${location.department} ${location.daneCode}`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onSelect={() => handleSelectOption(location)}
                      className={cn(
                        "flex w-full items-start gap-2",
                        !isSelected ? "pl-8" : null,
                      )}
                    >
                      {isSelected ? (
                        <Check className="mt-1 h-4 w-4 shrink-0" />
                      ) : null}
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate font-medium">
                            {location.city}
                          </span>
                        </div>
                        <span className="truncate pl-5 text-xs text-muted-foreground">
                          {location.department} • DANE: {location.daneCode}
                        </span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}
            {!isLoading ? (
              <CommandPrimitive.Empty className="select-none rounded-sm px-2 py-3 text-center text-sm">
                {emptyMessage}
              </CommandPrimitive.Empty>
            ) : null}
          </CommandList>
        </div>
      </div>
    </CommandPrimitive>
  );
};
