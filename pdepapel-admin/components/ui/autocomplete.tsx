"use client";

import { Command as CommandPrimitive } from "cmdk";
import { Archive, Check, Package, Percent } from "lucide-react";
import Image from "next/image";
import {
  useCallback,
  useEffect,
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
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, currencyFormatter } from "@/lib/utils";
import { Badge } from "./badge";

export type Option = {
  value: string;
  label: string;
  price: number;
  discountedPrice?: number;
  stock: number;
  image?: string;
  isAvailable: boolean;
  isArchived: boolean;
} & { [key: string]: string | number | undefined | boolean };

type AutoCompleteProps = {
  options: Option[];
  emptyMessage: string;
  values?: Option[];
  onValuesChange?: (values: Option[]) => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  multiSelect?: boolean;
};

export const AutoComplete = ({
  options,
  placeholder,
  emptyMessage,
  values = [],
  onValuesChange,
  disabled,
  isLoading = false,
  multiSelect = false,
}: AutoCompleteProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [isOpen, setOpen] = useState(false);
  const [selectedValues, setSelectedValues] = useState<Option[]>(values);
  const [inputValue, setInputValue] = useState<string>("");

  // Reset scroll position when search text changes
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [inputValue]);

  // Sync selectedValues when external values prop changes
  useEffect(() => {
    setSelectedValues(values);
  }, [values]);

  // Filter and sort options: matching items first, then non-matching
  const filteredOptions = useMemo(() => {
    if (!inputValue.trim()) return options;

    const searchTerm = inputValue.toLowerCase().trim();
    const matching: Option[] = [];
    const nonMatching: Option[] = [];

    options.forEach((option) => {
      if (option.label.toLowerCase().includes(searchTerm)) {
        matching.push(option);
      } else {
        nonMatching.push(option);
      }
    });

    return [...matching, ...nonMatching];
  }, [options, inputValue]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const input = inputRef.current;
      if (!input) return;

      if (!isOpen) setOpen(true);

      if (event.key === "Enter" && input.value !== "") {
        const optionToSelect = options.find(
          (option) => option.label === input.value,
        );
        if (optionToSelect) {
          if (multiSelect) {
            setSelectedValues((prev) => [...prev, optionToSelect]);
            onValuesChange?.([...selectedValues, optionToSelect]);
          } else {
            setSelectedValues([optionToSelect]);
            onValuesChange?.([optionToSelect]);
          }
        }
      }

      if (event.key === "Escape") input.blur();
    },
    [isOpen, options, multiSelect, onValuesChange, selectedValues],
  );

  const handleBlur = useCallback(() => {
    setOpen(false);
  }, []);

  const handleSelectOption = useCallback(
    (selectedOption: Option) => {
      setInputValue("");
      if (multiSelect) {
        const alreadySelected = selectedValues.some(
          (val) => val.value === selectedOption.value,
        );
        let newSelectedValues = [...selectedValues];

        if (alreadySelected) {
          newSelectedValues = newSelectedValues.filter(
            (val) => val.value !== selectedOption.value,
          );
        } else {
          newSelectedValues.push(selectedOption);
        }

        setSelectedValues(newSelectedValues);
        onValuesChange?.(newSelectedValues);
      } else {
        setSelectedValues([selectedOption]);
        onValuesChange?.([selectedOption]);
      }

      setTimeout(() => {
        inputRef?.current?.focus();
      }, 0);
    },
    [onValuesChange, selectedValues, multiSelect],
  );

  return (
    <CommandPrimitive onKeyDown={handleKeyDown} shouldFilter={false}>
      <div>
        <CommandInput
          ref={inputRef}
          value={inputValue}
          onValueChange={isLoading ? undefined : setInputValue}
          onBlur={handleBlur}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
        />
      </div>
      <div className="relative mt-1">
        {isOpen && (
          <div className="absolute top-0 z-10 w-full rounded-xl bg-stone-50 outline-none animate-in fade-in-0 zoom-in-95">
            <CommandList
              ref={listRef}
              className="rounded-lg ring-1 ring-slate-200"
            >
              {isLoading ? (
                <CommandPrimitive.Loading>
                  <div className="p-1">
                    <Skeleton className="h-8 w-full" />
                  </div>
                </CommandPrimitive.Loading>
              ) : null}
              {filteredOptions.length > 0 && !isLoading && (
                <CommandGroup>
                  {filteredOptions.map((option) => {
                    const isSelected = multiSelect
                      ? selectedValues.some((val) => val.value === option.value)
                      : selectedValues[0]?.value === option.value;
                    return (
                      <CommandItem
                        key={option.value}
                        value={option.label.replace(/"/g, "")}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onSelect={() => handleSelectOption(option)}
                        className={cn(
                          "flex w-full items-center gap-2",
                          option.price && "justify-between",
                          !isSelected && "pl-8",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {isSelected && <Check className="w-4" />}
                          {option.image && (
                            <Image
                              src={option.image}
                              alt={option.value}
                              width={36}
                              height={36}
                              className="rounded-md"
                              unoptimized
                            />
                          )}
                          <div className="flex flex-1 flex-col">
                            <span
                              className={cn(
                                "text-sm",
                                !option.isAvailable && "line-through",
                              )}
                            >
                              {option.label}
                            </span>
                            {(option.size ||
                              option.color ||
                              (option.design &&
                                option.design !== "Estándar")) && (
                              <span className="text-xs text-muted-foreground">
                                {[
                                  option.size && `Talla: ${option.size}`,
                                  option.color && `Color: ${option.color}`,
                                  option.design &&
                                    option.design !== "Estándar" &&
                                    `Diseño: ${option.design}`,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            )}
                            <div className="flex flex-wrap items-center gap-1">
                              {option.isArchived && (
                                <Badge
                                  variant="secondary"
                                  className="h-4 text-xs"
                                >
                                  <Archive className="mr-1 h-2 w-2" />
                                  Archivado
                                </Badge>
                              )}
                              {option.offerLabel && (
                                <Badge className="h-4 bg-green-600 text-xs hover:bg-green-700">
                                  <Percent className="mr-1 h-2 w-2" />
                                  {option.offerLabel}
                                </Badge>
                              )}
                              {option.stock === 0 && (
                                <Badge
                                  variant="destructive"
                                  className="h-4 text-xs"
                                >
                                  <Package className="mr-1 h-2 w-2" />
                                  Sin stock
                                </Badge>
                              )}
                              {option.stock > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  Stock: {option.stock}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {option.discountedPrice &&
                        option.discountedPrice < option.price ? (
                          <div className="flex flex-col items-end">
                            <span className="text-xs text-muted-foreground line-through">
                              {currencyFormatter(option.price)}
                            </span>
                            <span className="font-medium text-green-600">
                              {currencyFormatter(option.discountedPrice)}
                            </span>
                          </div>
                        ) : (
                          option.price && (
                            <span className="text-slate-500">
                              {currencyFormatter(option.price)}
                            </span>
                          )
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
              {!isLoading && (
                <CommandPrimitive.Empty className="select-none rounded-sm px-2 py-3 text-center text-sm">
                  {emptyMessage}
                </CommandPrimitive.Empty>
              )}
            </CommandList>
          </div>
        )}
      </div>
    </CommandPrimitive>
  );
};
