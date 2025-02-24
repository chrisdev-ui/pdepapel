"use client";

import { Command as CommandPrimitive } from "cmdk";
import { Check } from "lucide-react";
import Image from "next/image";
import { useCallback, useRef, useState, type KeyboardEvent } from "react";

import {
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, currencyFormatter } from "@/lib/utils";

export type Option = {
  value: string;
  label: string;
  price: number;
  image?: string;
} & { [key: string]: string | number | undefined };

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

  const [isOpen, setOpen] = useState(false);
  const [selectedValues, setSelectedValues] = useState<Option[]>(values);
  const [inputValue, setInputValue] = useState<string>("");

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
        />
      </div>
      <div className="relative mt-1">
        {isOpen && (
          <div className="absolute top-0 z-10 w-full rounded-xl bg-stone-50 outline-none animate-in fade-in-0 zoom-in-95">
            <CommandList className="rounded-lg ring-1 ring-slate-200">
              {isLoading ? (
                <CommandPrimitive.Loading>
                  <div className="p-1">
                    <Skeleton className="h-8 w-full" />
                  </div>
                </CommandPrimitive.Loading>
              ) : null}
              {options.length > 0 && !isLoading && (
                <CommandGroup>
                  {options.map((option) => {
                    const isSelected = multiSelect
                      ? selectedValues.some((val) => val.value === option.value)
                      : selectedValues[0]?.value === option.value;
                    return (
                      <CommandItem
                        key={option.value}
                        value={option.label}
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
                          {option.label}
                        </div>
                        {option.price && (
                          <span className="text-slate-500">
                            {currencyFormatter.format(option.price)}
                          </span>
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
