"use client";

import { Loader2, Plus, Sparkles, Trash } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import type {
  ProductImageAnalysis,
  ProductImageVariantCandidate,
} from "@/lib/product-image-analysis";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ProductTintBadge } from "@/app/(dashboard)/[storeId]/(routes)/productos/components/product-badges";
import { currencyFormatter } from "@/lib/utils";

type AttributeOption = { id: string; name: string; value?: string };

type VariantAttributePayload =
  | { mode: "existing"; id: string }
  | { mode: "new"; name: string; value?: string };

/** Lo que recibe `POST …/convert-to-variants/review`. */
export type ProductVariantReviewPayload = {
  name: string;
  copyOffers: boolean;
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

export const MAX_CONVERSION_OPTIONS = 3;

export interface ConversionSourceProduct {
  name: string;
  sku: string;
  slug: string;
  stock: number;
  price: number;
  acqPrice: number | null;
  gtin?: string | null;
  imageUrls: string[];
  colorId: string;
  designId: string;
  sizeId: string;
}

interface ConvertProductWizardProps {
  product: ConversionSourceProduct;
  /** Opciones que la IA vio en las fotos; llenan el paso 2 si hay dos o más. */
  analysis: ProductImageAnalysis | null;
  colors: AttributeOption[];
  designs: AttributeOption[];
  sizes: AttributeOption[];
  /** Ofertas vigentes del producto: se ofrecen copiar a las opciones nuevas. */
  activeOffers: { id: string; name: string }[];
  isOpen: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: (payload: ProductVariantReviewPayload) => void;
}

const STEPS = ["Nombre", "Opciones y reparto", "Resumen"] as const;

function candidateAttribute(
  candidate: ProductImageVariantCandidate,
  attribute: "color" | "design",
  fallbackId: string,
): VariantAttributePayload {
  const id = attribute === "color" ? candidate.colorId : candidate.designId;
  const source = attribute === "color" ? candidate.colorSource : candidate.designSource;
  const name = attribute === "color" ? candidate.colorName : candidate.designName;
  if (source === "existing" && id) return { mode: "existing", id };
  if (source === "new" && name) {
    return {
      mode: "new",
      name,
      ...(attribute === "color" && candidate.colorHex ? { value: candidate.colorHex } : {}),
    };
  }
  return { mode: "existing", id: fallbackId };
}

const attributeValue = (attribute: VariantAttributePayload) =>
  attribute.mode === "existing" ? `existing:${attribute.id}` : `new:${attribute.name}`;

function optionFromValue(
  value: string,
  options: AttributeOption[],
  current: VariantAttributePayload,
): VariantAttributePayload {
  if (value.startsWith("new:")) return current;
  const id = value.replace("existing:", "");
  return options.some((option) => option.id === id) ? { mode: "existing", id } : current;
}

const attributeName = (attribute: VariantAttributePayload, options: AttributeOption[]) =>
  attribute.mode === "new"
    ? attribute.name
    : (options.find((option) => option.id === attribute.id)?.name ?? "?");

function StepBar({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-muted-foreground">
      {STEPS.map((label, index) => {
        const number = index + 1;
        const active = number === current;
        return (
          <li key={label} className="flex items-center gap-1.5" aria-current={active ? "step" : undefined}>
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                active ? "bg-primary text-white" : "bg-muted text-muted-foreground"
              }`}
            >
              {number}
            </span>
            <span className={active ? "text-primary" : undefined}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * «Convertir en variantes» en tres pasos: nombre del grupo, opciones con el
 * reparto del inventario y un resumen antes de crear. El producto actual es
 * siempre la primera opción y conserva todo lo suyo; cada opción nueva usa
 * una foto distinta del producto y hereda precio, costo, envío y ofertas.
 */
export function ConvertProductWizard({
  product,
  analysis,
  colors,
  designs,
  sizes,
  activeOffers,
  isOpen,
  loading,
  onClose,
  onConfirm,
}: ConvertProductWizardProps) {
  const [step, setStep] = useState(1);
  const [groupName, setGroupName] = useState(product.name);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [copyOffers, setCopyOffers] = useState(true);

  const imageUrlsKey = product.imageUrls.join("|");
  const candidateRows = useMemo(() => {
    const urls = imageUrlsKey ? imageUrlsKey.split("|") : [];
    return (analysis?.variantCandidates ?? [])
      .map((candidate) => ({ candidate, imageUrl: urls[candidate.imageIndex] }))
      .filter((row): row is { candidate: ProductImageVariantCandidate; imageUrl: string } =>
        Boolean(row.imageUrl),
      );
  }, [analysis?.variantCandidates, imageUrlsKey]);

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setGroupName(product.name);
    setCopyOffers(true);
    const kept: VariantDraft = {
      imageUrl: product.imageUrls[0] ?? "",
      keepExistingProduct: true,
      stock: product.stock,
      color: { mode: "existing", id: product.colorId },
      design: { mode: "existing", id: product.designId },
      sizeId: product.sizeId,
    };
    if (candidateRows.length >= 2) {
      // La IA propone: la primera opción es el producto actual, las demás se crean.
      setVariants(
        candidateRows.slice(0, MAX_CONVERSION_OPTIONS).map(({ candidate, imageUrl }, index) => ({
          imageUrl,
          keepExistingProduct: index === 0,
          stock: index === 0 ? product.stock : 0,
          color: candidateAttribute(candidate, "color", product.colorId),
          design: candidateAttribute(candidate, "design", product.designId),
          sizeId: candidate.sizeId ?? product.sizeId,
        })),
      );
      return;
    }
    setVariants([kept]);
  }, [candidateRows, isOpen, product]);

  const allocated = variants.reduce((total, variant) => total + variant.stock, 0);
  const remaining = product.stock - allocated;
  const newOptions = variants.filter((variant) => !variant.keepExistingProduct);
  const canAddOption =
    variants.length < MAX_CONVERSION_OPTIONS && variants.length < product.imageUrls.length;
  const duplicatePhoto = new Set(variants.map((variant) => variant.imageUrl)).size !== variants.length;
  const duplicateCombination = (() => {
    const keys = new Set<string>();
    return variants.some((variant) => {
      const key = [attributeValue(variant.color), attributeValue(variant.design), variant.sizeId].join(":");
      if (keys.has(key)) return true;
      keys.add(key);
      return false;
    });
  })();
  const missingPhoto = variants.some((variant) => !variant.imageUrl);
  const stepTwoReady = remaining === 0 && !duplicatePhoto && !duplicateCombination && !missingPhoto;
  const normalizedName = groupName.trim();

  const updateVariant = (index: number, update: Partial<VariantDraft>) =>
    setVariants((current) =>
      current.map((variant, position) => (position === index ? { ...variant, ...update } : variant)),
    );
  const addOption = () => {
    const usedPhotos = new Set(variants.map((variant) => variant.imageUrl));
    const imageUrl = product.imageUrls.find((url) => !usedPhotos.has(url)) ?? "";
    setVariants((current) => [
      ...current,
      {
        imageUrl,
        keepExistingProduct: false,
        stock: 0,
        color: { mode: "existing", id: product.colorId },
        design: { mode: "existing", id: product.designId },
        sizeId: product.sizeId,
      },
    ]);
  };
  const removeOption = (index: number) =>
    setVariants((current) => current.filter((_, position) => position !== index));

  const optionLabel = (variant: VariantDraft) =>
    [attributeName(variant.color, colors), attributeName(variant.design, designs)].join(" · ");

  const photoIndex = (url: string) => product.imageUrls.indexOf(url) + 1;

  return (
    <Modal
      title={`Convertir «${product.name}» en un grupo`}
      description="El producto actual será la primera opción. Nada cambia en la tienda ni en Mercado Libre hasta que confirmes en el paso 3."
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-3xl"
    >
      <div className="flex flex-col gap-4 pt-1">
        <StepBar current={step} />

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="conversion-group-name" className="text-sm font-medium">
                Nombre para mostrar del grupo
              </label>
              <Input
                id="conversion-group-name"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                disabled={loading}
                maxLength={180}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">Común a todas las opciones, sin color ni diseño.</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
              <p>
                <span className="font-semibold text-primary">Qué no cambia:</span> el producto actual conserva su SKU
                {product.gtin ? ", GTIN" : ""}, precio, costo, stock, kardex, pedidos, reseñas y publicación de Mercado
                Libre; su URL <span className="font-mono">/producto/{product.slug}</span> sigue funcionando.
              </p>
              <p className="mt-1">
                <span className="font-semibold text-primary">Qué se copia a las opciones nuevas:</span> subcategoría,
                marca, descripción, precio {currencyFormatter(product.price)}, costo{" "}
                {currencyFormatter(product.acqPrice ?? 0)}, envío por unidad, opciones para clientes y las ofertas
                vigentes (lo eliges en el resumen).
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={loading} onClick={onClose}>
                Cancelar
              </Button>
              <Button type="button" disabled={loading || !normalizedName} onClick={() => setStep(2)}>
                Continuar
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
              Cada opción usa una foto distinta del producto. El stock actual ({product.stock}{" "}
              {product.stock === 1 ? "unidad" : "unidades"}) se reparte entero; el reparto queda en el kardex como
              «Conversión a variantes», no como ajuste manual.
            </p>
            {candidateRows.length >= 2 && (
              <p className="flex items-center gap-1.5 text-xs text-primary">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                La IA propuso estas opciones a partir de las fotos; revisa color, diseño y tamaño.
              </p>
            )}

            <div className="flex flex-col gap-3">
              {variants.map((variant, index) => {
                const kept = variant.keepExistingProduct;
                const evidence = candidateRows[index]?.candidate.evidence;
                return (
                  <article
                    key={index}
                    className={`grid gap-3 rounded-xl border p-3 sm:grid-cols-[4rem_minmax(0,1fr)] ${
                      kept ? "border-tint-mint bg-tint-mint/15" : ""
                    }`}
                  >
                    <div className="relative aspect-square w-16 overflow-hidden rounded-lg border bg-muted">
                      {variant.imageUrl && (
                        <Image
                          src={variant.imageUrl}
                          alt={`Foto de la opción ${index + 1}`}
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-primary">Opción {index + 1}</h3>
                        {kept ? (
                          <ProductTintBadge label="Se conserva" tone="mint" />
                        ) : (
                          <ProductTintBadge label="Se crea" tone="lavender" />
                        )}
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {kept ? `Es el producto actual · ${product.sku}` : "Nueva · SKU al guardar · sin código"}
                        </span>
                        {!kept && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="ml-auto text-destructive"
                            disabled={loading}
                            aria-label={`Quitar la opción ${index + 1}`}
                            onClick={() => removeOption(index)}
                          >
                            <Trash className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                      {evidence && <p className="text-xs text-muted-foreground">La foto muestra: {evidence}</p>}
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-medium" htmlFor={`conv-photo-${index}`}>
                            Foto
                          </label>
                          <Select
                            value={variant.imageUrl}
                            disabled={loading}
                            onValueChange={(imageUrl) => updateVariant(index, { imageUrl })}
                          >
                            <SelectTrigger id={`conv-photo-${index}`} aria-label={`Foto de la opción ${index + 1}`}>
                              <SelectValue placeholder="Elige una foto" />
                            </SelectTrigger>
                            <SelectContent>
                              {product.imageUrls.map((url, position) => (
                                <SelectItem key={url} value={url}>
                                  Foto {position + 1}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-medium" htmlFor={`conv-color-${index}`}>
                            Color
                          </label>
                          <Select
                            value={attributeValue(variant.color)}
                            disabled={loading}
                            onValueChange={(value) =>
                              updateVariant(index, { color: optionFromValue(value, colors, variant.color) })
                            }
                          >
                            <SelectTrigger id={`conv-color-${index}`} aria-label={`Color de la opción ${index + 1}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {variant.color.mode === "new" && (
                                <SelectItem value={attributeValue(variant.color)}>
                                  Nuevo: {variant.color.name}
                                </SelectItem>
                              )}
                              {colors.map((color) => (
                                <SelectItem key={color.id} value={`existing:${color.id}`}>
                                  {color.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-medium" htmlFor={`conv-design-${index}`}>
                            Diseño
                          </label>
                          <Select
                            value={attributeValue(variant.design)}
                            disabled={loading}
                            onValueChange={(value) =>
                              updateVariant(index, { design: optionFromValue(value, designs, variant.design) })
                            }
                          >
                            <SelectTrigger id={`conv-design-${index}`} aria-label={`Diseño de la opción ${index + 1}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {variant.design.mode === "new" && (
                                <SelectItem value={attributeValue(variant.design)}>
                                  Nuevo: {variant.design.name}
                                </SelectItem>
                              )}
                              {designs.map((design) => (
                                <SelectItem key={design.id} value={`existing:${design.id}`}>
                                  {design.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-medium" htmlFor={`conv-size-${index}`}>
                            Tamaño
                          </label>
                          <Select
                            value={variant.sizeId}
                            disabled={loading}
                            onValueChange={(sizeId) => updateVariant(index, { sizeId })}
                          >
                            <SelectTrigger id={`conv-size-${index}`} aria-label={`Tamaño de la opción ${index + 1}`}>
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
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-medium">Unidades</span>
                          <StockQuantityInput
                            value={variant.stock}
                            min={0}
                            max={product.stock}
                            disabled={loading}
                            ariaLabel={`Unidades para la opción ${index + 1}`}
                            onChange={(stock) => updateVariant(index, { stock })}
                          />
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" disabled={loading || !canAddOption} onClick={addOption}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Otra opción
              </Button>
              {!canAddOption && (
                <span className="text-xs text-muted-foreground">
                  {variants.length >= MAX_CONVERSION_OPTIONS
                    ? `Máximo ${MAX_CONVERSION_OPTIONS} opciones por conversión; las demás se agregan luego desde el grupo.`
                    : "Cada opción necesita su propia foto: sube otra foto o agrega opciones luego desde el grupo."}
                </span>
              )}
            </div>

            <div
              className={`rounded-lg border p-3 text-xs ${
                remaining === 0 ? "border-tint-mint bg-tint-mint/20" : "border-tint-cream bg-tint-cream/30"
              }`}
              role="status"
            >
              {remaining === 0
                ? "Inventario repartido por completo."
                : remaining > 0
                  ? `Faltan ${remaining} ${remaining === 1 ? "unidad" : "unidades"} por repartir.`
                  : `Hay ${Math.abs(remaining)} ${Math.abs(remaining) === 1 ? "unidad asignada" : "unidades asignadas"} de más.`}
              {newOptions.length > 0 &&
                ` Cada opción nueva hereda el precio ${currencyFormatter(product.price)} y el costo ${currencyFormatter(product.acqPrice ?? 0)}.`}
              {duplicatePhoto && " Dos opciones usan la misma foto."}
              {duplicateCombination && " Dos opciones tienen la misma combinación de color, diseño y tamaño."}
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button type="button" variant="outline" disabled={loading} onClick={() => setStep(1)}>
                Atrás
              </Button>
              <Button type="button" disabled={loading || !stepTwoReady} onClick={() => setStep(3)}>
                Revisar
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-primary">Antes de crear el grupo «{normalizedName}»</h3>
            <ul className="flex flex-col gap-2 text-sm">
              {variants.map((variant, index) => (
                <li key={index} className="flex flex-wrap items-start gap-2">
                  {variant.keepExistingProduct ? (
                    <ProductTintBadge label="Se conserva" tone="mint" />
                  ) : (
                    <ProductTintBadge label="Se crea" tone="lavender" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{optionLabel(variant)}</span>
                    {variant.keepExistingProduct
                      ? ` · ${variant.stock} und · ${product.sku} · precio, kardex, pedidos y Mercado Libre intactos.`
                      : ` · ${variant.stock} und (movimiento «Conversión a variantes») · precio ${currencyFormatter(product.price)} · foto ${photoIndex(variant.imageUrl)} · sin código.`}
                  </span>
                </li>
              ))}
              <li className="flex flex-wrap items-start gap-2">
                <ProductTintBadge label="URL" tone="sky" />
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-xs">/producto/{product.slug}</span> sigue abriendo el producto actual
                  {newOptions.length > 0 ? "; cada opción nueva tendrá su propia URL." : "."}
                </span>
              </li>
              {newOptions.length > 0 && activeOffers.length > 0 && (
                <li className="flex flex-wrap items-start gap-2">
                  <ProductTintBadge label="Oferta" tone="pink" />
                  <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                    <Checkbox
                      checked={copyOffers}
                      disabled={loading}
                      onCheckedChange={(checked) => setCopyOffers(checked === true)}
                      aria-label="Copiar las ofertas vigentes a las opciones nuevas"
                      className="mt-0.5"
                    />
                    <span>
                      Copiar {activeOffers.map((offer) => `«${offer.name}»`).join(", ")} a{" "}
                      {newOptions.length === 1 ? "la opción nueva" : "las opciones nuevas"}.
                    </span>
                  </label>
                </li>
              )}
              <li className="flex flex-wrap items-start gap-2">
                <ProductTintBadge label="Deshacer" tone="cream" />
                <span className="min-w-0 flex-1">
                  Desde el grupo, «Desagrupar» devuelve las opciones a productos sueltos sin borrar nada.
                </span>
              </li>
            </ul>
            <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              Las reseñas se muestran para todo el grupo. Nada se publica en Mercado Libre. La tienda se actualiza
              sola al terminar.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button type="button" variant="outline" disabled={loading} onClick={() => setStep(2)}>
                Atrás
              </Button>
              <Button
                type="button"
                disabled={loading || !stepTwoReady || !normalizedName}
                onClick={() =>
                  onConfirm({
                    name: normalizedName,
                    copyOffers: newOptions.length > 0 && activeOffers.length > 0 ? copyOffers : false,
                    variants,
                  })
                }
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                Crear grupo
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
