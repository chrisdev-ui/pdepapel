import { filterLocations, findExactLocation } from "@/lib/location-search";
import { cn } from "@/lib/utils";
import { LocationOption } from "@/types";
import { Command as CommandPrimitive } from "cmdk";
import { Check, MapPin, X } from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Button } from "./button";
import {
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { Skeleton } from "./skeleton";

interface AutocompleteLocationProps {
  options: LocationOption[];
  value?: string; // daneCode
  onChange: (value: string, location?: LocationOption) => void;
  onClear?: () => void;
  disabled?: boolean;
  placeholder?: string;
  isLoading?: boolean;
  onSearch?: (value: string) => void;
  emptyMessage?: string;
  /** Lo que se ofrece debajo de «No se encontraron ciudades» (p. ej. WhatsApp). */
  emptyAction?: ReactNode;
  /** Aviso bajo el campo cuando hay texto escrito pero ninguna ciudad elegida. */
  unselectedHint?: string;
  defaultDisplayValue?: string;
  /**
   * Accessible name of the text input. cmdk owns the input's id and
   * `aria-labelledby`, so a visible `<FormLabel htmlFor>` cannot reach it;
   * this renders cmdk's own visually hidden label instead.
   */
  label?: string;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export const AutocompleteLocation: React.FC<AutocompleteLocationProps> = ({
  options,
  value,
  onChange,
  onSearch,
  onClear,
  disabled,
  placeholder = "Seleccionar ciudad...",
  isLoading = false,
  emptyMessage = "No se encontraron ciudades.",
  emptyAction,
  unselectedHint = "Toca tu ciudad en la lista para elegirla.",
  defaultDisplayValue,
  label = "Ciudad y departamento",
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const hintId = useId();

  const [isOpen, setOpen] = useState(false);
  const [selected, setSelected] = useState<LocationOption | undefined>(
    () => options?.find((location) => location.value === value),
  );
  const [inputValue, setInputValue] = useState<string>(
    selected?.label || defaultDisplayValue || "",
  );
  const [showHint, setShowHint] = useState(false);

  // El valor que este mismo campo acaba de soltar al editar el texto: ese
  // cambio a vacío no debe borrar lo que la persona está escribiendo.
  const releasedByTypingRef = useRef(false);
  const previousValueRef = useRef(value);

  const deferredInputValue = useDeferredValue(inputValue);

  // Solo dos cosas cambian el texto desde fuera: llega la ciudad guardada
  // (al volver al checkout) o alguien la borra. Nunca la llegada de
  // resultados: antes eso vaciaba el campo en cada letra.
  useEffect(() => {
    const previous = previousValueRef.current;
    previousValueRef.current = value;

    if (value) {
      const matchedLocation = options?.find((location) => location.value === value);
      if (matchedLocation && matchedLocation.value !== selected?.value) {
        setSelected(matchedLocation);
        setInputValue(matchedLocation.label);
      } else if (!matchedLocation && value !== previous && defaultDisplayValue) {
        // Ciudad puesta desde fuera (dirección guardada) que no está en la lista visible.
        setInputValue(defaultDisplayValue);
      }
      return;
    }

    if (previous && !value) {
      if (releasedByTypingRef.current) {
        releasedByTypingRef.current = false;
        return;
      }
      setSelected(undefined);
      setInputValue("");
    }
  }, [value, options, selected?.value, defaultDisplayValue]);

  const filteredOptions = useMemo(() => {
    const list = options ?? [];
    if (!deferredInputValue || deferredInputValue.trim().length < 2 || selected?.label === deferredInputValue) {
      return list.slice(0, 50);
    }
    return filterLocations(list, deferredInputValue).slice(0, 100);
  }, [options, deferredInputValue, selected?.label]);

  const selectOption = useCallback(
    (option: LocationOption) => {
      setInputValue(option.label);
      setSelected(option);
      setShowHint(false);
      onChange(option.value, option);
    },
    [onChange],
  );

  /** Si lo escrito es exactamente una ciudad de la lista, se elige sola. */
  const selectExactMatch = useCallback(() => {
    const exact = findExactLocation(options ?? [], inputValue);
    if (exact) {
      selectOption(exact);
      return true;
    }
    return false;
  }, [inputValue, options, selectOption]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const input = inputRef.current;
      if (!input) return;

      if (!isOpen) setOpen(true);

      if (event.key === "Enter" && input.value !== "" && selected?.label !== input.value) {
        const optionToSelect =
          filteredOptions.find((option) => option.label === input.value) ??
          findExactLocation(options ?? [], input.value);
        if (optionToSelect) {
          event.preventDefault();
          selectOption(optionToSelect);
        }
      }

      if (event.key === "Escape") input.blur();
    },
    [isOpen, filteredOptions, options, selected?.label, selectOption],
  );

  const handleBlur = useCallback(() => {
    setOpen(false);
    if (!inputValue.trim()) {
      setShowHint(false);
      return;
    }
    if (selected && selected.label === inputValue) return;
    // El texto se queda: borrarlo era lo que hacía que la ciudad «desapareciera».
    setShowHint(!selectExactMatch());
  }, [inputValue, selected, selectExactMatch]);

  const handleSelectOption = useCallback(
    (selectedOption: LocationOption) => {
      selectOption(selectedOption);
      // This is a hack to prevent the input from being focused after the user selects an option
      // We can call this hack: "The next tick"
      setTimeout(() => {
        inputRef?.current?.blur();
      }, 0);
    },
    [selectOption],
  );

  const handleValueChange = useCallback(
    (text: string) => {
      setInputValue(text);
      setShowHint(false);
      onSearch?.(text);
      // Al cambiar el texto de una ciudad ya elegida, esa ciudad deja de valer.
      if (selected && text !== selected.label) {
        setSelected(undefined);
        if (value) {
          releasedByTypingRef.current = true;
          onChange("", undefined);
        }
      }
    },
    [onChange, onSearch, selected, value],
  );

  const handleClear = useCallback(() => {
    setInputValue("");
    setSelected(undefined);
    setShowHint(false);
    onChange("", undefined);
    onClear?.();
    inputRef?.current?.focus();
  }, [onChange, onClear]);

  const describedBy = [ariaDescribedBy, showHint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <CommandPrimitive
      onKeyDown={handleKeyDown}
      shouldFilter={false}
      label={label}
    >
      <div className="relative">
        <CommandInput
          ref={inputRef}
          value={inputValue}
          onValueChange={handleValueChange}
          onBlur={handleBlur}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          id={id}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-describedby={describedBy}
          aria-invalid={ariaInvalid}
          autoCapitalize="words"
          className={selected || inputValue ? "pr-11" : undefined}
        />
        {(selected || inputValue) && !disabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Borrar ciudad"
            className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full p-0 hover:bg-muted"
            onClick={handleClear}
            // Fires before the input blur closes the list on touch screens.
            onPointerDown={(event) => event.preventDefault()}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
      {showHint && !isOpen ? (
        <p id={hintId} role="status" className="mt-1.5 text-sm font-medium text-blue-yankees">
          {unselectedHint}
        </p>
      ) : null}
      <div className="relative mt-1">
        <div
          id={listId}
          className={cn(
            "absolute top-0 z-10 w-full rounded-xl bg-white outline-none animate-in fade-in-0 zoom-in-95",
            isOpen ? "block" : "hidden",
          )}
        >
          <CommandList className="rounded-lg ring-1 ring-slate-200">
            {isLoading && filteredOptions.length === 0 ? (
              <CommandPrimitive.Loading>
                <div className="p-1">
                  <Skeleton className="h-8 w-full" />
                </div>
              </CommandPrimitive.Loading>
            ) : null}
            {filteredOptions.length > 0 ? (
              <CommandGroup className="max-h-[300px] overflow-y-auto">
                {filteredOptions.map((location) => {
                  const isSelected = selected?.value === location.value;
                  return (
                    <CommandItem
                      key={location.value}
                      value={`${location.city} ${location.department} ${location.daneCode}`}
                      // pointerdown covers mouse and touch: the input must not
                      // blur (and close the list) before the tap lands.
                      onPointerDown={(event) => {
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
                          {location.department}
                        </span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}
            {!isLoading ? (
              <CommandPrimitive.Empty className="select-none rounded-sm px-3 py-3 text-center text-sm">
                <p>{emptyMessage}</p>
                {emptyAction ? (
                  <div
                    className="mt-2"
                    // El enlace se toca antes de que el campo pierda el foco y cierre la lista.
                    onPointerDown={(event) => event.preventDefault()}
                  >
                    {emptyAction}
                  </div>
                ) : null}
              </CommandPrimitive.Empty>
            ) : null}
          </CommandList>
        </div>
      </div>
    </CommandPrimitive>
  );
};
