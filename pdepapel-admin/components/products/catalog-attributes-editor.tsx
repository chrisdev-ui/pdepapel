"use client";

import { Check, Plus, Trash } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type EditableCatalogAttribute = {
  key: string;
  name: string;
  value: string;
  evidence: string;
};

export type CatalogOptionSuggestion = {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  categoryIds: string[];
  usageCount: number;
  values: Array<{
    id: string;
    name: string;
    value: string;
    usageCount: number;
  }>;
};

type InputSuggestion = {
  id: string;
  label: string;
  searchText: string;
  description?: string;
  disabled?: boolean;
};

function normalizeForMatch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CO")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function SuggestionInput({
  id,
  value,
  ariaLabel,
  placeholder,
  suggestions,
  disabled,
  newEntryLabel,
  onChange,
  onSelect,
}: {
  id: string;
  value: string;
  ariaLabel: string;
  placeholder: string;
  suggestions: InputSuggestion[];
  disabled?: boolean;
  newEntryLabel: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: InputSuggestion) => void;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedValue = normalizeForMatch(value);
  const filteredSuggestions = useMemo(() => {
    const matching = normalizedValue
      ? suggestions.filter((suggestion) =>
          normalizeForMatch(suggestion.searchText).includes(normalizedValue),
        )
      : suggestions;

    return matching.slice(0, 8);
  }, [normalizedValue, suggestions]);
  const exactSuggestion = suggestions.find(
    (suggestion) => normalizeForMatch(suggestion.label) === normalizedValue,
  );

  const selectSuggestion = (suggestion: InputSuggestion) => {
    if (suggestion.disabled) return;
    onSelect(suggestion);
    setOpen(false);
    setActiveIndex(0);
  };

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={
          open && filteredSuggestions[activeIndex]
            ? `${listboxId}-${filteredSuggestions[activeIndex].id}`
            : undefined
        }
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          if (exactSuggestion && !exactSuggestion.disabled) {
            selectSuggestion(exactSuggestion);
          }
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) =>
              Math.min(current + 1, filteredSuggestions.length - 1),
            );
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => Math.max(current - 1, 0));
          }
          if (event.key === "Enter" && open) {
            const activeSuggestion = filteredSuggestions[activeIndex];
            if (activeSuggestion && !activeSuggestion.disabled) {
              event.preventDefault();
              selectSuggestion(activeSuggestion);
            }
          }
          if (event.key === "Escape") setOpen(false);
        }}
      />
      {open && !disabled && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {filteredSuggestions.map((suggestion, index) => (
            <button
              id={`${listboxId}-${suggestion.id}`}
              key={suggestion.id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              disabled={suggestion.disabled}
              className={cn(
                "flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left text-sm outline-none hover:bg-accent focus:bg-accent",
                index === activeIndex && "bg-accent",
                suggestion.disabled && "cursor-not-allowed opacity-50",
              )}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => selectSuggestion(suggestion)}
            >
              <Check
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  normalizeForMatch(suggestion.label) === normalizedValue
                    ? "opacity-100"
                    : "opacity-0",
                )}
              />
              <span className="min-w-0">
                <span className="block font-medium">{suggestion.label}</span>
                {suggestion.description && (
                  <span className="block text-xs text-muted-foreground">
                    {suggestion.description}
                  </span>
                )}
              </span>
            </button>
          ))}
          {filteredSuggestions.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              No hay coincidencias existentes.
            </p>
          )}
          {value.trim() && !exactSuggestion && (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              {newEntryLabel}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function CatalogAttributesEditor({
  value,
  options,
  categoryId,
  disabled,
  maxAttributes = 8,
  onChange,
}: {
  value: EditableCatalogAttribute[];
  options: CatalogOptionSuggestion[];
  categoryId?: string;
  disabled?: boolean;
  maxAttributes?: number;
  onChange: (value: EditableCatalogAttribute[]) => void;
}) {
  const sortedOptions = useMemo(
    () =>
      [...options].sort((left, right) => {
        const leftCategoryMatch = Number(
          Boolean(categoryId && left.categoryIds.includes(categoryId)),
        );
        const rightCategoryMatch = Number(
          Boolean(categoryId && right.categoryIds.includes(categoryId)),
        );

        return (
          rightCategoryMatch - leftCategoryMatch ||
          Number(right.isActive) - Number(left.isActive) ||
          right.usageCount - left.usageCount ||
          left.name.localeCompare(right.name, "es-CO")
        );
      }),
    [categoryId, options],
  );

  const resolveOption = (attribute: EditableCatalogAttribute) => {
    const normalizedKey = normalizeForMatch(attribute.key || attribute.name);
    const normalizedName = normalizeForMatch(attribute.name);

    return sortedOptions.find(
      (option) =>
        normalizeForMatch(option.key) === normalizedKey ||
        normalizeForMatch(option.name) === normalizedName,
    );
  };

  const usedOptionKeys = value.map((attribute) =>
    normalizeForMatch(
      resolveOption(attribute)?.key || attribute.key || attribute.name,
    ),
  );
  const duplicateIndices = new Set<number>();
  const firstIndexByKey = new Map<string, number>();
  usedOptionKeys.forEach((key, index) => {
    if (!key) return;
    if (firstIndexByKey.has(key)) {
      duplicateIndices.add(index);
      return;
    }
    firstIndexByKey.set(key, index);
  });
  const unusedRecommendedOptions = sortedOptions
    .filter(
      (option) =>
        !usedOptionKeys.includes(normalizeForMatch(option.key)) &&
        (!categoryId || option.categoryIds.includes(categoryId)),
    )
    .slice(0, 4);

  const updateAttribute = (
    index: number,
    attribute: EditableCatalogAttribute,
  ) => {
    const next = [...value];
    next[index] = attribute;
    onChange(next);
  };

  const addCanonicalOption = (option: CatalogOptionSuggestion) => {
    if (value.length >= maxAttributes) return;
    onChange([
      ...value,
      {
        key: option.key,
        name: option.name,
        value: "",
        evidence: "Confirmado manualmente por administración",
      },
    ]);
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <p className="text-sm font-semibold">Opciones visibles para clientes</p>
        <p className="text-xs text-muted-foreground">
          Reutiliza características y valores existentes para evitar nombres
          duplicados. Crea uno nuevo solo cuando ninguna sugerencia corresponda.
        </p>
      </div>

      {unusedRecommendedOptions.length > 0 && value.length < maxAttributes && (
        <div className="space-y-2 rounded-md bg-muted/40 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Sugeridas para esta sub-categoría
          </p>
          <div className="flex flex-wrap gap-2">
            {unusedRecommendedOptions.map((option) => (
              <Button
                key={option.id}
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => addCanonicalOption(option)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {option.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {value.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Este producto todavía no tiene opciones comerciales.
        </p>
      )}

      <div className="space-y-3">
        {value.map((attribute, index) => {
          const selectedOption = resolveOption(attribute);
          const selectedKey = normalizeForMatch(
            selectedOption?.key || attribute.key || attribute.name,
          );
          const hasDuplicate =
            duplicateIndices.has(index) && Boolean(selectedKey);
          const featureSuggestions = sortedOptions.map((option) => {
            const alreadyUsed = usedOptionKeys.some(
              (key, itemIndex) =>
                itemIndex !== index && key === normalizeForMatch(option.key),
            );
            const categoryMatch = Boolean(
              categoryId && option.categoryIds.includes(categoryId),
            );

            return {
              id: option.id,
              label: option.name,
              searchText: `${option.name} ${option.key}`,
              description: alreadyUsed
                ? "Ya agregada a este producto"
                : categoryMatch
                  ? `Usada en esta sub-categoría · ${option.usageCount} producto${option.usageCount === 1 ? "" : "s"}`
                  : `${option.usageCount} producto${option.usageCount === 1 ? "" : "s"}`,
              disabled: alreadyUsed,
            };
          });
          const valueSuggestions =
            selectedOption?.values.map((optionValue) => ({
              id: optionValue.id,
              label: optionValue.name,
              searchText: `${optionValue.name} ${optionValue.value}`,
              description: `${optionValue.usageCount} producto${optionValue.usageCount === 1 ? "" : "s"}`,
            })) ?? [];

          return (
            <div
              key={index}
              className={cn(
                "grid gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]",
                hasDuplicate && "border-destructive",
              )}
            >
              <div className="space-y-1.5">
                <label
                  htmlFor={`catalog-attribute-name-${index}`}
                  className="text-xs font-medium"
                >
                  Característica
                </label>
                <SuggestionInput
                  id={`catalog-attribute-name-${index}`}
                  ariaLabel={`Nombre de característica ${index + 1}`}
                  value={attribute.name}
                  disabled={disabled}
                  placeholder="Ej. Formato"
                  suggestions={featureSuggestions}
                  newEntryLabel={`“${attribute.name}” se creará al guardar el producto.`}
                  onChange={(name) =>
                    updateAttribute(index, {
                      ...attribute,
                      key: name,
                      name,
                    })
                  }
                  onSelect={(suggestion) => {
                    const option = sortedOptions.find(
                      (item) => item.id === suggestion.id,
                    );
                    if (!option) return;
                    const sameOption = selectedOption?.id === option.id;
                    updateAttribute(index, {
                      ...attribute,
                      key: option.key,
                      name: option.name,
                      value: sameOption ? attribute.value : "",
                    });
                  }}
                />
                <div className="flex min-h-5 items-center gap-2">
                  {selectedOption ? (
                    <Badge variant="secondary">Existente</Badge>
                  ) : attribute.name.trim() ? (
                    <Badge variant="outline">Nueva</Badge>
                  ) : null}
                  {hasDuplicate && (
                    <span className="text-xs text-destructive">
                      Esta característica ya está agregada.
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor={`catalog-attribute-value-${index}`}
                  className="text-xs font-medium"
                >
                  Valor
                </label>
                <SuggestionInput
                  id={`catalog-attribute-value-${index}`}
                  ariaLabel={`Valor de característica ${index + 1}`}
                  value={attribute.value}
                  disabled={disabled}
                  placeholder={
                    selectedOption
                      ? `Buscar valores de ${selectedOption.name}`
                      : "Ej. A5"
                  }
                  suggestions={valueSuggestions}
                  newEntryLabel={`“${attribute.value}” se agregará a ${selectedOption?.name || attribute.name || "la característica"} al guardar.`}
                  onChange={(nextValue) =>
                    updateAttribute(index, {
                      ...attribute,
                      value: nextValue,
                    })
                  }
                  onSelect={(suggestion) =>
                    updateAttribute(index, {
                      ...attribute,
                      value: suggestion.label,
                    })
                  }
                />
                <p className="min-h-5 text-xs text-muted-foreground">
                  {selectedOption
                    ? valueSuggestions.length > 0
                      ? `${valueSuggestions.length} valor${valueSuggestions.length === 1 ? "" : "es"} existente${valueSuggestions.length === 1 ? "" : "s"}`
                      : "Esta característica todavía no tiene valores guardados."
                    : "Elige una característica existente para ver sus valores."}
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="icon"
                className="self-end sm:mb-5"
                disabled={disabled}
                aria-label={`Quitar característica ${attribute.name || index + 1}`}
                onClick={() =>
                  onChange(value.filter((_, itemIndex) => itemIndex !== index))
                }
              >
                <Trash className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        disabled={disabled || value.length >= maxAttributes}
        onClick={() =>
          onChange([
            ...value,
            {
              key: "",
              name: "",
              value: "",
              evidence: "Confirmado manualmente por administración",
            },
          ])
        }
      >
        <Plus className="mr-2 h-4 w-4" />
        Agregar otra característica
      </Button>
      <p className="text-xs text-muted-foreground">
        Las opciones nuevas no se crean hasta guardar el producto.
      </p>
    </div>
  );
}
