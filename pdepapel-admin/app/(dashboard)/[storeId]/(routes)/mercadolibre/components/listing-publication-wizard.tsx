"use client";

import {
  AsyncProductSelect,
  type AsyncProductOption,
} from "@/components/ui/async-product-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { Textarea } from "@/components/ui/textarea";
import {
  getListingWizardStepError,
  type ListingWizardStep,
} from "@/lib/mercadolibre/listing-wizard";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Loader2,
} from "lucide-react";
import Image from "next/image";
import { useState, type Dispatch, type SetStateAction } from "react";

export type ListingPublicationForm = {
  productId: string;
  marketplacePrice: string;
  categoryId: string;
  stockSafetyBuffer: string;
  minimumMarginAmount: string;
  syncPrice: boolean;
  imageUrls: string[];
  attributes: string;
};

export type ListingPublicationProduct = {
  id: string;
  name: string;
  sku: string;
  stock: number;
  acqPrice: number | null;
  images: { url: string; isMain?: boolean }[];
  price: number;
  category?: { id: string; name: string } | null;
};

export type ListingPublicationCategorySuggestion = {
  categoryId: string;
  categoryName: string;
  domainId: string | null;
  domainName: string | null;
};

export type ListingPublicationCategoryAttribute = {
  id: string;
  name: string;
  required: boolean;
  valueType: string;
  values: { id: string; name: string }[];
};

export type ListingPublicationCategoryTemplate = {
  id: string;
  categoryId: string;
  name: string;
};

export type ListingPublicationQuickProfile = {
  id: string;
  name: string;
  categoryId: string;
  stockSafetyBuffer: number;
  minimumMarginAmount: number | null;
  localCategory: { id: string; name: string };
};

export type ListingPublicationPriceEstimate = {
  saleFeeAmount: number;
  percentageFee: number | null;
  fixedFee: number | null;
  listingTypeId: string | null;
  listingTypeName: string | null;
};

type ListingPublicationWizardProps = {
  editing: boolean;
  canPublishDirectly: boolean;
  form: ListingPublicationForm;
  setForm: Dispatch<SetStateAction<ListingPublicationForm>>;
  selectedProduct: ListingPublicationProduct | null;
  suggestions: ListingPublicationCategorySuggestion[];
  categoryAttributes: ListingPublicationCategoryAttribute[];
  categoryTemplates: ListingPublicationCategoryTemplate[];
  quickProfile: ListingPublicationQuickProfile | null;
  priceEstimate: ListingPublicationPriceEstimate | null;
  isSearchingCategories: boolean;
  isLoadingCategoryAttributes: boolean;
  isLoadingPriceEstimate: boolean;
  isSuggestingPrice: boolean;
  isSaving: boolean;
  isSavingTemplate: boolean;
  isSavingQuickProfile: boolean;
  onError: (message: string) => void;
  onFormChange: (key: keyof ListingPublicationForm, value: string) => void;
  onProductChange: (
    productId: string,
    product?: AsyncProductOption | null,
  ) => void;
  onSearchCategories: () => Promise<void>;
  onCategoryChange: (categoryId: string) => void;
  onLoadCategoryAttributes: () => Promise<boolean>;
  onLoadPriceEstimate: () => Promise<void>;
  onApplyCategoryTemplate: (templateId: string) => void;
  onSaveCategoryTemplate: () => Promise<void>;
  onSaveQuickProfile: () => Promise<void>;
  onSave: () => Promise<unknown>;
  onSaveAndPublish: () => Promise<void>;
};

const steps: { number: ListingWizardStep; label: string }[] = [
  { number: 1, label: "Producto" },
  { number: 2, label: "Categoría y fotos" },
  { number: 3, label: "Ficha técnica" },
  { number: 4, label: "Revisar y publicar" },
];

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function toCurrencyInputValue(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toStockQuantityValue(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 1;
}

function getAttributeValues(value: string) {
  const values = new Map<string, string>();

  for (const line of value.split("\n")) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const id = line.slice(0, separatorIndex).trim().toUpperCase();
    const attributeValue = line.slice(separatorIndex + 1).trim();
    if (id && attributeValue) values.set(id, attributeValue);
  }

  return values;
}

function updateAttributeValue(
  value: string,
  attributeId: string,
  attributeValue: string,
) {
  const values = getAttributeValues(value);
  if (attributeValue.trim()) {
    values.set(attributeId, attributeValue.trim());
  } else {
    values.delete(attributeId);
  }
  return Array.from(values, ([id, name]) => `${id}=${name}`).join("\n");
}

export function ListingPublicationWizard({
  editing,
  canPublishDirectly,
  form,
  setForm,
  selectedProduct,
  suggestions,
  categoryAttributes,
  categoryTemplates,
  quickProfile,
  priceEstimate,
  isSearchingCategories,
  isLoadingCategoryAttributes,
  isLoadingPriceEstimate,
  isSuggestingPrice,
  isSaving,
  isSavingTemplate,
  isSavingQuickProfile,
  onError,
  onFormChange,
  onProductChange,
  onSearchCategories,
  onCategoryChange,
  onLoadCategoryAttributes,
  onLoadPriceEstimate,
  onApplyCategoryTemplate,
  onSaveCategoryTemplate,
  onSaveQuickProfile,
  onSave,
  onSaveAndPublish,
}: ListingPublicationWizardProps) {
  const [step, setStep] = useState<ListingWizardStep>(1);
  const requiredAttributes = categoryAttributes.filter(
    (attribute) => attribute.required,
  );
  const unitsToPublish = Math.max(
    (selectedProduct?.stock ?? 0) -
      Math.max(Number(form.stockSafetyBuffer) || 0, 0),
    0,
  );

  const goToNextStep = async () => {
    const validationError = getListingWizardStepError({
      step,
      productId: form.productId,
      marketplacePrice: form.marketplacePrice,
      categoryId: form.categoryId,
      imageUrls: form.imageUrls,
      attributes: form.attributes,
      categoryAttributes,
    });
    if (validationError) {
      onError(validationError);
      return;
    }

    if (step === 2) {
      const didLoadAttributes = await onLoadCategoryAttributes();
      if (!didLoadAttributes) return;
    }

    setStep((currentStep) => Math.min(currentStep + 1, 4) as ListingWizardStep);
  };

  return (
    <div className="space-y-5 py-2">
      <ol
        className="grid grid-cols-4 gap-2"
        aria-label="Pasos de la publicación"
      >
        {steps.map((wizardStep) => {
          const isCurrent = wizardStep.number === step;
          const isComplete = wizardStep.number < step;
          return (
            <li key={wizardStep.number} className="min-w-0">
              <div
                className={`flex min-h-10 items-center gap-2 rounded-md border px-2 py-1.5 text-xs sm:px-3 sm:text-sm ${isCurrent ? "border-primary bg-primary/5 font-medium text-foreground" : isComplete ? "border-success/30 bg-success/5 text-foreground" : "border-border text-muted-foreground"}`}
                aria-current={isCurrent ? "step" : undefined}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${isComplete ? "bg-success text-success-foreground" : isCurrent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  {isComplete ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    wizardStep.number
                  )}
                </span>
                <span className="hidden truncate sm:inline">
                  {wizardStep.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      {step === 1 ? (
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="mercadolibre-product">Producto de P de Papel</Label>
            <AsyncProductSelect
              value={form.productId}
              id="mercadolibre-product"
              modal
              disabled={editing}
              ariaLabel="Producto local para la publicación"
              placeholder="Buscar por nombre o SKU..."
              onChange={onProductChange}
            />
            {selectedProduct ? (
              <p className="text-xs text-muted-foreground">
                SKU {selectedProduct.sku || "sin SKU"} · Stock local{" "}
                {selectedProduct.stock}
              </p>
            ) : null}
            {quickProfile ? (
              <div className="rounded-md border border-primary/20 bg-primary/[0.03] p-3 text-sm">
                <p className="font-medium">
                  Perfil rápido aplicado: {quickProfile.name}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Propone categoría, ficha técnica, fotos del producto, unidades
                  de seguridad y utilidad objetivo. Puedes modificar cada valor
                  antes de publicar.
                </p>
              </div>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="mercadolibre-price">Precio de Mercado Libre</Label>
            <CurrencyInput
              id="mercadolibre-price"
              inputMode="numeric"
              value={toCurrencyInputValue(form.marketplacePrice)}
              onChange={(value) =>
                onFormChange(
                  "marketplacePrice",
                  value === undefined ? "" : String(value),
                )
              }
              placeholder="Ej. 18500"
            />
            <p className="text-xs text-muted-foreground">
              Este precio es independiente del precio de la tienda en línea.
            </p>
            {isSuggestingPrice ? (
              <p className="text-xs text-muted-foreground">
                Calculando un precio sugerido según la comisión estimada…
              </p>
            ) : quickProfile && quickProfile.minimumMarginAmount !== null ? (
              <p className="text-xs text-muted-foreground">
                El precio sugerido busca dejar una utilidad de al menos{" "}
                {currencyFormatter.format(quickProfile.minimumMarginAmount)}{" "}
                después de la comisión estimada y antes de envío e impuestos.
              </p>
            ) : null}
          </div>
          <details className="rounded-md border bg-muted/20 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Ajustes de stock y precio
            </summary>
            <div className="mt-3 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="mercadolibre-buffer">
                  Unidades de seguridad
                </Label>
                <StockQuantityInput
                  id="mercadolibre-buffer"
                  ariaLabel="Unidades de seguridad"
                  ariaDescribedBy="mercadolibre-buffer-description"
                  value={toStockQuantityValue(form.stockSafetyBuffer)}
                  onChange={(value) =>
                    onFormChange("stockSafetyBuffer", String(value))
                  }
                  min={0}
                  max={10_000}
                />
                <p
                  id="mercadolibre-buffer-description"
                  className="text-xs text-muted-foreground"
                >
                  Se reservan para evitar vender más unidades de las
                  disponibles.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mercadolibre-minimum-margin">
                  Utilidad objetivo tras comisión (opcional)
                </Label>
                <CurrencyInput
                  id="mercadolibre-minimum-margin"
                  inputMode="numeric"
                  value={toCurrencyInputValue(form.minimumMarginAmount)}
                  onChange={(value) =>
                    onFormChange(
                      "minimumMarginAmount",
                      value === undefined ? "" : String(value),
                    )
                  }
                  placeholder="Ej. 12000"
                />
                <p className="text-xs text-muted-foreground">
                  El precio sugerido no contempla envío, impuestos ni descuentos
                  posteriores.
                </p>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <Checkbox
                  id="mercadolibre-sync-price"
                  className="mt-0.5"
                  checked={form.syncPrice}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({
                      ...current,
                      syncPrice: checked === true,
                    }))
                  }
                />
                <Label
                  htmlFor="mercadolibre-sync-price"
                  className="cursor-pointer"
                >
                  <span className="block font-medium">
                    Mantener este precio desde Administración
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Actualiza solo Mercado Libre, nunca el precio de la tienda.
                  </span>
                </Label>
              </div>
            </div>
          </details>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="mercadolibre-category">
                Categoría de Mercado Libre
              </Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void onSearchCategories()}
                disabled={isSearchingCategories || !selectedProduct}
              >
                {isSearchingCategories ? "Buscando…" : "Sugerir categoría"}
              </Button>
            </div>
            <Input
              id="mercadolibre-category"
              value={form.categoryId}
              onChange={(event) => onCategoryChange(event.target.value)}
              placeholder="Ej. MCO..."
            />
            {suggestions.length > 0 ? (
              <div className="grid gap-2 rounded-md border p-2">
                {suggestions.map((suggestion) => (
                  <Button
                    key={`${suggestion.domainId}-${suggestion.categoryId}`}
                    type="button"
                    variant="ghost"
                    className="h-auto justify-start whitespace-normal px-2 py-2 text-left"
                    onClick={() => onCategoryChange(suggestion.categoryId)}
                  >
                    <span>
                      <span className="block font-medium">
                        {suggestion.categoryName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {suggestion.categoryId}
                      </span>
                    </span>
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 rounded-md border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Fotos para Mercado Libre</p>
                <p className="text-xs text-muted-foreground">
                  Elige las fotos que se enviarán. La primera será la portada.
                </p>
              </div>
              <Badge variant="secondary">
                {form.imageUrls.length} seleccionada
                {form.imageUrls.length === 1 ? "" : "s"}
              </Badge>
            </div>
            {selectedProduct?.images.length ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {selectedProduct.images.map((image) => {
                    const selected = form.imageUrls.includes(image.url);
                    return (
                      <button
                        key={image.url}
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            imageUrls: selected
                              ? current.imageUrls.filter(
                                  (url) => url !== image.url,
                                )
                              : [...current.imageUrls, image.url],
                          }))
                        }
                        className={`relative aspect-square overflow-hidden rounded-md border-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"}`}
                        aria-label={
                          selected
                            ? "Quitar foto de la publicación"
                            : "Agregar foto a la publicación"
                        }
                        aria-pressed={selected}
                      >
                        <Image
                          src={image.url}
                          alt="Foto disponible del producto"
                          fill
                          sizes="(max-width: 640px) 45vw, 9rem"
                          className="object-cover"
                        />
                        <span className="absolute inset-x-1 bottom-1 rounded bg-background/90 px-1 py-0.5 text-center text-[10px] font-medium shadow-sm">
                          {selected
                            ? form.imageUrls[0] === image.url
                              ? "Portada"
                              : "Incluida"
                            : "No usar"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {form.imageUrls.length > 1 ? (
                  <div className="grid gap-1 sm:max-w-sm">
                    <Label htmlFor="mercadolibre-cover-image">
                      Foto de portada
                    </Label>
                    <Select
                      value={form.imageUrls[0]}
                      onValueChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          imageUrls: [
                            value,
                            ...current.imageUrls.filter(
                              (url) => url !== value,
                            ),
                          ],
                        }))
                      }
                    >
                      <SelectTrigger id="mercadolibre-cover-image">
                        <SelectValue placeholder="Selecciona la portada" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {form.imageUrls.map((url, index) => (
                            <SelectItem key={url} value={url}>
                              Foto {index + 1}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-destructive">
                Este producto no tiene imágenes. Agrégalas desde Productos antes
                de publicar.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 p-3">
            <div>
              <p className="text-sm font-medium">Ficha técnica</p>
              <p className="text-xs text-muted-foreground">
                Completa los campos que Mercado Libre pide para esta categoría.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void onLoadCategoryAttributes()}
              disabled={isLoadingCategoryAttributes}
            >
              {isLoadingCategoryAttributes ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Actualizar campos
            </Button>
          </div>
          {form.categoryId ? (
            <div className="flex flex-col gap-2 rounded-md border border-dashed bg-background/60 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">Plantilla de esta categoría</p>
                <p className="text-xs text-muted-foreground">
                  Reutiliza una ficha técnica que ya aprobaste para{" "}
                  {form.categoryId}.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {categoryTemplates.map((template) => (
                  <Button
                    key={template.id}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onApplyCategoryTemplate(template.id)}
                  >
                    Usar {template.name}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void onSaveCategoryTemplate()}
                  disabled={isSavingTemplate}
                >
                  {isSavingTemplate ? "Guardando…" : "Guardar ficha técnica"}
                </Button>
              </div>
            </div>
          ) : null}
          {selectedProduct?.category ? (
            <div className="flex flex-col gap-2 rounded-md border border-dashed bg-background/60 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">
                  Perfil rápido para {selectedProduct.category.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  Guarda estos valores como propuesta para los próximos
                  productos de esta categoría local. Siempre se podrán editar.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void onSaveQuickProfile()}
                disabled={isSavingQuickProfile}
              >
                {isSavingQuickProfile
                  ? "Guardando…"
                  : quickProfile
                    ? "Actualizar perfil rápido"
                    : "Crear perfil rápido"}
              </Button>
            </div>
          ) : null}
          {requiredAttributes.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {requiredAttributes.map((attribute) => {
                const currentValue =
                  getAttributeValues(form.attributes).get(attribute.id) ?? "";
                return (
                  <div key={attribute.id} className="grid gap-1">
                    <Label htmlFor={`mercadolibre-attribute-${attribute.id}`}>
                      {attribute.name}{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    {attribute.values.length > 0 ? (
                      <Select
                        value={currentValue}
                        onValueChange={(value) =>
                          onFormChange(
                            "attributes",
                            updateAttributeValue(
                              form.attributes,
                              attribute.id,
                              value,
                            ),
                          )
                        }
                      >
                        <SelectTrigger
                          id={`mercadolibre-attribute-${attribute.id}`}
                        >
                          <SelectValue placeholder="Selecciona una opción" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {attribute.values.map((option) => (
                              <SelectItem key={option.id} value={option.name}>
                                {option.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={`mercadolibre-attribute-${attribute.id}`}
                        value={currentValue}
                        inputMode={
                          attribute.valueType === "number"
                            ? "decimal"
                            : undefined
                        }
                        onChange={(event) =>
                          onFormChange(
                            "attributes",
                            updateAttributeValue(
                              form.attributes,
                              attribute.id,
                              event.target.value,
                            ),
                          )
                        }
                        placeholder={
                          attribute.valueType === "number"
                            ? "Ej. 12"
                            : `Escribe ${attribute.name.toLowerCase()}`
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              Mercado Libre no reportó campos obligatorios adicionales para esta
              categoría.
            </p>
          )}
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Características adicionales (opcional)
            </summary>
            <div className="mt-3 grid gap-2">
              <Textarea
                id="mercadolibre-attributes"
                value={form.attributes}
                onChange={(event) =>
                  onFormChange("attributes", event.target.value)
                }
                placeholder={
                  "Una por línea, por ejemplo:\nCOLOR=Rosado\nMATERIAL=Plástico"
                }
                className="min-h-28 font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Marca, MPN y GTIN se agregan automáticamente cuando el producto
                los tiene.
              </p>
            </div>
          </details>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-4">
          <div className="grid gap-3 rounded-md border bg-muted/20 p-4 text-sm sm:grid-cols-2">
            <p>
              <span className="block text-xs text-muted-foreground">
                Producto
              </span>
              <span className="font-medium">{selectedProduct?.name}</span>
              <span className="block text-xs text-muted-foreground">
                SKU {selectedProduct?.sku || "sin SKU"}
              </span>
            </p>
            <p>
              <span className="block text-xs text-muted-foreground">
                Precio de Mercado Libre
              </span>
              <span className="font-medium">
                {currencyFormatter.format(Number(form.marketplacePrice) || 0)}
              </span>
            </p>
            <p>
              <span className="block text-xs text-muted-foreground">
                Categoría
              </span>
              <span className="font-medium">{form.categoryId}</span>
            </p>
            <p>
              <span className="block text-xs text-muted-foreground">
                Stock para publicar
              </span>
              <span className="font-medium">{unitsToPublish} unidades</span>
              <span className="block text-xs text-muted-foreground">
                Stock local {selectedProduct?.stock ?? 0} · Seguridad{" "}
                {Number(form.stockSafetyBuffer) || 0}
              </span>
            </p>
            <p>
              <span className="block text-xs text-muted-foreground">Fotos</span>
              <span className="font-medium">
                {form.imageUrls.length} seleccionada
                {form.imageUrls.length === 1 ? "" : "s"}
              </span>
            </p>
            <p>
              <span className="block text-xs text-muted-foreground">
                Ficha técnica
              </span>
              <span className="font-medium">
                {requiredAttributes.length} campo
                {requiredAttributes.length === 1 ? "" : "s"} obligatorio
                {requiredAttributes.length === 1 ? "" : "s"}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
            <div>
              <p className="font-medium">Comisión estimada</p>
              <p className="text-xs text-muted-foreground">
                El valor final puede variar por envío, impuestos y descuentos.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void onLoadPriceEstimate()}
              disabled={isLoadingPriceEstimate}
            >
              {isLoadingPriceEstimate ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CircleDollarSign className="mr-2 h-4 w-4" />
              )}
              Calcular comisión
            </Button>
          </div>
          {priceEstimate ? (
            <div className="grid gap-2 rounded-md border border-primary/20 bg-primary/[0.03] p-3 text-sm sm:grid-cols-3">
              <p>
                <span className="block text-xs text-muted-foreground">
                  Comisión estimada
                </span>
                <span className="font-semibold">
                  {currencyFormatter.format(priceEstimate.saleFeeAmount)}
                </span>
              </p>
              <p>
                <span className="block text-xs text-muted-foreground">
                  Neto antes de envío e impuestos
                </span>
                <span className="font-semibold">
                  {currencyFormatter.format(
                    Number(form.marketplacePrice) - priceEstimate.saleFeeAmount,
                  )}
                </span>
              </p>
              <p>
                <span className="block text-xs text-muted-foreground">
                  Margen antes de envío e impuestos
                </span>
                <span className="font-semibold">
                  {currencyFormatter.format(
                    Number(form.marketplacePrice) -
                      priceEstimate.saleFeeAmount -
                      (selectedProduct?.acqPrice ?? 0),
                  )}
                </span>
              </p>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Al publicar, Administración enviará el producto, fotos, precio,
            stock y ficha técnica a Mercado Libre.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
        {step > 1 ? (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setStep((currentStep) => (currentStep - 1) as ListingWizardStep)
            }
            disabled={isSaving}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Anterior
          </Button>
        ) : (
          <span />
        )}
        {step < 4 ? (
          <Button
            type="button"
            onClick={() => void goToNextStep()}
            disabled={isLoadingCategoryAttributes}
          >
            {step === 2 && isLoadingCategoryAttributes ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ChevronRight className="mr-2 h-4 w-4" />
            )}
            Continuar
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void onSave()}
              disabled={isSaving}
            >
              {isSaving ? "Guardando…" : "Guardar borrador"}
            </Button>
            {canPublishDirectly ? (
              <Button
                type="button"
                onClick={() => void onSaveAndPublish()}
                disabled={isSaving}
              >
                Publicar ahora
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
