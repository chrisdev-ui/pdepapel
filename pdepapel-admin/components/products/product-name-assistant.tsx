"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_NAME_RECOMMENDED_MAX_LENGTH,
  buildProductNameSuggestion,
} from "@/lib/product-naming";
import type { ProductImageAnalysis } from "@/lib/product-image-analysis";
import {
  Check,
  Lightbulb,
  Loader2,
  Plus,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type VisualAttributeType = "color" | "design";

type CreatedVisualAttribute = {
  id: string;
  name: string;
  value?: string;
};

type PendingVisualAttribute = {
  type: VisualAttributeType;
  name: string;
  colorHex?: string;
};

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
  storeId?: string | string[];
  imageUrls?: string[];
  onApply: (name: string) => void;
  onApplyVisualAnalysis?: (analysis: ProductImageAnalysis) => void;
  onCreateVisualAttribute?: (
    attribute: PendingVisualAttribute,
  ) => Promise<CreatedVisualAttribute>;
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
  storeId,
  imageUrls = [],
  onApply,
  onApplyVisualAnalysis,
  onCreateVisualAttribute,
}: ProductNameAssistantProps) {
  const [baseName, setBaseName] = useState(currentName || "");
  const [wasApplied, setWasApplied] = useState(false);
  const [includeColorInName, setIncludeColorInName] = useState(false);
  const [includeDesignInName, setIncludeDesignInName] = useState(false);
  const [visualAnalysis, setVisualAnalysis] =
    useState<ProductImageAnalysis | null>(null);
  const [visualAnalysisError, setVisualAnalysisError] = useState<string | null>(
    null,
  );
  const [isAnalyzingImages, setIsAnalyzingImages] = useState(false);
  const [remainingAnalysesToday, setRemainingAnalysesToday] = useState<
    number | null
  >(null);
  const [reusedVisualAnalysis, setReusedVisualAnalysis] = useState(false);
  const [pendingVisualAttribute, setPendingVisualAttribute] =
    useState<PendingVisualAttribute | null>(null);
  const [isCreatingVisualAttribute, setIsCreatingVisualAttribute] =
    useState(false);

  useEffect(() => {
    setBaseName(currentName || "");
    setWasApplied(false);
  }, [currentName]);

  const visualImageUrls = useMemo(
    () => Array.from(new Set(imageUrls.filter(Boolean))).slice(0, 3),
    [imageUrls],
  );
  const normalizedStoreId = Array.isArray(storeId) ? storeId[0] : storeId;
  const canAnalyzeImages = Boolean(
    normalizedStoreId && visualImageUrls.length > 0 && onApplyVisualAnalysis,
  );

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
        includeColorInName,
        includeDesignInName,
      }),
    [
      baseName,
      brand,
      categoryName,
      colorName,
      designName,
      includeColorInName,
      includeDesignInName,
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

  const analyzeImages = async () => {
    if (!normalizedStoreId || visualImageUrls.length === 0) return;

    setIsAnalyzingImages(true);
    setVisualAnalysisError(null);

    try {
      const response = await fetch(
        `/api/${normalizedStoreId}/products/image-analysis`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrls: visualImageUrls,
            categoryName,
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload.error || "No se pudo analizar las imágenes en este momento.",
        );
      }

      setVisualAnalysis(payload.analysis);
      setRemainingAnalysesToday(payload.remainingAnalysesToday ?? null);
      setReusedVisualAnalysis(payload.reusedAnalysis === true);
    } catch (error) {
      setVisualAnalysisError(
        error instanceof Error
          ? error.message
          : "No se pudo analizar las imágenes en este momento.",
      );
    } finally {
      setIsAnalyzingImages(false);
    }
  };

  const loadVisualProposal = () => {
    if (!visualAnalysis) return;

    if (visualAnalysis.suggestedBaseName) {
      setBaseName(visualAnalysis.suggestedBaseName);
    }
    onApplyVisualAnalysis?.(visualAnalysis);
    setWasApplied(false);
  };

  const createVisualAttribute = async () => {
    if (!pendingVisualAttribute || !onCreateVisualAttribute) return;

    setIsCreatingVisualAttribute(true);
    setVisualAnalysisError(null);

    try {
      const createdAttribute = await onCreateVisualAttribute(
        pendingVisualAttribute,
      );

      setVisualAnalysis((current) => {
        if (!current) return current;

        if (pendingVisualAttribute.type === "color") {
          return {
            ...current,
            colorId: createdAttribute.id,
            colorName: createdAttribute.name,
            colorHex: createdAttribute.value ?? current.colorHex,
            colorSource: "existing",
          };
        }

        return {
          ...current,
          designId: createdAttribute.id,
          designName: createdAttribute.name,
          designSource: "existing",
        };
      });
      setPendingVisualAttribute(null);
    } catch (error) {
      setVisualAnalysisError(
        error instanceof Error
          ? error.message
          : "No se pudo crear esta característica.",
      );
    } finally {
      setIsCreatingVisualAttribute(false);
    }
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

      {includeVariantAttributes && (colorName || designName) && (
        <div className="rounded-md border bg-background/70 p-3">
          <p className="text-xs font-medium">Características para el nombre</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Actívalas solo si la clienta puede reconocerlas y recibe una
            variante distinta por esa característica. Los campos siguen
            guardándose para inventario y SKU aunque no se añadan al nombre.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {colorName && (
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox
                  checked={includeColorInName}
                  disabled={disabled}
                  onCheckedChange={(checked) => {
                    setIncludeColorInName(checked === true);
                    setWasApplied(false);
                  }}
                />
                <span>Incluir color: {colorName}</span>
              </label>
            )}
            {designName && (
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox
                  checked={includeDesignInName}
                  disabled={disabled}
                  onCheckedChange={(checked) => {
                    setIncludeDesignInName(checked === true);
                    setWasApplied(false);
                  }}
                />
                <span>Incluir diseño: {designName}</span>
              </label>
            )}
          </div>
        </div>
      )}

      <div className="rounded-md border bg-background/70 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <ScanSearch className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-xs font-medium">Analizar fotos con IA</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Propone un borrador a partir de hasta tres fotos. No guarda ni
                modifica el producto automáticamente.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || !canAnalyzeImages || isAnalyzingImages}
            onClick={analyzeImages}
          >
            {isAnalyzingImages ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ScanSearch className="mr-2 h-4 w-4" />
            )}
            Analizar fotos
          </Button>
        </div>

        {!canAnalyzeImages && (
          <p className="mt-3 text-xs text-muted-foreground">
            Sube al menos una imagen del producto para activar esta ayuda.
          </p>
        )}

        {visualAnalysisError && (
          <p className="mt-3 text-xs font-medium text-destructive" role="alert">
            {visualAnalysisError}
          </p>
        )}

        {visualAnalysis && (
          <div className="mt-3 space-y-3 rounded-md border bg-background p-3 text-xs">
            <div className="space-y-1">
              <p className="font-medium">Propuesta visual para revisar</p>
              {visualAnalysis.suggestedBaseName ? (
                <p>
                  <span className="text-muted-foreground">Nombre base: </span>
                  <span className="font-medium">
                    {visualAnalysis.suggestedBaseName}
                  </span>
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Las fotos no permiten confirmar un nombre base.
                </p>
              )}
              {(visualAnalysis.brand ||
                visualAnalysis.colorName ||
                visualAnalysis.designName) && (
                <div className="space-y-1 text-muted-foreground">
                  {visualAnalysis.brand && (
                    <p>Marca visible: {visualAnalysis.brand}</p>
                  )}
                  {visualAnalysis.colorName && (
                    <p>
                      Color: {visualAnalysis.colorName}
                      {visualAnalysis.colorSource === "existing"
                        ? " · existente"
                        : visualAnalysis.colorSource === "new"
                          ? " · nuevo propuesto"
                          : " · requiere revisión"}
                    </p>
                  )}
                  {visualAnalysis.designName && (
                    <p>
                      Diseño: {visualAnalysis.designName}
                      {visualAnalysis.designSource === "existing"
                        ? " · existente"
                        : visualAnalysis.designSource === "new"
                          ? " · nuevo propuesto"
                          : " · requiere revisión"}
                    </p>
                  )}
                </div>
              )}
            </div>

            {onCreateVisualAttribute &&
              (visualAnalysis.colorSource === "new" ||
                visualAnalysis.designSource === "new") && (
                <div className="flex flex-col gap-2 rounded-md border border-dashed p-2 sm:flex-row sm:flex-wrap">
                  {visualAnalysis.colorSource === "new" &&
                    visualAnalysis.colorName &&
                    visualAnalysis.colorHex && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disabled || isCreatingVisualAttribute}
                        onClick={() =>
                          setPendingVisualAttribute({
                            type: "color",
                            name: visualAnalysis.colorName!,
                            colorHex: visualAnalysis.colorHex!,
                          })
                        }
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Crear y usar color
                      </Button>
                    )}
                  {visualAnalysis.designSource === "new" &&
                    visualAnalysis.designName && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disabled || isCreatingVisualAttribute}
                        onClick={() =>
                          setPendingVisualAttribute({
                            type: "design",
                            name: visualAnalysis.designName!,
                          })
                        }
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Crear y usar diseño
                      </Button>
                    )}
                </div>
              )}

            {visualAnalysis.observations.length > 0 && (
              <ul className="space-y-1 text-muted-foreground">
                {visualAnalysis.observations.map((observation) => (
                  <li key={observation}>• {observation}</li>
                ))}
              </ul>
            )}

            {visualAnalysis.limitations.length > 0 && (
              <p className="text-amber-700">
                Revisa: {visualAnalysis.limitations.join(" · ")}
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground">
                Cargar la propuesta solo rellena este formulario; todavía puedes
                editarla antes de guardar.
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={disabled}
                onClick={loadVisualProposal}
              >
                Cargar propuesta
              </Button>
            </div>
          </div>
        )}

        {remainingAnalysesToday !== null && (
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            {reusedVisualAnalysis && (
              <p>
                Se reutilizó la propuesta de estas mismas fotos: no consumió un
                análisis adicional.
              </p>
            )}
            <p>Quedan {remainingAnalysesToday} análisis visuales hoy.</p>
          </div>
        )}
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

      <AlertDialog
        open={Boolean(pendingVisualAttribute)}
        onOpenChange={(open) => {
          if (!open && !isCreatingVisualAttribute) {
            setPendingVisualAttribute(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Crear{" "}
              {pendingVisualAttribute?.type === "color" ? "color" : "diseño"}{" "}
              nuevo?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se agregará “{pendingVisualAttribute?.name}” al catálogo de la
              tienda y se seleccionará en este formulario. Todavía tendrás que
              guardar el producto por separado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCreatingVisualAttribute}>
              Revisar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isCreatingVisualAttribute}
              onClick={(event) => {
                event.preventDefault();
                void createVisualAttribute();
              }}
            >
              {isCreatingVisualAttribute ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Crear y usar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
