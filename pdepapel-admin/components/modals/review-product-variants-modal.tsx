"use client";

import Image from "next/image";
import { CheckCircle2, Loader2, PackageCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type {
  ProductImageAnalysis,
  ProductImageVariantCandidate,
} from "@/lib/product-image-analysis";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";

type AttributeOption = {
  id: string;
  name: string;
  value?: string;
};

type VariantAttributePayload =
  | { mode: "existing"; id: string }
  | { mode: "new"; name: string; value?: string };

export type ProductVariantReviewPayload = {
  name: string;
  variants: Array<{
    imageUrl: string;
    keepExistingProduct: boolean;
    stock: number;
    color: VariantAttributePayload;
    design: VariantAttributePayload;
    sizeId: string;
  }>;
};

type VariantDraft = ProductVariantReviewPayload["variants"][number];

interface ReviewProductVariantsModalProps {
  analysis: ProductImageAnalysis | null;
  colors: AttributeOption[];
  defaultName: string;
  defaultVariant: {
    colorId: string;
    designId: string;
    sizeId: string;
    stock: number;
  };
  designs: AttributeOption[];
  imageUrls: string[];
  isOpen: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: (payload: ProductVariantReviewPayload) => void;
  sizes: AttributeOption[];
}

function candidateAttribute(
  candidate: ProductImageVariantCandidate,
  attribute: "color" | "design",
  fallbackId: string,
): VariantAttributePayload {
  const id = attribute === "color" ? candidate.colorId : candidate.designId;
  const source =
    attribute === "color" ? candidate.colorSource : candidate.designSource;
  const name =
    attribute === "color" ? candidate.colorName : candidate.designName;

  if (source === "existing" && id) return { mode: "existing", id };
  if (source === "new" && name) {
    return {
      mode: "new",
      name,
      ...(attribute === "color" && candidate.colorHex
        ? { value: candidate.colorHex }
        : {}),
    };
  }

  return { mode: "existing", id: fallbackId };
}

function attributeValue(attribute: VariantAttributePayload) {
  return attribute.mode === "existing"
    ? `existing:${attribute.id}`
    : `new:${attribute.name}`;
}

function optionFromValue(
  value: string,
  options: AttributeOption[],
  current: VariantAttributePayload,
): VariantAttributePayload {
  if (value.startsWith("new:")) return current;
  const id = value.replace("existing:", "");
  return options.some((option) => option.id === id)
    ? { mode: "existing", id }
    : current;
}

export function ReviewProductVariantsModal({
  analysis,
  colors,
  defaultName,
  defaultVariant,
  designs,
  imageUrls,
  isOpen,
  loading,
  onClose,
  onConfirm,
  sizes,
}: ReviewProductVariantsModalProps) {
  const imageUrlsKey = imageUrls.join("|");
  const candidateRows = useMemo(() => {
    const stableImageUrls = imageUrlsKey ? imageUrlsKey.split("|") : [];

    return (analysis?.variantCandidates ?? [])
      .map((candidate) => ({
        candidate,
        imageUrl: stableImageUrls[candidate.imageIndex],
      }))
      .filter(
        (
          row,
        ): row is {
          candidate: ProductImageVariantCandidate;
          imageUrl: string;
        } => Boolean(row.imageUrl),
      );
  }, [analysis?.variantCandidates, imageUrlsKey]);
  const [groupName, setGroupName] = useState(defaultName);
  const [variants, setVariants] = useState<VariantDraft[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    setGroupName(defaultName);
    setVariants(
      candidateRows.map(({ candidate, imageUrl }, index) => ({
        imageUrl,
        keepExistingProduct: index === 0,
        stock: 0,
        color: candidateAttribute(candidate, "color", defaultVariant.colorId),
        design: candidateAttribute(
          candidate,
          "design",
          defaultVariant.designId,
        ),
        sizeId: candidate.sizeId ?? defaultVariant.sizeId,
      })),
    );
  }, [
    candidateRows,
    defaultName,
    defaultVariant.colorId,
    defaultVariant.designId,
    defaultVariant.sizeId,
    defaultVariant.stock,
    isOpen,
  ]);

  const allocatedStock = variants.reduce(
    (total, variant) => total + variant.stock,
    0,
  );
  const remainingStock = defaultVariant.stock - allocatedStock;
  const hasExactlyOneExistingProduct =
    variants.filter((variant) => variant.keepExistingProduct).length === 1;
  const duplicateCombination = (() => {
    const combinations = new Set<string>();
    return variants.some((variant) => {
      const key = [
        attributeValue(variant.color),
        attributeValue(variant.design),
        variant.sizeId,
      ].join(":");
      if (combinations.has(key)) return true;
      combinations.add(key);
      return false;
    });
  })();
  const canConfirm =
    groupName.trim().length > 0 &&
    variants.length >= 2 &&
    remainingStock === 0 &&
    hasExactlyOneExistingProduct &&
    !duplicateCombination;

  const updateVariant = (index: number, update: Partial<VariantDraft>) => {
    setVariants((current) =>
      current.map((variant, currentIndex) =>
        currentIndex === index ? { ...variant, ...update } : variant,
      ),
    );
  };

  const selectExistingProduct = (index: number) => {
    setVariants((current) =>
      current.map((variant, currentIndex) => ({
        ...variant,
        keepExistingProduct: currentIndex === index,
      })),
    );
  };

  return (
    <Modal
      title="Revisar variantes detectadas"
      description="Confirma qué muestra cada foto y reparte el inventario actual. No se publica nada ni se cambia Mercado Libre automáticamente."
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-5xl"
    >
      <div className="space-y-5 pt-2">
        <div className="grid gap-4 rounded-lg border border-primary/20 bg-primary/5 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-2">
            <label
              htmlFor="review-variant-group-name"
              className="text-sm font-medium"
            >
              Nombre común del grupo
            </label>
            <Input
              id="review-variant-group-name"
              value={groupName}
              maxLength={180}
              disabled={loading}
              onChange={(event) => setGroupName(event.target.value)}
            />
          </div>
          <div className="rounded-md bg-background px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              Inventario por repartir:{" "}
            </span>
            <strong>{defaultVariant.stock} unidades</strong>
          </div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          La IA solo propuso opciones que se ven distintas en las fotos. Revisa
          color, diseño y tamaño; puedes corregir cualquier dato antes de crear
          las variantes.
        </div>

        <div className="space-y-4">
          {variants.map((variant, index) => {
            const sourceCandidate = candidateRows[index]?.candidate;
            const newColorLabel =
              variant.color.mode === "new"
                ? `Propuesta IA: ${variant.color.name}`
                : null;
            const newDesignLabel =
              variant.design.mode === "new"
                ? `Propuesta IA: ${variant.design.name}`
                : null;

            return (
              <article
                key={`${variant.imageUrl}-${index}`}
                className="grid gap-4 rounded-xl border p-4 lg:grid-cols-[7rem_minmax(0,1fr)]"
              >
                <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
                  <Image
                    src={variant.imageUrl}
                    alt={`Opción detectada ${index + 1}`}
                    fill
                    sizes="112px"
                    className="object-cover"
                    unoptimized
                  />
                </div>

                <div className="min-w-0 space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold">Opción {index + 1}</h3>
                      {variant.keepExistingProduct && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" /> Producto actual
                        </span>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant={
                        variant.keepExistingProduct ? "secondary" : "outline"
                      }
                      size="sm"
                      disabled={loading}
                      onClick={() => selectExistingProduct(index)}
                    >
                      <PackageCheck className="mr-2 h-4 w-4" />
                      Conservar este producto
                    </Button>
                  </div>

                  {sourceCandidate?.evidence && (
                    <p className="text-sm text-muted-foreground">
                      La foto muestra: {sourceCandidate.evidence}
                    </p>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Color</label>
                      <Select
                        value={attributeValue(variant.color)}
                        disabled={loading}
                        onValueChange={(value) =>
                          updateVariant(index, {
                            color: optionFromValue(
                              value,
                              colors,
                              variant.color,
                            ),
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {newColorLabel && (
                            <SelectItem value={attributeValue(variant.color)}>
                              {newColorLabel}
                            </SelectItem>
                          )}
                          {colors.map((color) => (
                            <SelectItem
                              key={color.id}
                              value={`existing:${color.id}`}
                            >
                              {color.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Diseño</label>
                      <Select
                        value={attributeValue(variant.design)}
                        disabled={loading}
                        onValueChange={(value) =>
                          updateVariant(index, {
                            design: optionFromValue(
                              value,
                              designs,
                              variant.design,
                            ),
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {newDesignLabel && (
                            <SelectItem value={attributeValue(variant.design)}>
                              {newDesignLabel}
                            </SelectItem>
                          )}
                          {designs.map((design) => (
                            <SelectItem
                              key={design.id}
                              value={`existing:${design.id}`}
                            >
                              {design.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Tamaño</label>
                      <Select
                        value={variant.sizeId}
                        disabled={loading}
                        onValueChange={(sizeId) =>
                          updateVariant(index, { sizeId })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {sizes.map((size) => (
                            <SelectItem key={size.id} value={size.id}>
                              {size.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Unidades</label>
                      <StockQuantityInput
                        value={variant.stock}
                        min={0}
                        max={defaultVariant.stock}
                        disabled={loading}
                        ariaLabel={`Unidades para opción ${index + 1}`}
                        onChange={(stock) => updateVariant(index, { stock })}
                      />
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-muted-foreground">
            Unidades asignadas:{" "}
            <strong className="text-foreground">
              {allocatedStock}/{defaultVariant.stock}
            </strong>
          </span>
          <span
            className={
              remainingStock === 0
                ? "font-medium text-emerald-700"
                : "font-medium text-amber-700"
            }
          >
            {remainingStock === 0
              ? "Inventario listo para crear las variantes"
              : `${Math.abs(remainingStock)} unidad${Math.abs(remainingStock) === 1 ? "" : "es"} ${remainingStock > 0 ? "sin asignar" : "asignada de más"}`}
          </span>
        </div>
        {duplicateCombination && (
          <p className="text-sm font-medium text-destructive">
            Dos opciones tienen la misma combinación de color, diseño y tamaño.
            Ajusta sus atributos para poder continuar.
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={loading || !canConfirm}
            onClick={() => onConfirm({ name: groupName.trim(), variants })}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crear variantes revisadas
          </Button>
        </div>
      </div>
    </Modal>
  );
}
