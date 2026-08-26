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
import { MeasurementInput } from "@/components/ui/measurement-input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  Info,
  Loader2,
  Truck,
} from "lucide-react";
import Image from "next/image";
import { useState, type Dispatch, type SetStateAction } from "react";

export type ListingPublicationForm = {
  productId: string;
  familyName: string;
  marketplacePrice: string;
  categoryId: string;
  listingType: string;
  stockSafetyBuffer: string;
  minimumMarginAmount: string;
  syncPrice: boolean;
  imageUrls: string[];
  attributes: string;
  freeShipping: boolean;
  localPickUp: boolean;
  packageHeightCm: string;
  packageWidthCm: string;
  packageLengthCm: string;
  packageWeightGrams: string;
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
  financingAddOnFee: number | null;
  listingFeeAmount: number | null;
  listingTypeId: string | null;
  listingTypeName: string | null;
  listingExposure: string | null;
  installmentCount: number | null;
  installmentLabel: string | null;
};

export type ListingPublicationShippingEstimate = {
  sellerCost: number;
  currencyId: string | null;
  billableWeightGrams: number | null;
  discountRate: number | null;
  promotedAmount: number | null;
};

export type ListingPublicationShippingComparison = {
  buyerPays: ListingPublicationShippingEstimate | null;
  sellerOffersFree: ListingPublicationShippingEstimate;
  currentFreeShipping: boolean | null;
  mandatoryFreeShipping: boolean;
  logisticType: string | null;
};

export type ListingPublicationActiveSaleConditions = {
  current: {
    listingType: string;
    categoryId: string;
    price: number;
    shippingMode: string | null;
    logisticType: string | null;
    freeShipping: boolean;
    localPickUp: boolean;
    mandatoryFreeShipping: boolean;
  };
  availableListingTypes: string[];
  options: ListingPublicationPriceEstimate[];
};

type ListingPublicationWizardProps = {
  storeId: string;
  editing: boolean;
  activePublication: boolean;
  activeSaleConditions: ListingPublicationActiveSaleConditions | null;
  canPublishDirectly: boolean;
  form: ListingPublicationForm;
  setForm: Dispatch<SetStateAction<ListingPublicationForm>>;
  error: string | null;
  selectedProduct: ListingPublicationProduct | null;
  suggestions: ListingPublicationCategorySuggestion[];
  categoryAttributes: ListingPublicationCategoryAttribute[];
  verifiedCategoryId: string | null;
  categoryTemplates: ListingPublicationCategoryTemplate[];
  quickProfile: ListingPublicationQuickProfile | null;
  priceEstimate: ListingPublicationPriceEstimate | null;
  priceOptions: ListingPublicationPriceEstimate[];
  shippingComparison: ListingPublicationShippingComparison | null;
  isSearchingCategories: boolean;
  isLoadingCategoryAttributes: boolean;
  isLoadingPriceEstimate: boolean;
  isLoadingShippingComparison: boolean;
  isLoadingSaleConditions: boolean;
  isApplyingSaleConditions: boolean;
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
  onLoadShippingComparison: () => Promise<unknown>;
  onApplyActiveSaleConditions: () => Promise<void>;
  onListingTypeChange: (listingType: string) => void;
  onSuggestPriceFromTarget: () => Promise<void>;
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
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function toMeasurementValue(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function formatSignedCurrency(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${currencyFormatter.format(Math.abs(value))}`;
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
  storeId,
  editing,
  activePublication,
  activeSaleConditions,
  canPublishDirectly,
  form,
  setForm,
  error,
  selectedProduct,
  suggestions,
  categoryAttributes,
  verifiedCategoryId,
  categoryTemplates,
  quickProfile,
  priceEstimate,
  priceOptions,
  shippingComparison,
  isSearchingCategories,
  isLoadingCategoryAttributes,
  isLoadingPriceEstimate,
  isLoadingShippingComparison,
  isLoadingSaleConditions,
  isApplyingSaleConditions,
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
  onLoadShippingComparison,
  onApplyActiveSaleConditions,
  onListingTypeChange,
  onSuggestPriceFromTarget,
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
  const hasPublishableStock = unitsToPublish > 0;
  const marketplacePrice = Number(form.marketplacePrice);
  const hasMarketplacePrice =
    Number.isFinite(marketplacePrice) && marketplacePrice > 0;
  const priceDifference =
    selectedProduct && hasMarketplacePrice
      ? marketplacePrice - selectedProduct.price
      : null;
  const targetProfit = Number(form.minimumMarginAmount);
  const hasTargetProfit =
    form.minimumMarginAmount.trim() !== "" &&
    Number.isFinite(targetProfit) &&
    targetProfit >= 0;
  const hasAcquisitionCost =
    selectedProduct?.acqPrice !== null &&
    selectedProduct?.acqPrice !== undefined;
  const canSuggestPriceFromTarget =
    hasTargetProfit &&
    hasAcquisitionCost &&
    Boolean(form.categoryId.trim()) &&
    (!form.freeShipping || Boolean(shippingComparison));
  const selectedShippingEstimate = shippingComparison
    ? form.freeShipping
      ? shippingComparison.sellerOffersFree
      : shippingComparison.buyerPays
    : null;
  const estimatedSellerShippingCost = selectedShippingEstimate
    ? selectedShippingEstimate.sellerCost
    : form.freeShipping || shippingComparison
      ? null
      : 0;
  const financingCost = priceEstimate?.financingAddOnFee ?? 0;
  const baseMarketplaceFee = priceEstimate
    ? Math.max(priceEstimate.saleFeeAmount - financingCost, 0)
    : null;
  const estimatedProfit =
    priceEstimate && hasAcquisitionCost && estimatedSellerShippingCost !== null
      ? marketplacePrice -
        priceEstimate.saleFeeAmount -
        estimatedSellerShippingCost -
        (selectedProduct?.acqPrice ?? 0)
      : null;
  const profitDifference =
    estimatedProfit !== null && hasTargetProfit
      ? estimatedProfit - targetProfit
      : null;
  const activeConditionsChanged = Boolean(
    activePublication &&
      activeSaleConditions &&
      (form.listingType !== activeSaleConditions.current.listingType ||
        form.freeShipping !== activeSaleConditions.current.freeShipping),
  );
  const lowestSaleFee =
    priceOptions.length > 0
      ? Math.min(...priceOptions.map((option) => option.saleFeeAmount))
      : null;

  const goToNextStep = async () => {
    const validationError = getListingWizardStepError({
      step,
      productId: form.productId,
      familyName: form.familyName,
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

    if (step === 3) {
      await onLoadPriceEstimate();
    }

    setStep((currentStep) => Math.min(currentStep + 1, 4) as ListingWizardStep);
  };

  return (
    <div className="space-y-5 py-2">
      {error ? (
        <p
          className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
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
              value={form.productId ?? ""}
              id="mercadolibre-product"
              modal
              disabled={editing}
              ariaLabel="Producto local para la publicación"
              placeholder="Buscar por nombre o SKU..."
              onChange={onProductChange}
            />
            {selectedProduct ? (
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  SKU {selectedProduct.sku || "sin SKU"} · Stock local{" "}
                  {selectedProduct.stock}
                </p>
                <p>
                  Precio de la tienda en línea:{" "}
                  <span className="font-medium text-foreground">
                    {currencyFormatter.format(selectedProduct.price)}
                  </span>{" "}
                  · Solo referencia, no se modificará.
                </p>
              </div>
            ) : null}
            <div className="grid gap-2 pt-1">
              <Label htmlFor="mercadolibre-family-name">
                Nombre de familia en Mercado Libre
              </Label>
              <Input
                id="mercadolibre-family-name"
                value={form.familyName}
                onChange={(event) =>
                  onFormChange("familyName", event.target.value)
                }
                placeholder="Ej. Termo Owala"
                maxLength={120}
              />
              <p className="text-xs text-muted-foreground">
                Es el nombre común de todas las variaciones. Usa el producto
                base sin color, talla o diseño; Mercado Libre completa el título
                final de la publicación.
              </p>
            </div>
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
            <Label htmlFor="mercadolibre-price">
              Precio de venta en Mercado Libre
            </Label>
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
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                Es el precio que verá la clienta en Mercado Libre. Nunca cambia
                el precio de la tienda en línea.
              </p>
              {selectedProduct && priceDifference !== null ? (
                <p>
                  Tienda en línea:{" "}
                  {currencyFormatter.format(selectedProduct.price)}
                  {" · "}Diferencia en Mercado Libre:{" "}
                  <span
                    className={
                      priceDifference > 0
                        ? "font-medium text-success"
                        : priceDifference < 0
                          ? "font-medium text-warning"
                          : "font-medium text-foreground"
                    }
                  >
                    {formatSignedCurrency(priceDifference)}
                  </span>
                </p>
              ) : null}
            </div>
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
                  Se restan del stock publicado para evitar sobreventas. Con la
                  seguridad actual, se publicarán {unitsToPublish} de{" "}
                  {selectedProduct?.stock ?? 0} unidades locales.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mercadolibre-minimum-margin">
                  Ganancia objetivo después de costo y comisión (opcional)
                </Label>
                <CurrencyInput
                  id="mercadolibre-minimum-margin"
                  inputMode="numeric"
                  aria-describedby="mercadolibre-minimum-margin-description"
                  value={toCurrencyInputValue(form.minimumMarginAmount)}
                  onChange={(value) =>
                    onFormChange(
                      "minimumMarginAmount",
                      value === undefined ? "" : String(value),
                    )
                  }
                  placeholder="Ej. 12000"
                />
                <p
                  id="mercadolibre-minimum-margin-description"
                  className="text-xs text-muted-foreground"
                >
                  Esta meta no cambia precios sola. En la revisión final puedes
                  calcular un precio de Mercado Libre que la busque cumplir;
                  nunca baja el precio escrito ni cambia la tienda en línea. No
                  contempla envío, impuestos ni descuentos posteriores.
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
                    Permitir actualizar este precio de Mercado Libre desde
                    Administración
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Solo sincroniza el precio de esta publicación; el precio de
                    la tienda en línea nunca cambia.
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
              autoCapitalize="characters"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              Usa una sugerencia y continúa: Administración comprueba que sea
              una categoría final de Mercado Libre antes de cargar la ficha
              técnica y de publicar.
            </p>
            {verifiedCategoryId === form.categoryId.trim().toUpperCase() ? (
              <p className="flex items-center gap-1.5 text-xs font-medium text-success">
                <Check className="h-3.5 w-3.5" />
                Categoría y ficha técnica verificadas con Mercado Libre.
              </p>
            ) : null}
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
                  Selecciona al menos una para publicar. Tres o más ayudan a la
                  clienta a conocer mejor el producto. La primera será la
                  portada.
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
                            ...current.imageUrls.filter((url) => url !== value),
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
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="flex-1 text-destructive">
                  Este producto no tiene imágenes. Agrega al menos una antes de
                  publicar.
                </p>
                {selectedProduct ? (
                  <Button asChild type="button" size="sm" variant="outline">
                    <a
                      href={`/${storeId}/productos/${selectedProduct.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Agregar fotos
                    </a>
                  </Button>
                ) : null}
              </div>
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
          <div
            className="rounded-md border border-dashed bg-background/60 p-3 text-sm"
            aria-live="polite"
          >
            {isLoadingCategoryAttributes ? (
              <p className="text-muted-foreground">
                Consultando los campos obligatorios de Mercado Libre…
              </p>
            ) : requiredAttributes.length > 0 ? (
              <p>
                Mercado Libre pidió {requiredAttributes.length} campo
                {requiredAttributes.length === 1 ? "" : "s"} obligatorio
                {requiredAttributes.length === 1 ? "" : "s"} para esta
                categoría.
              </p>
            ) : (
              <p className="text-muted-foreground">
                Esta categoría no tiene campos obligatorios adicionales. Puedes
                continuar después de revisar la información opcional.
              </p>
            )}
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
                Nombre de familia en Mercado Libre
              </span>
              <span className="font-medium">{form.familyName}</span>
            </p>
            <p>
              <span className="block text-xs text-muted-foreground">
                Precio de la tienda en línea
              </span>
              <span className="font-medium">
                {currencyFormatter.format(selectedProduct?.price ?? 0)}
              </span>
              <span className="block text-xs text-muted-foreground">
                Solo referencia; no se modifica.
              </span>
            </p>
            <p>
              <span className="block text-xs text-muted-foreground">
                Precio de venta en Mercado Libre
              </span>
              <span className="font-medium">
                {currencyFormatter.format(Number(form.marketplacePrice) || 0)}
              </span>
              {priceDifference !== null ? (
                <span className="block text-xs text-muted-foreground">
                  Diferencia frente a tienda:{" "}
                  {formatSignedCurrency(priceDifference)}
                </span>
              ) : null}
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
              {!hasPublishableStock ? (
                <span className="block text-xs text-destructive">
                  Ajusta el stock de seguridad o repón unidades antes de
                  publicar.
                </span>
              ) : null}
            </p>
            <p>
              <span className="block text-xs text-muted-foreground">Fotos</span>
              <span className="font-medium">
                {form.imageUrls.length} seleccionada
                {form.imageUrls.length === 1 ? "" : "s"}
              </span>
              <span className="block text-xs text-muted-foreground">
                {form.imageUrls.length === 0
                  ? "Falta al menos una foto para publicar."
                  : form.imageUrls.length < 3
                    ? "Puedes publicar; agregar más fotos mejora la confianza."
                    : "Cantidad recomendada para mostrar el producto."}
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
          <section className="space-y-4 rounded-md border p-4 text-sm">
            <div className="flex items-start gap-3">
              <Truck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <h3 className="font-semibold">Condiciones de venta</h3>
                <p className="text-xs text-muted-foreground">
                  Define quién asume el envío y qué tipo de publicación usarás.
                  Administración calcula el impacto antes de publicar.
                </p>
              </div>
            </div>

            {isLoadingSaleConditions ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Consultando en Mercado Libre las cuotas y el envío actuales…
              </div>
            ) : activePublication && !activeSaleConditions ? (
              <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-xs">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p>
                  No se cargaron las condiciones actuales. Cierra y vuelve a
                  abrir la publicación antes de cambiar cuotas o envío.
                </p>
              </div>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label>Cuotas sin interés ofrecidas</Label>
                  <RadioGroup
                    value={form.listingType}
                    onValueChange={onListingTypeChange}
                    className="grid gap-2 sm:grid-cols-2"
                  >
                    {priceOptions.map((option) => {
                      const optionId =
                        option.listingTypeId ?? option.listingTypeName;
                      if (!optionId) return null;
                      const financingCost = option.financingAddOnFee ?? 0;
                      const feeDifference =
                        lowestSaleFee === null
                          ? 0
                          : option.saleFeeAmount - lowestSaleFee;
                      return (
                        <Label
                          key={optionId}
                          htmlFor={`mercadolibre-listing-type-${optionId}`}
                          className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/[0.03]"
                        >
                          <RadioGroupItem
                            id={`mercadolibre-listing-type-${optionId}`}
                            value={optionId}
                            className="mt-0.5"
                          />
                          <span className="min-w-0 space-y-1">
                            <span className="block font-medium">
                              {option.installmentLabel ??
                                option.listingTypeName ??
                                optionId}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              Cargo total por vender: {" "}
                              {currencyFormatter.format(option.saleFeeAmount)}
                            </span>
                            {financingCost > 0 ? (
                              <span className="block text-xs text-muted-foreground">
                                Incluye {currencyFormatter.format(financingCost)}
                                {" "}por ofrecer más cuotas.
                              </span>
                            ) : null}
                            {feeDifference > 0 ? (
                              <span className="block text-xs font-medium text-warning">
                                P de Papel recibe {" "}
                                {currencyFormatter.format(feeDifference)} menos
                                que con la opción de menor cargo.
                              </span>
                            ) : (
                              <span className="block text-xs text-success">
                                Menor cargo disponible para esta publicación.
                              </span>
                            )}
                          </span>
                        </Label>
                      );
                    })}
                  </RadioGroup>
                  <p className="text-xs text-muted-foreground">
                    Solo aparecen planes que Mercado Libre permite actualmente
                    para esta categoría y cuenta. Más cuotas pueden facilitar
                    la compra, pero elevan el cargo descontado a P de Papel.
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label>¿Quién asume el costo del envío?</Label>
                  <RadioGroup
                    value={form.freeShipping ? "seller" : "buyer"}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        freeShipping: value === "seller",
                      }))
                    }
                    className="grid gap-2 sm:grid-cols-2"
                  >
                    <Label
                      htmlFor="mercadolibre-shipping-buyer"
                      className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/[0.03]"
                    >
                      <RadioGroupItem
                        id="mercadolibre-shipping-buyer"
                        value="buyer"
                        className="mt-0.5"
                        disabled={
                          shippingComparison?.mandatoryFreeShipping === true ||
                          activeSaleConditions?.current
                            .mandatoryFreeShipping === true
                        }
                      />
                      <span>
                        <span className="block font-medium">
                          La compradora paga el envío
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {shippingComparison?.buyerPays
                            ? `Costo estimado para P de Papel: ${currencyFormatter.format(shippingComparison.buyerPays.sellerCost)}.`
                            : shippingComparison?.mandatoryFreeShipping ||
                                activeSaleConditions?.current
                                  .mandatoryFreeShipping
                              ? "No disponible: Mercado Libre exige envío gratis."
                              : "Normalmente protege mejor la utilidad de P de Papel."}
                        </span>
                      </span>
                    </Label>
                    <Label
                      htmlFor="mercadolibre-shipping-seller"
                      className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/[0.03]"
                    >
                      <RadioGroupItem
                        id="mercadolibre-shipping-seller"
                        value="seller"
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block font-medium">
                          P de Papel ofrece envío gratis
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {shippingComparison
                            ? `P de Papel paga aproximadamente ${currencyFormatter.format(shippingComparison.sellerOffersFree.sellerCost)} por venta.`
                            : "Puede mejorar conversión, pero el costo se descuenta de la utilidad."}
                        </span>
                        {shippingComparison?.sellerOffersFree.promotedAmount !==
                          null &&
                        shippingComparison?.sellerOffersFree.promotedAmount !==
                          undefined &&
                        shippingComparison.sellerOffersFree.promotedAmount >
                          shippingComparison.sellerOffersFree.sellerCost ? (
                          <span className="block text-xs text-success">
                            Mercado Libre reduce el costo desde {" "}
                            <span className="line-through">
                              {currencyFormatter.format(
                                shippingComparison.sellerOffersFree
                                  .promotedAmount,
                              )}
                            </span>{" "}
                            por la reputación actual.
                          </span>
                        ) : null}
                      </span>
                    </Label>
                  </RadioGroup>
                </div>

                <div className="space-y-3 rounded-md bg-muted/30 p-3">
                  {!activePublication ? (
                    <>
                      <div>
                        <p className="font-medium">Paquete para cotizar</p>
                        <p className="text-xs text-muted-foreground">
                          Usa las medidas del producto ya empacado. Mercado Libre
                          entrega una aproximación para una unidad.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="grid gap-1.5">
                          <Label htmlFor="mercadolibre-package-height">
                            Alto
                          </Label>
                          <MeasurementInput
                            id="mercadolibre-package-height"
                            unit="cm"
                            value={toMeasurementValue(form.packageHeightCm)}
                            onChange={(value) =>
                              onFormChange(
                                "packageHeightCm",
                                value === undefined ? "" : String(value),
                              )
                            }
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label htmlFor="mercadolibre-package-width">
                            Ancho
                          </Label>
                          <MeasurementInput
                            id="mercadolibre-package-width"
                            unit="cm"
                            value={toMeasurementValue(form.packageWidthCm)}
                            onChange={(value) =>
                              onFormChange(
                                "packageWidthCm",
                                value === undefined ? "" : String(value),
                              )
                            }
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label htmlFor="mercadolibre-package-length">
                            Largo
                          </Label>
                          <MeasurementInput
                            id="mercadolibre-package-length"
                            unit="cm"
                            value={toMeasurementValue(form.packageLengthCm)}
                            onChange={(value) =>
                              onFormChange(
                                "packageLengthCm",
                                value === undefined ? "" : String(value),
                              )
                            }
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label htmlFor="mercadolibre-package-weight">
                            Peso
                          </Label>
                          <MeasurementInput
                            id="mercadolibre-package-weight"
                            unit="g"
                            step="1"
                            value={toMeasurementValue(
                              form.packageWeightGrams,
                            )}
                            onChange={(value) =>
                              onFormChange(
                                "packageWeightGrams",
                                value === undefined ? "" : String(value),
                              )
                            }
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Info className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>
                        La cotización usa directamente el producto publicado y
                        la logística que Mercado Libre tiene activa.
                      </p>
                    </div>
                  )}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {!activePublication ? (
                      <Label
                        htmlFor="mercadolibre-local-pickup"
                        className="flex cursor-pointer items-start gap-2 font-normal"
                      >
                        <Checkbox
                          id="mercadolibre-local-pickup"
                          checked={form.localPickUp}
                          onCheckedChange={(checked) =>
                            setForm((current) => ({
                              ...current,
                              localPickUp: checked === true,
                            }))
                          }
                        />
                        <span>
                          <span className="block font-medium">
                            Permitir retiro acordado
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Solo actívalo si realmente puedes entregar en
                            persona.
                          </span>
                        </span>
                      </Label>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Retiro acordado: {form.localPickUp ? "activo" : "inactivo"}
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void onLoadShippingComparison()}
                      disabled={isLoadingShippingComparison}
                    >
                      {isLoadingShippingComparison ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Truck className="mr-2 h-4 w-4" />
                      )}
                      {shippingComparison
                        ? "Actualizar costo de envío"
                        : "Comparar costos de envío"}
                    </Button>
                  </div>
                </div>

                {shippingComparison ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">
                        Si paga la compradora
                      </p>
                      <p className="font-semibold">
                        {shippingComparison.buyerPays
                          ? `Costo estimado para P de Papel: ${currencyFormatter.format(shippingComparison.buyerPays.sellerCost)}`
                          : "No disponible para esta publicación"}
                      </p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">
                        Si P de Papel ofrece envío gratis
                      </p>
                      <p className="font-semibold">
                        Costo estimado para P de Papel:{" "}
                        {currencyFormatter.format(
                          shippingComparison.sellerOffersFree.sellerCost,
                        )}
                      </p>
                    </div>
                  </div>
                ) : null}
                {activePublication ? (
                  <div className="flex flex-col gap-2 rounded-md border border-primary/20 bg-primary/[0.03] p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">
                        Aplicar cuotas y envío en Mercado Libre
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Antes de confirmar verás el cargo actual, el nuevo cargo,
                        el costo de envío y el neto estimado. El precio de la
                        tienda en línea no cambia.
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => void onApplyActiveSaleConditions()}
                      disabled={
                        isApplyingSaleConditions ||
                        !activeConditionsChanged ||
                        !shippingComparison
                      }
                    >
                      {isApplyingSaleConditions ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      {activeConditionsChanged
                        ? "Aplicar condiciones"
                        : "Sin cambios pendientes"}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
            <div>
              <p className="font-medium">Costos oficiales estimados</p>
              <p className="text-xs text-muted-foreground">
                Consulta nuevamente si cambias precio, categoría o tipo de
                publicación.
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
              Actualizar comisiones
            </Button>
          </div>
          {hasTargetProfit ? (
            <div className="flex flex-col gap-3 rounded-md border border-primary/20 bg-primary/[0.03] p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">
                  Ganancia objetivo: {currencyFormatter.format(targetProfit)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Calcula y actualiza solo el precio de Mercado Libre con el
                  valor necesario para buscar esta ganancia después del costo,
                  la comisión y el envío seleccionado.
                </p>
                {!canSuggestPriceFromTarget ? (
                  <p className="mt-1 text-xs text-warning">
                    {!form.categoryId.trim()
                      ? "Elige primero una categoría de Mercado Libre."
                      : form.freeShipping && !shippingComparison
                        ? "Compara primero el envío para incluirlo en el cálculo."
                        : "Registra el costo de adquisición del producto para poder calcular la ganancia."}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void onSuggestPriceFromTarget()}
                disabled={!canSuggestPriceFromTarget || isSuggestingPrice}
              >
                {isSuggestingPrice ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CircleDollarSign className="mr-2 h-4 w-4" />
                )}
                Sugerir precio de Mercado Libre
              </Button>
            </div>
          ) : null}
          {priceEstimate ? (
            <div className="grid gap-2 rounded-md border border-primary/20 bg-primary/[0.03] p-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <p>
                <span className="block text-xs text-muted-foreground">
                  Cargo base por vender
                </span>
                <span className="font-semibold">
                  {currencyFormatter.format(baseMarketplaceFee ?? 0)}
                </span>
              </p>
              <p>
                <span className="block text-xs text-muted-foreground">
                  Costo adicional por financiación
                </span>
                <span className="font-semibold">
                  {currencyFormatter.format(financingCost)}
                </span>
              </p>
              <p>
                <span className="block text-xs text-muted-foreground">
                  Comisión total de Mercado Libre
                </span>
                <span className="font-semibold">
                  {currencyFormatter.format(priceEstimate.saleFeeAmount)}
                </span>
              </p>
              <p>
                <span className="block text-xs text-muted-foreground">
                  Envío asumido por P de Papel
                </span>
                <span className="font-semibold">
                  {estimatedSellerShippingCost === null
                    ? "Falta estimar"
                    : currencyFormatter.format(estimatedSellerShippingCost)}
                </span>
              </p>
              <p>
                <span className="block text-xs text-muted-foreground">
                  Neto estimado a liquidar
                </span>
                <span className="font-semibold">
                  {estimatedSellerShippingCost === null
                    ? "Falta estimar"
                    : currencyFormatter.format(
                        Number(form.marketplacePrice) -
                          priceEstimate.saleFeeAmount -
                          estimatedSellerShippingCost,
                      )}
                </span>
              </p>
              <p>
                <span className="block text-xs text-muted-foreground">
                  Ganancia operativa estimada
                </span>
                <span className="font-semibold">
                  {estimatedProfit === null
                    ? "Falta costo o envío"
                    : currencyFormatter.format(estimatedProfit)}
                </span>
                {profitDifference !== null ? (
                  <span
                    className={
                      profitDifference >= 0
                        ? "block text-xs text-success"
                        : "block text-xs text-warning"
                    }
                  >
                    {profitDifference >= 0
                      ? `Cumple la meta por ${formatSignedCurrency(profitDifference)}.`
                      : `Faltan ${currencyFormatter.format(Math.abs(profitDifference))} para la meta.`}
                  </span>
                ) : null}
              </p>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Son estimaciones oficiales previas a la venta. Impuestos,
            descuentos, cambios logísticos o reclamos pueden modificar el valor
            final; la liquidación de Mercado Libre sigue siendo la fuente
            definitiva. Al publicar, Administración enviará producto, fotos,
            precio, stock, ficha técnica y condiciones de envío.
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
              disabled={isSaving || isApplyingSaleConditions}
            >
              {isSaving
                ? "Guardando…"
                : editing
                  ? "Guardar cambios generales"
                  : "Guardar borrador"}
            </Button>
            {canPublishDirectly ? (
              <Button
                type="button"
                onClick={() => void onSaveAndPublish()}
                disabled={isSaving || !hasPublishableStock}
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
