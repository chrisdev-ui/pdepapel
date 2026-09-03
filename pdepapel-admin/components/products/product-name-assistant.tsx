"use client";

import { RichTextDisplay } from "@/components/editor/rich-text-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type {
  ProductImageAnalysis,
  ProductTaxonomyAlternative,
} from "@/lib/product-image-analysis";
import { DIMENSIONS, WEIGHTS } from "@/constants/sizes";
import { cn } from "@/lib/utils";
import {
  Barcode,
  Check,
  CircleAlert,
  FileText,
  Lightbulb,
  ListChecks,
  Loader2,
  PackagePlus,
  Plus,
  ScanSearch,
  Sparkles,
  Tags,
  TextCursorInput,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type VisualAttributeType = "color" | "design";
type IdentifierType = "gtin" | "mpn";
type ReviewFieldKey =
  | "name"
  | "brand"
  | "category"
  | "size"
  | "color"
  | "design"
  | "description";
type StructuredReviewFieldKey = Exclude<ReviewFieldKey, "name" | "description">;

export type ProductImageReviewAvailability = Partial<
  Record<StructuredReviewFieldKey | "catalogAttributes", boolean>
>;

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

type PendingIdentifier = {
  type: IdentifierType;
  value: string;
  evidence: string;
};

type CategoryTypeOption = {
  id: string;
  name: string;
};

type PendingCategory = {
  name: string;
};

type PendingSize = {
  name: string;
};

type ReviewSelection = Record<ReviewFieldKey, boolean>;

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
  visualFieldAvailability?: ProductImageReviewAvailability;
  onApply: (name: string) => void;
  onApplyVisualAnalysis?: (analysis: ProductImageAnalysis) => void;
  onApplyDescription?: (description: string) => void;
  onApplyVerifiedIdentifier?: (
    type: IdentifierType,
    identifier: Pick<PendingIdentifier, "value" | "evidence">,
  ) => void;
  canReviewVariantRecommendation?: boolean;
  onReviewVariantRecommendation?: (analysis: ProductImageAnalysis) => void;
  onCreateVisualAttribute?: (
    attribute: PendingVisualAttribute,
  ) => Promise<CreatedVisualAttribute>;
  categoryTypes?: CategoryTypeOption[];
  onCreateSuggestedCategory?: (input: {
    name: string;
    typeId: string;
  }) => Promise<CreatedVisualAttribute>;
  onCreateSuggestedSize?: (input: {
    dimension: string;
    weight: string;
  }) => Promise<CreatedVisualAttribute>;
};

const EMPTY_REVIEW_SELECTION: ReviewSelection = {
  name: false,
  brand: false,
  category: false,
  size: false,
  color: false,
  design: false,
  description: false,
};

const DEFAULT_VISUAL_FIELD_AVAILABILITY: Required<ProductImageReviewAvailability> =
  {
    brand: true,
    category: true,
    size: true,
    color: true,
    design: true,
    catalogAttributes: true,
  };

function getCatalogAttributeId(
  attribute: ProductImageAnalysis["catalogAttributes"][number],
  index: number,
) {
  return `${attribute.key}:${attribute.value}:${index}`;
}

function getInitialReviewSelection(
  analysis: ProductImageAnalysis,
  availability: Required<ProductImageReviewAvailability>,
  canApplyDescription: boolean,
): ReviewSelection {
  return {
    name: Boolean(analysis.suggestedBaseName),
    brand: availability.brand && Boolean(analysis.brand),
    category: availability.category && Boolean(analysis.categoryId),
    size: availability.size && Boolean(analysis.sizeId),
    color: availability.color && Boolean(analysis.colorId),
    design: availability.design && Boolean(analysis.designId),
    description: canApplyDescription && Boolean(analysis.suggestedDescription),
  };
}

function ReviewFieldCard({
  id,
  label,
  value,
  status,
  helper,
  checked,
  canApply,
  disabled,
  children,
  onCheckedChange,
}: {
  id: string;
  label: string;
  value: string;
  status: string;
  helper?: string;
  checked: boolean;
  canApply: boolean;
  disabled: boolean;
  children?: ReactNode;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-md border bg-background p-3",
        checked && canApply && "border-primary/50 bg-primary/5",
      )}
    >
      <div className="flex items-start gap-3">
        {canApply ? (
          <Checkbox
            id={id}
            checked={checked}
            disabled={disabled}
            className="mt-0.5"
            onCheckedChange={(value) => onCheckedChange(value === true)}
          />
        ) : (
          <CircleAlert
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {canApply ? (
              <label htmlFor={id} className="cursor-pointer font-medium">
                {label}
              </label>
            ) : (
              <p className="font-medium">{label}</p>
            )}
            <Badge variant={canApply ? "secondary" : "outline"}>{status}</Badge>
          </div>
          <p className="mt-1 break-words text-sm font-medium text-foreground">
            {value}
          </p>
          {helper && (
            <p className="mt-1 text-pretty text-muted-foreground">{helper}</p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

function ExistingTaxonomyAlternatives({
  options,
  onSelect,
}: {
  options: ProductTaxonomyAlternative[];
  onSelect: (option: ProductTaxonomyAlternative) => void;
}) {
  if (options.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        Posibles coincidencias existentes
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.id}
            type="button"
            variant="outline"
            size="sm"
            className="h-auto min-h-9 whitespace-normal text-left"
            onClick={() => onSelect(option)}
          >
            <Check aria-hidden="true" className="mr-2 h-4 w-4 shrink-0" />
            <span>
              Usar {option.name}
              {option.typeName ? ` · ${option.typeName}` : ""}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}

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
  visualFieldAvailability,
  onApply,
  onApplyVisualAnalysis,
  onApplyDescription,
  onApplyVerifiedIdentifier,
  canReviewVariantRecommendation = false,
  onReviewVariantRecommendation,
  onCreateVisualAttribute,
  categoryTypes = [],
  onCreateSuggestedCategory,
  onCreateSuggestedSize,
}: ProductNameAssistantProps) {
  const [baseName, setBaseName] = useState(currentName || "");
  const [wasApplied, setWasApplied] = useState(false);
  const [includeColorInName, setIncludeColorInName] = useState(false);
  const [includeDesignInName, setIncludeDesignInName] = useState(false);
  const [visualAnalysis, setVisualAnalysis] =
    useState<ProductImageAnalysis | null>(null);
  const [selectedNameOption, setSelectedNameOption] = useState<string | null>(
    null,
  );
  const [reviewSelection, setReviewSelection] = useState<ReviewSelection>(
    EMPTY_REVIEW_SELECTION,
  );
  const [selectedCatalogAttributeIds, setSelectedCatalogAttributeIds] =
    useState<string[]>([]);
  const [appliedReviewCount, setAppliedReviewCount] = useState<number | null>(
    null,
  );
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
  const [pendingIdentifier, setPendingIdentifier] =
    useState<PendingIdentifier | null>(null);
  const [pendingCategory, setPendingCategory] =
    useState<PendingCategory | null>(null);
  const [pendingSize, setPendingSize] = useState<PendingSize | null>(null);
  const [selectedCategoryTypeId, setSelectedCategoryTypeId] = useState("");
  const [selectedDimension, setSelectedDimension] = useState("");
  const [selectedWeight, setSelectedWeight] = useState("");
  const [isCreatingTaxonomyOption, setIsCreatingTaxonomyOption] =
    useState(false);

  const fieldAvailability = useMemo(
    () => ({
      ...DEFAULT_VISUAL_FIELD_AVAILABILITY,
      ...visualFieldAvailability,
    }),
    [visualFieldAvailability],
  );

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
    normalizedStoreId && visualImageUrls.length > 0,
  );

  const effectiveBrand =
    visualAnalysis && reviewSelection.brand ? visualAnalysis.brand : brand;
  const effectiveCategoryName =
    visualAnalysis && reviewSelection.category
      ? visualAnalysis.categoryName
      : categoryName;
  const effectiveSizeName =
    visualAnalysis && reviewSelection.size ? visualAnalysis.sizeName : sizeName;
  const effectiveColorName =
    visualAnalysis && reviewSelection.color
      ? visualAnalysis.colorName
      : colorName;
  const effectiveDesignName =
    visualAnalysis && reviewSelection.design
      ? visualAnalysis.designName
      : designName;

  const suggestion = useMemo(
    () =>
      buildProductNameSuggestion({
        baseName,
        categoryName: effectiveCategoryName,
        brand: effectiveBrand,
        designName: effectiveDesignName,
        colorName: effectiveColorName,
        sizeName: effectiveSizeName,
        sizeValue,
        includeVariantAttributes,
        includeColorInName,
        includeDesignInName,
      }),
    [
      baseName,
      effectiveBrand,
      effectiveCategoryName,
      effectiveColorName,
      effectiveDesignName,
      effectiveSizeName,
      includeColorInName,
      includeDesignInName,
      includeVariantAttributes,
      sizeValue,
    ],
  );

  const selectedCatalogAttributes = useMemo(() => {
    if (!visualAnalysis) return [];

    return visualAnalysis.catalogAttributes.filter((attribute, index) =>
      selectedCatalogAttributeIds.includes(
        getCatalogAttributeId(attribute, index),
      ),
    );
  }, [selectedCatalogAttributeIds, visualAnalysis]);

  const selectedReviewCount = useMemo(
    () =>
      Object.values(reviewSelection).filter(Boolean).length +
      selectedCatalogAttributes.length,
    [reviewSelection, selectedCatalogAttributes.length],
  );
  const reviewedNameIsValid =
    !reviewSelection.name ||
    Boolean(suggestion.name && suggestion.length <= PRODUCT_NAME_MAX_LENGTH);

  const detectedReviewCount = useMemo(() => {
    if (!visualAnalysis) return 0;

    return (
      Number(Boolean(visualAnalysis.suggestedBaseName)) +
      Number(Boolean(visualAnalysis.brand)) +
      Number(Boolean(visualAnalysis.categoryName)) +
      Number(Boolean(visualAnalysis.sizeName)) +
      Number(Boolean(visualAnalysis.colorName)) +
      Number(Boolean(visualAnalysis.designName)) +
      Number(Boolean(visualAnalysis.suggestedDescription)) +
      visualAnalysis.catalogAttributes.length +
      Number(Boolean(visualAnalysis.gtin)) +
      Number(Boolean(visualAnalysis.mpn)) +
      Number(visualAnalysis.variantRecommendation.shouldCreateVariants)
    );
  }, [visualAnalysis]);

  const updateReviewSelection = (field: ReviewFieldKey, checked: boolean) => {
    setReviewSelection((current) => ({ ...current, [field]: checked }));
    setAppliedReviewCount(null);
  };

  const applyManualName = () => {
    if (!suggestion.name || suggestion.length > PRODUCT_NAME_MAX_LENGTH) return;
    onApply(suggestion.name);
    setWasApplied(true);
  };

  const analyzeImages = async () => {
    if (!normalizedStoreId || visualImageUrls.length === 0) return;

    setIsAnalyzingImages(true);
    setVisualAnalysisError(null);
    setAppliedReviewCount(null);

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

      const analysis = payload.analysis as ProductImageAnalysis;
      setVisualAnalysis(analysis);
      setBaseName(analysis.suggestedBaseName || currentName || "");
      setSelectedNameOption(analysis.suggestedBaseName);
      setReviewSelection(
        getInitialReviewSelection(
          analysis,
          fieldAvailability,
          Boolean(onApplyDescription),
        ),
      );
      setSelectedCatalogAttributeIds(
        fieldAvailability.catalogAttributes
          ? analysis.catalogAttributes.map(getCatalogAttributeId)
          : [],
      );
      setRemainingAnalysesToday(payload.remainingAnalysesToday ?? null);
      setReusedVisualAnalysis(payload.reusedAnalysis === true);
      setWasApplied(false);
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

  const selectVisualNameOption = (name: string) => {
    setSelectedNameOption(name);
    setBaseName(name);
    setAppliedReviewCount(null);
  };

  const applyReviewedProposal = () => {
    if (!visualAnalysis || selectedReviewCount === 0) return;

    if (
      reviewSelection.name &&
      suggestion.name &&
      suggestion.length <= PRODUCT_NAME_MAX_LENGTH
    ) {
      onApply(suggestion.name);
    }

    const hasStructuredFields =
      reviewSelection.brand ||
      reviewSelection.category ||
      reviewSelection.size ||
      reviewSelection.color ||
      reviewSelection.design ||
      selectedCatalogAttributes.length > 0;

    if (hasStructuredFields && onApplyVisualAnalysis) {
      onApplyVisualAnalysis({
        ...visualAnalysis,
        brand: reviewSelection.brand ? visualAnalysis.brand : null,
        categoryName: reviewSelection.category
          ? visualAnalysis.categoryName
          : null,
        categoryIsDeterministic:
          reviewSelection.category && visualAnalysis.categoryIsDeterministic,
        categoryId: reviewSelection.category ? visualAnalysis.categoryId : null,
        categorySource: reviewSelection.category
          ? visualAnalysis.categorySource
          : "not_detected",
        sizeName: reviewSelection.size ? visualAnalysis.sizeName : null,
        sizeIsDeterministic:
          reviewSelection.size && visualAnalysis.sizeIsDeterministic,
        sizeId: reviewSelection.size ? visualAnalysis.sizeId : null,
        sizeSource: reviewSelection.size
          ? visualAnalysis.sizeSource
          : "not_detected",
        colorName: reviewSelection.color ? visualAnalysis.colorName : null,
        colorHex: reviewSelection.color ? visualAnalysis.colorHex : null,
        colorIsDeterministic:
          reviewSelection.color && visualAnalysis.colorIsDeterministic,
        colorId: reviewSelection.color ? visualAnalysis.colorId : null,
        colorSource: reviewSelection.color
          ? visualAnalysis.colorSource
          : "not_detected",
        designName: reviewSelection.design ? visualAnalysis.designName : null,
        designIsDeterministic:
          reviewSelection.design && visualAnalysis.designIsDeterministic,
        designId: reviewSelection.design ? visualAnalysis.designId : null,
        designSource: reviewSelection.design
          ? visualAnalysis.designSource
          : "not_detected",
        catalogAttributes: selectedCatalogAttributes,
      });
    }

    if (
      reviewSelection.description &&
      visualAnalysis.suggestedDescription &&
      onApplyDescription
    ) {
      onApplyDescription(visualAnalysis.suggestedDescription);
    }

    setAppliedReviewCount(selectedReviewCount);
  };

  const createVisualAttribute = async () => {
    if (!pendingVisualAttribute || !onCreateVisualAttribute) return;

    setIsCreatingVisualAttribute(true);
    setVisualAnalysisError(null);

    try {
      const createdAttribute = await onCreateVisualAttribute(
        pendingVisualAttribute,
      );
      const createdType = pendingVisualAttribute.type;

      setVisualAnalysis((current) => {
        if (!current) return current;

        if (createdType === "color") {
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
      updateReviewSelection(createdType, true);
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

  const selectExistingTaxonomyAlternative = (
    field: "category" | "size" | "color" | "design",
    option: ProductTaxonomyAlternative,
  ) => {
    setVisualAnalysis((current) => {
      if (!current) return current;

      if (field === "category") {
        return {
          ...current,
          categoryId: option.id,
          categoryName: option.name,
          categorySource: "existing",
          categoryAlternatives: [],
        };
      }
      if (field === "size") {
        return {
          ...current,
          sizeId: option.id,
          sizeName: option.name,
          sizeSource: "existing",
          sizeAlternatives: [],
        };
      }
      if (field === "color") {
        return {
          ...current,
          colorId: option.id,
          colorName: option.name,
          colorHex: option.value ?? current.colorHex,
          colorSource: "existing",
          colorAlternatives: [],
        };
      }

      return {
        ...current,
        designId: option.id,
        designName: option.name,
        designSource: "existing",
        designAlternatives: [],
      };
    });
    updateReviewSelection(field, true);
  };

  const createSuggestedCategory = async () => {
    if (
      !pendingCategory ||
      !selectedCategoryTypeId ||
      !onCreateSuggestedCategory
    ) {
      return;
    }

    setIsCreatingTaxonomyOption(true);
    setVisualAnalysisError(null);

    try {
      const category = await onCreateSuggestedCategory({
        name: pendingCategory.name,
        typeId: selectedCategoryTypeId,
      });
      setVisualAnalysis((current) =>
        current
          ? {
              ...current,
              categoryId: category.id,
              categoryName: category.name,
              categorySource: "existing",
              categoryAlternatives: [],
            }
          : current,
      );
      updateReviewSelection("category", true);
      setPendingCategory(null);
      setSelectedCategoryTypeId("");
    } catch (error) {
      setVisualAnalysisError(
        error instanceof Error
          ? error.message
          : "No se pudo crear esta subcategoría.",
      );
    } finally {
      setIsCreatingTaxonomyOption(false);
    }
  };

  const createSuggestedSize = async () => {
    if (
      !pendingSize ||
      !selectedDimension ||
      !selectedWeight ||
      !onCreateSuggestedSize
    ) {
      return;
    }

    setIsCreatingTaxonomyOption(true);
    setVisualAnalysisError(null);

    try {
      const size = await onCreateSuggestedSize({
        dimension: selectedDimension,
        weight: selectedWeight,
      });
      setVisualAnalysis((current) =>
        current
          ? {
              ...current,
              sizeId: size.id,
              sizeName: size.name,
              sizeSource: "existing",
              sizeAlternatives: [],
            }
          : current,
      );
      updateReviewSelection("size", true);
      setPendingSize(null);
      setSelectedDimension("");
      setSelectedWeight("");
    } catch (error) {
      setVisualAnalysisError(
        error instanceof Error
          ? error.message
          : "No se pudo crear este tamaño interno.",
      );
    } finally {
      setIsCreatingTaxonomyOption(false);
    }
  };

  const applyVerifiedIdentifier = () => {
    if (!pendingIdentifier || !onApplyVerifiedIdentifier) return;

    onApplyVerifiedIdentifier(pendingIdentifier.type, {
      value: pendingIdentifier.value,
      evidence: pendingIdentifier.evidence,
    });
    setPendingIdentifier(null);
  };

  const variationAxes = visualAnalysis?.variantRecommendation.axes
    .map((axis) =>
      axis === "COLOR" ? "color" : axis === "DESIGN" ? "diseño" : "tamaño",
    )
    .join(", ");

  return (
    <section className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-2">
          <Lightbulb
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-primary"
          />
          <div>
            <h3 className="text-sm font-semibold">Asistente de producto</h3>
            <p className="text-pretty text-xs text-muted-foreground">
              La IA prepara un borrador. Tú eliges exactamente qué campos se
              aplican antes de guardar el producto.
            </p>
          </div>
        </div>
        <span
          className={cn(
            "text-xs tabular-nums",
            suggestion.length > PRODUCT_NAME_RECOMMENDED_MAX_LENGTH
              ? "font-medium text-amber-700"
              : "text-muted-foreground",
          )}
        >
          {suggestion.length}/{PRODUCT_NAME_RECOMMENDED_MAX_LENGTH} recomendado
        </span>
      </div>

      {includeVariantAttributes && (colorName || designName) && (
        <div className="rounded-md border bg-background/70 p-3">
          <p className="text-xs font-medium">Características para el nombre</p>
          <p className="mt-1 text-pretty text-xs text-muted-foreground">
            Actívalas solo si la clienta puede reconocerlas y recibe una
            variante distinta por esa característica. Los campos siguen
            guardándose para inventario y SKU aunque no se añadan al nombre.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {colorName && (
              <label className="min-h-11 flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={includeColorInName}
                  disabled={disabled}
                  onCheckedChange={(checked) => {
                    setIncludeColorInName(checked === true);
                    setWasApplied(false);
                    setAppliedReviewCount(null);
                  }}
                />
                <span>Incluir color: {colorName}</span>
              </label>
            )}
            {designName && (
              <label className="min-h-11 flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={includeDesignInName}
                  disabled={disabled}
                  onCheckedChange={(checked) => {
                    setIncludeDesignInName(checked === true);
                    setWasApplied(false);
                    setAppliedReviewCount(null);
                  }}
                />
                <span>Incluir diseño: {designName}</span>
              </label>
            )}
          </div>
        </div>
      )}

      {!visualAnalysis && (
        <div className="space-y-3 rounded-md border bg-background/70 p-3">
          <div className="flex gap-2">
            <TextCursorInput
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-primary"
            />
            <div>
              <h4 className="text-xs font-medium">
                Ajustar nombre manualmente
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Escribe qué es el producto. El asistente organiza marca y
                características confirmadas sin modificar el formulario todavía.
              </p>
            </div>
          </div>
          <Input
            value={baseName}
            onChange={(event) => {
              setBaseName(event.target.value);
              setWasApplied(false);
            }}
            disabled={disabled}
            placeholder="Ej. Cinta correctora lateral 5 mm x 6 m…"
            aria-label="Nombre o detalle confirmado en el empaque"
            autoComplete="off"
          />
          {suggestion.name && (
            <div className="rounded-md border bg-background px-3 py-2 text-sm">
              <span className="text-muted-foreground">Resultado: </span>
              <span className="font-medium">{suggestion.name}</span>
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div aria-live="polite" className="text-xs text-muted-foreground">
              {wasApplied
                ? "El nombre ya está cargado en el formulario."
                : "Nada cambia hasta que apliques este nombre."}
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={
                disabled ||
                !suggestion.name ||
                suggestion.length > PRODUCT_NAME_MAX_LENGTH
              }
              onClick={applyManualName}
            >
              {wasApplied ? (
                <Check aria-hidden="true" className="mr-2 h-4 w-4" />
              ) : (
                <Sparkles aria-hidden="true" className="mr-2 h-4 w-4" />
              )}
              {wasApplied ? "Nombre aplicado" : "Aplicar este nombre"}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-md border bg-background/70 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <ScanSearch
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-primary"
            />
            <div>
              <h4 className="text-xs font-medium">Analizar fotos con IA</h4>
              <p className="mt-1 text-pretty text-xs text-muted-foreground">
                Revisa hasta 3 fotos y presenta cada hallazgo antes de
                aplicarlo. No guarda el producto automáticamente.
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
              <Loader2
                aria-hidden="true"
                className="mr-2 h-4 w-4 animate-spin"
              />
            ) : (
              <ScanSearch aria-hidden="true" className="mr-2 h-4 w-4" />
            )}
            {isAnalyzingImages ? "Analizando fotos…" : "Analizar fotos"}
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
          <div className="mt-4 space-y-4 rounded-md border bg-background p-3 text-xs sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h4 className="text-sm font-semibold">
                  Revisa la propuesta de IA
                </h4>
                <p className="mt-1 text-pretty text-muted-foreground">
                  Marca únicamente los datos que reconoces en las fotos. Los
                  campos sin coincidencia local quedan solo como información.
                </p>
              </div>
              <Badge variant="info" className="w-fit tabular-nums">
                {detectedReviewCount} hallazgo
                {detectedReviewCount === 1 ? "" : "s"}
              </Badge>
            </div>

            {visualAnalysis.suggestedNameOptions.length > 0 && (
              <div
                className={cn(
                  "space-y-3 rounded-md border p-3",
                  reviewSelection.name && "border-primary/50 bg-primary/5",
                )}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="apply-ai-name"
                    checked={reviewSelection.name}
                    disabled={disabled}
                    className="mt-0.5"
                    onCheckedChange={(checked) =>
                      updateReviewSelection("name", checked === true)
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor="apply-ai-name"
                      className="cursor-pointer font-medium"
                    >
                      Nombre del producto
                    </label>
                    <p className="mt-1 text-muted-foreground">
                      Elige 1 opción. La selección marcada se aplicará al campo
                      Nombre.
                    </p>
                  </div>
                </div>

                <RadioGroup
                  value={selectedNameOption ?? ""}
                  disabled={disabled || !reviewSelection.name}
                  onValueChange={selectVisualNameOption}
                  aria-label="Opciones de nombre sugeridas por IA"
                  className="gap-2"
                >
                  {visualAnalysis.suggestedNameOptions.map((name, index) => {
                    const optionId = `ai-name-option-${index}`;
                    const selected = selectedNameOption === name;

                    return (
                      <label
                        key={name}
                        htmlFor={optionId}
                        className={cn(
                          "min-h-11 flex cursor-pointer items-start gap-3 rounded-md border bg-background p-3",
                          "hover:border-primary/50 hover:bg-primary/5",
                          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                          selected && "border-primary bg-primary/10",
                          !reviewSelection.name &&
                            "cursor-not-allowed opacity-60",
                        )}
                      >
                        <RadioGroupItem
                          id={optionId}
                          value={name}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1 break-words text-sm font-medium">
                          {name}
                        </span>
                        {index === 0 && (
                          <Badge variant="secondary" className="shrink-0">
                            Recomendada
                          </Badge>
                        )}
                      </label>
                    );
                  })}
                </RadioGroup>

                <div className="space-y-1.5">
                  <label htmlFor="ai-selected-name" className="font-medium">
                    Nombre elegido
                  </label>
                  <Input
                    id="ai-selected-name"
                    value={baseName}
                    disabled={disabled || !reviewSelection.name}
                    maxLength={PRODUCT_NAME_MAX_LENGTH}
                    autoComplete="off"
                    onChange={(event) => {
                      setBaseName(event.target.value);
                      setSelectedNameOption(null);
                      setAppliedReviewCount(null);
                    }}
                  />
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-muted-foreground">
                      {selectedNameOption
                        ? "Opción seleccionada de la propuesta."
                        : "Editado manualmente después del análisis."}
                    </p>
                    <span className="tabular-nums text-muted-foreground">
                      {suggestion.length}/{PRODUCT_NAME_RECOMMENDED_MAX_LENGTH}
                    </span>
                  </div>
                </div>

                {suggestion.name && (
                  <div className="rounded-md border bg-background px-3 py-2 text-sm">
                    <span className="text-muted-foreground">
                      Resultado que se aplicará:{" "}
                    </span>
                    <span className="font-medium">{suggestion.name}</span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex gap-2">
                <ListChecks
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                />
                <div>
                  <h5 className="font-medium">Campos reconocidos</h5>
                  <p className="mt-1 text-muted-foreground">
                    Cada casilla controla un campo distinto del formulario.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {visualAnalysis.brand && (
                  <ReviewFieldCard
                    id="apply-ai-brand"
                    label="Marca o fabricante"
                    value={visualAnalysis.brand}
                    status="Visible en foto"
                    checked={reviewSelection.brand}
                    canApply={fieldAvailability.brand}
                    disabled={disabled}
                    helper={
                      fieldAvailability.brand
                        ? "Se cargará en Marca o fabricante."
                        : "Este formulario no permite cambiar la marca desde esta propuesta."
                    }
                    onCheckedChange={(checked) =>
                      updateReviewSelection("brand", checked)
                    }
                  />
                )}
                {visualAnalysis.categoryName && (
                  <ReviewFieldCard
                    id="apply-ai-category"
                    label="Subcategoría"
                    value={visualAnalysis.categoryName}
                    status={
                      visualAnalysis.categoryId
                        ? "Opción existente"
                        : (visualAnalysis.categoryAlternatives?.length ?? 0) > 0
                          ? "Coincidencias para revisar"
                          : "Nueva propuesta"
                    }
                    checked={reviewSelection.category}
                    canApply={
                      fieldAvailability.category &&
                      Boolean(visualAnalysis.categoryId)
                    }
                    disabled={disabled}
                    helper={
                      visualAnalysis.categoryId
                        ? "Coincide exactamente con una subcategoría del catálogo."
                        : onCreateSuggestedCategory
                          ? "Reutiliza una coincidencia adecuada o crea la propuesta bajo el tipo correcto."
                          : "No coincide de forma única; elige la subcategoría manualmente en el formulario."
                    }
                    onCheckedChange={(checked) =>
                      updateReviewSelection("category", checked)
                    }
                  >
                    <ExistingTaxonomyAlternatives
                      options={visualAnalysis.categoryAlternatives ?? []}
                      onSelect={(option) =>
                        selectExistingTaxonomyAlternative("category", option)
                      }
                    />
                    {fieldAvailability.category &&
                      !visualAnalysis.categoryId &&
                      onCreateSuggestedCategory &&
                      categoryTypes.length > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          disabled={disabled || isCreatingTaxonomyOption}
                          onClick={() =>
                            setPendingCategory({
                              name: visualAnalysis.categoryName!,
                            })
                          }
                        >
                          <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
                          Crear subcategoría y aprobarla
                        </Button>
                      )}
                  </ReviewFieldCard>
                )}
                {visualAnalysis.sizeName && (
                  <ReviewFieldCard
                    id="apply-ai-size"
                    label="Tamaño o formato"
                    value={visualAnalysis.sizeName}
                    status={
                      visualAnalysis.sizeId
                        ? "Opción existente"
                        : (visualAnalysis.sizeAlternatives?.length ?? 0) > 0
                          ? "Coincidencias para revisar"
                          : "Revisión logística"
                    }
                    checked={reviewSelection.size}
                    canApply={
                      fieldAvailability.size && Boolean(visualAnalysis.sizeId)
                    }
                    disabled={disabled}
                    helper={
                      visualAnalysis.sizeId
                        ? "Coincide exactamente con una opción existente."
                        : "Este campo controla dimensión y peso internos. Los formatos visibles como A5 deben ir en Opciones visibles para clientes."
                    }
                    onCheckedChange={(checked) =>
                      updateReviewSelection("size", checked)
                    }
                  >
                    <ExistingTaxonomyAlternatives
                      options={visualAnalysis.sizeAlternatives ?? []}
                      onSelect={(option) =>
                        selectExistingTaxonomyAlternative("size", option)
                      }
                    />
                    {fieldAvailability.size &&
                      !visualAnalysis.sizeId &&
                      onCreateSuggestedSize && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          disabled={disabled || isCreatingTaxonomyOption}
                          onClick={() =>
                            setPendingSize({ name: visualAnalysis.sizeName! })
                          }
                        >
                          <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
                          Crear tamaño interno y aprobarlo
                        </Button>
                      )}
                  </ReviewFieldCard>
                )}
                {visualAnalysis.colorName && (
                  <ReviewFieldCard
                    id="apply-ai-color"
                    label="Color"
                    value={visualAnalysis.colorName}
                    status={
                      visualAnalysis.colorSource === "existing"
                        ? "Opción existente"
                        : (visualAnalysis.colorAlternatives?.length ?? 0) > 0
                          ? "Coincidencias para revisar"
                          : "Nueva propuesta"
                    }
                    checked={reviewSelection.color}
                    canApply={
                      fieldAvailability.color && Boolean(visualAnalysis.colorId)
                    }
                    disabled={disabled}
                    helper={
                      visualAnalysis.colorId
                        ? "Coincide exactamente con un color del catálogo."
                        : "Reutiliza una coincidencia o crea y confirma este color antes de aplicarlo."
                    }
                    onCheckedChange={(checked) =>
                      updateReviewSelection("color", checked)
                    }
                  >
                    <ExistingTaxonomyAlternatives
                      options={visualAnalysis.colorAlternatives ?? []}
                      onSelect={(option) =>
                        selectExistingTaxonomyAlternative("color", option)
                      }
                    />
                    {fieldAvailability.color &&
                      visualAnalysis.colorSource === "new" &&
                      visualAnalysis.colorHex &&
                      onCreateVisualAttribute && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          disabled={disabled || isCreatingVisualAttribute}
                          onClick={() =>
                            setPendingVisualAttribute({
                              type: "color",
                              name: visualAnalysis.colorName!,
                              colorHex: visualAnalysis.colorHex!,
                            })
                          }
                        >
                          <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
                          Crear color y aprobarlo
                        </Button>
                      )}
                  </ReviewFieldCard>
                )}
                {visualAnalysis.designName && (
                  <ReviewFieldCard
                    id="apply-ai-design"
                    label="Diseño"
                    value={visualAnalysis.designName}
                    status={
                      visualAnalysis.designSource === "existing"
                        ? "Opción existente"
                        : (visualAnalysis.designAlternatives?.length ?? 0) > 0
                          ? "Coincidencias para revisar"
                          : "Nueva propuesta"
                    }
                    checked={reviewSelection.design}
                    canApply={
                      fieldAvailability.design &&
                      Boolean(visualAnalysis.designId)
                    }
                    disabled={disabled}
                    helper={
                      visualAnalysis.designId
                        ? "Coincide exactamente con un diseño del catálogo."
                        : "Reutiliza una coincidencia o crea y confirma este diseño antes de aplicarlo."
                    }
                    onCheckedChange={(checked) =>
                      updateReviewSelection("design", checked)
                    }
                  >
                    <ExistingTaxonomyAlternatives
                      options={visualAnalysis.designAlternatives ?? []}
                      onSelect={(option) =>
                        selectExistingTaxonomyAlternative("design", option)
                      }
                    />
                    {fieldAvailability.design &&
                      visualAnalysis.designSource === "new" &&
                      onCreateVisualAttribute && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          disabled={disabled || isCreatingVisualAttribute}
                          onClick={() =>
                            setPendingVisualAttribute({
                              type: "design",
                              name: visualAnalysis.designName!,
                            })
                          }
                        >
                          <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
                          Crear diseño y aprobarlo
                        </Button>
                      )}
                  </ReviewFieldCard>
                )}
              </div>
            </div>

            {visualAnalysis.suggestedDescription && (
              <div
                className={cn(
                  "rounded-md border bg-background p-3",
                  reviewSelection.description &&
                    "border-primary/50 bg-primary/5",
                )}
              >
                <div className="flex items-start gap-3">
                  {onApplyDescription ? (
                    <Checkbox
                      id="apply-ai-description"
                      checked={reviewSelection.description}
                      disabled={disabled}
                      className="mt-0.5"
                      onCheckedChange={(checked) =>
                        updateReviewSelection("description", checked === true)
                      }
                    />
                  ) : (
                    <FileText
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <label
                        htmlFor="apply-ai-description"
                        className="cursor-pointer font-medium"
                      >
                        Descripción enriquecida
                      </label>
                      <Badge variant="secondary">Vista previa</Badge>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      Se conservarán títulos, negritas y listas en el editor del
                      producto.
                    </p>
                    <div className="mt-3 rounded-md border bg-background p-3">
                      <RichTextDisplay
                        content={visualAnalysis.suggestedDescription}
                        className="text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {visualAnalysis.catalogAttributes.length > 0 && (
              <div className="space-y-3 rounded-md border border-dashed p-3">
                <div className="flex gap-2">
                  <Tags
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                  />
                  <div>
                    <h5 className="font-medium">
                      Opciones visibles para clientes
                    </h5>
                    <p className="mt-1 text-pretty text-muted-foreground">
                      Aprueba una, varias o ninguna. Cada opción seleccionada se
                      cargará abajo como una característica editable.
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {visualAnalysis.catalogAttributes.map((attribute, index) => {
                    const attributeId = getCatalogAttributeId(attribute, index);
                    const checkboxId = `apply-ai-catalog-attribute-${index}`;
                    const checked =
                      selectedCatalogAttributeIds.includes(attributeId);

                    return (
                      <label
                        key={attributeId}
                        htmlFor={checkboxId}
                        className={cn(
                          "min-h-11 flex cursor-pointer items-start gap-3 rounded-md border bg-background p-3",
                          "hover:border-primary/50 hover:bg-primary/5",
                          checked && "border-primary bg-primary/10",
                          !fieldAvailability.catalogAttributes &&
                            "cursor-not-allowed opacity-60",
                        )}
                      >
                        <Checkbox
                          id={checkboxId}
                          checked={checked}
                          disabled={
                            disabled || !fieldAvailability.catalogAttributes
                          }
                          className="mt-0.5"
                          onCheckedChange={(value) => {
                            setSelectedCatalogAttributeIds((current) =>
                              value === true
                                ? Array.from(new Set([...current, attributeId]))
                                : current.filter((id) => id !== attributeId),
                            );
                            setAppliedReviewCount(null);
                          }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-sm font-medium">
                            {attribute.name}: {attribute.value}
                          </span>
                          <span className="mt-1 block text-pretty text-muted-foreground">
                            Evidencia: {attribute.evidence}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {(visualAnalysis.gtin || visualAnalysis.mpn) && (
              <div className="rounded-md border border-dashed p-3">
                <div className="flex gap-2">
                  <Barcode
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                  />
                  <div>
                    <h5 className="font-medium">Identificadores legibles</h5>
                    <p className="mt-1 text-muted-foreground">
                      Por seguridad, cada código conserva su propia confirmación
                      contra el empaque físico.
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {visualAnalysis.gtin && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled || !onApplyVerifiedIdentifier}
                      onClick={() =>
                        setPendingIdentifier({
                          type: "gtin",
                          ...visualAnalysis.gtin!,
                        })
                      }
                    >
                      Revisar GTIN: {visualAnalysis.gtin.value}
                    </Button>
                  )}
                  {visualAnalysis.mpn && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled || !onApplyVerifiedIdentifier}
                      onClick={() =>
                        setPendingIdentifier({
                          type: "mpn",
                          ...visualAnalysis.mpn!,
                        })
                      }
                    >
                      Revisar MPN: {visualAnalysis.mpn.value}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {visualAnalysis.variantRecommendation.shouldCreateVariants && (
              <div className="rounded-md border border-dashed p-3">
                <div className="flex gap-2">
                  <PackagePlus
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                  />
                  <div>
                    <h5 className="font-medium">
                      Posibles variantes por {variationAxes}
                    </h5>
                    {visualAnalysis.variantRecommendation.evidence && (
                      <p className="mt-1 text-muted-foreground">
                        {visualAnalysis.variantRecommendation.evidence}
                      </p>
                    )}
                  </div>
                </div>
                {canReviewVariantRecommendation &&
                  onReviewVariantRecommendation && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      disabled={disabled}
                      onClick={() =>
                        onReviewVariantRecommendation(visualAnalysis)
                      }
                    >
                      Revisar {visualAnalysis.variantCandidates.length} opciones
                    </Button>
                  )}
              </div>
            )}

            {(visualAnalysis.observations.length > 0 ||
              visualAnalysis.limitations.length > 0) && (
              <div className="grid gap-3 md:grid-cols-2">
                {visualAnalysis.observations.length > 0 && (
                  <div className="rounded-md bg-muted/30 p-3">
                    <p className="font-medium">Evidencia observada</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                      {visualAnalysis.observations.map((observation) => (
                        <li key={observation}>{observation}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {visualAnalysis.limitations.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                    <p className="font-medium">No se pudo confirmar</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      {visualAnalysis.limitations.map((limitation) => (
                        <li key={limitation}>{limitation}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {suggestion.warnings.length > 0 && reviewSelection.name && (
              <ul className="space-y-1 text-amber-700" role="alert">
                {suggestion.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}

            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div aria-live="polite" className="min-w-0 text-muted-foreground">
                {!reviewedNameIsValid ? (
                  <span className="font-medium text-amber-700">
                    Ajusta el nombre elegido antes de aplicar la propuesta.
                  </span>
                ) : appliedReviewCount !== null ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                    <Check aria-hidden="true" className="h-4 w-4" />
                    {appliedReviewCount} campo
                    {appliedReviewCount === 1 ? " aplicado" : "s aplicados"} al
                    formulario. Aún debes guardar el producto.
                  </span>
                ) : selectedReviewCount > 0 ? (
                  <span>
                    Se aplicarán {selectedReviewCount} campo
                    {selectedReviewCount === 1 ? "" : "s"}. Nada cambia hasta
                    confirmar.
                  </span>
                ) : (
                  <span>Selecciona al menos 1 campo para continuar.</span>
                )}
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={
                  disabled || selectedReviewCount === 0 || !reviewedNameIsValid
                }
                onClick={applyReviewedProposal}
                className="shrink-0"
              >
                <Check aria-hidden="true" className="mr-2 h-4 w-4" />
                Aplicar {selectedReviewCount} campo
                {selectedReviewCount === 1 ? "" : "s"} seleccionado
                {selectedReviewCount === 1 ? "" : "s"}
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

      <AlertDialog
        open={Boolean(pendingCategory)}
        onOpenChange={(open) => {
          if (!open && !isCreatingTaxonomyOption) {
            setPendingCategory(null);
            setSelectedCategoryTypeId("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Crear subcategoría nueva?</AlertDialogTitle>
            <AlertDialogDescription>
              La propuesta “{pendingCategory?.name}” no se aplicará hasta que
              elijas su tipo padre. Revisa primero las coincidencias existentes
              para evitar categorías duplicadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <label htmlFor="ai-category-type" className="text-sm font-medium">
              Tipo padre
            </label>
            <Select
              value={selectedCategoryTypeId}
              disabled={isCreatingTaxonomyOption}
              onValueChange={setSelectedCategoryTypeId}
            >
              <SelectTrigger id="ai-category-type">
                <SelectValue placeholder="Selecciona el tipo correcto" />
              </SelectTrigger>
              <SelectContent>
                {categoryTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCreatingTaxonomyOption}>
              Revisar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isCreatingTaxonomyOption || !selectedCategoryTypeId}
              onClick={(event) => {
                event.preventDefault();
                void createSuggestedCategory();
              }}
            >
              {isCreatingTaxonomyOption && (
                <Loader2
                  aria-hidden="true"
                  className="mr-2 h-4 w-4 animate-spin"
                />
              )}
              {isCreatingTaxonomyOption ? "Creando…" : "Crear y aprobar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingSize)}
        onOpenChange={(open) => {
          if (!open && !isCreatingTaxonomyOption) {
            setPendingSize(null);
            setSelectedDimension("");
            setSelectedWeight("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Crear tamaño interno</AlertDialogTitle>
            <AlertDialogDescription>
              La IA detectó “{pendingSize?.name}”, pero este campo controla la
              logística interna. Elige manualmente dimensión y peso. Si es un
              formato visible como A5, apruébalo en Opciones visibles para
              clientes en lugar de crear un tamaño interno.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="ai-size-dimension"
                className="text-sm font-medium"
              >
                Dimensión
              </label>
              <Select
                value={selectedDimension}
                disabled={isCreatingTaxonomyOption}
                onValueChange={setSelectedDimension}
              >
                <SelectTrigger id="ai-size-dimension">
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {DIMENSIONS.map((dimension) => (
                    <SelectItem key={dimension.value} value={dimension.value}>
                      {dimension.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label htmlFor="ai-size-weight" className="text-sm font-medium">
                Peso
              </label>
              <Select
                value={selectedWeight}
                disabled={isCreatingTaxonomyOption}
                onValueChange={setSelectedWeight}
              >
                <SelectTrigger id="ai-size-weight">
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {WEIGHTS.map((weight) => (
                    <SelectItem key={weight.value} value={weight.value}>
                      {weight.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCreatingTaxonomyOption}>
              Revisar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                isCreatingTaxonomyOption ||
                !selectedDimension ||
                !selectedWeight
              }
              onClick={(event) => {
                event.preventDefault();
                void createSuggestedSize();
              }}
            >
              {isCreatingTaxonomyOption && (
                <Loader2
                  aria-hidden="true"
                  className="mr-2 h-4 w-4 animate-spin"
                />
              )}
              {isCreatingTaxonomyOption ? "Creando…" : "Crear y aprobar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              tienda y quedará aprobado en esta propuesta. Todavía tendrás que
              aplicar la propuesta y guardar el producto.
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
                <Loader2
                  aria-hidden="true"
                  className="mr-2 h-4 w-4 animate-spin"
                />
              ) : (
                <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
              )}
              {isCreatingVisualAttribute ? "Creando…" : "Crear y aprobar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingIdentifier)}
        onOpenChange={(open) => {
          if (!open) setPendingIdentifier(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Confirmas este{" "}
              {pendingIdentifier?.type === "gtin" ? "GTIN" : "MPN"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              La IA leyó “{pendingIdentifier?.value}”. Evidencia:{" "}
              {pendingIdentifier?.evidence}. Compáralo con el empaque físico: no
              se puede recuperar el identificador correcto desde una foto
              borrosa o incompleta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Revisar</AlertDialogCancel>
            <AlertDialogAction onClick={applyVerifiedIdentifier}>
              Confirmar y aplicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
