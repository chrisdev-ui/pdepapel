"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_NAME_RECOMMENDED_MAX_LENGTH,
  buildProductNameSuggestion,
} from "@/lib/product-naming";
import { Check, Lightbulb, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ProductNameAssistantProps = {
  categoryName?: string | null;
  currentName?: string | null;
  brand?: string | null;
  designName?: string | null;
  colorName?: string | null;
  sizeName?: string | null;
  sizeValue?: string | null;
  includeVariantAttributes?: boolean;
  disabled?: boolean;
  onApply: (name: string) => void;
};

export function ProductNameAssistant({
  categoryName,
  currentName,
  brand,
  designName,
  colorName,
  sizeName,
  sizeValue,
  includeVariantAttributes = true,
  disabled = false,
  onApply,
}: ProductNameAssistantProps) {
  const [baseName, setBaseName] = useState(currentName || "");
  const [wasApplied, setWasApplied] = useState(false);

  useEffect(() => {
    setBaseName(currentName || "");
    setWasApplied(false);
  }, [currentName]);

  const suggestion = useMemo(
    () =>
      buildProductNameSuggestion({
        baseName,
        categoryName,
        brand,
        designName,
        colorName,
        sizeName,
        sizeValue,
        includeVariantAttributes,
      }),
    [
      baseName,
      brand,
      categoryName,
      colorName,
      designName,
      includeVariantAttributes,
      sizeName,
      sizeValue,
    ],
  );

  const applySuggestion = () => {
    if (!suggestion.name || suggestion.length > PRODUCT_NAME_MAX_LENGTH) return;
    onApply(suggestion.name);
    setWasApplied(true);
  };

  return (
    <section className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-2">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-semibold">Asistente de nombre</p>
            <p className="text-xs text-muted-foreground">
              Usa solo información confirmada del empaque. Puedes editar el
              resultado antes de guardar.
            </p>
          </div>
        </div>
        <span
          className={
            suggestion.length > PRODUCT_NAME_RECOMMENDED_MAX_LENGTH
              ? "text-xs font-medium text-amber-700"
              : "text-xs text-muted-foreground"
          }
        >
          {suggestion.length}/{PRODUCT_NAME_RECOMMENDED_MAX_LENGTH} recomendado
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
        <Input
          value={baseName}
          onChange={(event) => {
            setBaseName(event.target.value);
            setWasApplied(false);
          }}
          disabled={disabled}
          placeholder="Ej. cinta correctora lateral 5 mm x 6 m"
          aria-label="Nombre o detalle confirmado en el empaque"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={
            disabled ||
            !suggestion.name ||
            suggestion.length > PRODUCT_NAME_MAX_LENGTH
          }
          onClick={applySuggestion}
        >
          {wasApplied ? (
            <Check className="mr-2 h-4 w-4" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {wasApplied ? "Aplicado" : "Usar sugerencia"}
        </Button>
      </div>

      {suggestion.name && (
        <div className="rounded-md border bg-background px-3 py-2 text-sm">
          <span className="text-muted-foreground">Propuesta: </span>
          <span className="font-medium">{suggestion.name}</span>
        </div>
      )}

      {suggestion.warnings.length > 0 && (
        <ul className="space-y-1 text-xs text-amber-700">
          {suggestion.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
