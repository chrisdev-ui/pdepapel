"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AsyncProductSelect,
  type AsyncProductOption,
} from "@/components/ui/async-product-select";
import { SectionCard } from "@/components/ui/section-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { MERCADOLIBRE_CATEGORY_REVIEW_REQUIRED } from "@/lib/mercadolibre/categories";
import { getListingStatusMeta } from "@/lib/mercadolibre/listing-status";
import { recommendMercadoLibreListingPrice } from "@/lib/mercadolibre/listing-price-recommendation";
import { Download, Pencil, Plus, Video } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ListingPublicationWizard,
  type ListingPublicationIssue,
} from "./listing-publication-wizard";
import {
  LISTING_WIZARD_STEPS,
  getInitialListingWizardStep,
  getListingWizardStepLabel,
  prefillListingAttributes,
  type ListingWizardStep,
} from "@/lib/mercadolibre/listing-wizard";
import type { MercadoLibreCategorySearchResponse } from "@/lib/mercadolibre/categories";
import { ProductVideoLibrary } from "./product-video-library";
import { ListingDetailsSheet } from "./listings/listing-details-sheet";
import type { ListingRowHandlers } from "./listings/listing-row-actions";
import { ListingTable } from "./listings/listing-table";
import {
  bulkActionLabels,
  currencyFormatter,
  MAX_BULK_LISTINGS,
  type BulkAction,
  type BulkOutcome,
  type ContentReview,
  type Listing,
  type ListingQuality,
  type MarketplaceAttribute,
  type ProductReference,
} from "./listings/listing-types";

type SelectedProduct = ProductReference;

/**
 * El producto de una publicación guardada llega con `color`/`size` anidados;
 * el asistente lee `colorName`/`sizeName` (lo que `toSelectedProduct` mapea
 * para un producto recién elegido). Sin este paso la ficha no rellenaba color
 * ni tamaño al editar.
 */
function toSelectedProductFromListing(product: ProductReference): SelectedProduct {
  return {
    ...product,
    sku: product.sku ?? "",
    colorName: product.colorName ?? product.color?.name ?? null,
    sizeName: product.sizeName ?? product.size?.name ?? null,
  };
}

/**
 * La ficha se edita como texto `CODIGO=Valor`; al guardar, un valor de lista
 * cerrada recupera el `value_id` que tenía la publicación para no reenviarse
 * como texto libre.
 */
function withKnownValueIds(
  attributes: { id: string; value_name: string }[],
  known: MarketplaceAttribute[] | undefined,
) {
  const knownById = new Map(
    (known ?? []).map((attribute) => [attribute.id.toUpperCase(), attribute]),
  );
  return attributes.map((attribute) => {
    const previous = knownById.get(attribute.id.toUpperCase());
    return previous?.value_id &&
      (previous.value_name ?? "").trim() === attribute.value_name
      ? { ...attribute, value_id: previous.value_id }
      : attribute;
  });
}

function toSelectedProduct(
  product: AsyncProductOption | null | undefined,
): SelectedProduct | null {
  if (!product) return null;

  return {
    id: product.id,
    name: product.name,
    sku: product.sku ?? "",
    stock: product.stock,
    acqPrice: product.acqPrice ?? null,
    transportationCost: product.transportationCost ?? null,
    brand: product.brand ?? null,
    gtin: product.gtin ?? null,
    mpn: product.mpn ?? null,
    hasNoProductIdentifier: product.hasNoProductIdentifier ?? false,
    colorName: product.color?.name ?? null,
    sizeName: product.size?.name ?? null,
    images: product.images ?? [],
    price: Number(product.price ?? 0),
    category: product.category?.id
      ? { id: product.category.id, name: product.category.name }
      : null,
  };
}

type PublishableListing = Pick<Listing, "id" | "marketplacePrice"> & {
  product: Pick<ProductReference, "name">;
};

type CategorySuggestion = {
  categoryId: string;
  categoryName: string;
  domainId: string | null;
  domainName: string | null;
  path: string[];
};

type ListingForm = {
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
  /** Motivo para publicar por debajo del costo de adquisición (vacío si no aplica). */
  belowCostReason: string;
};

type CategoryAttribute = {
  id: string;
  name: string;
  required: boolean;
  valueType: string;
  values: { id: string; name: string }[];
};

type CategoryTemplate = {
  id: string;
  categoryId: string;
  name: string;
  attributes: MarketplaceAttribute[];
  stockSafetyBuffer: number | null;
  minimumMarginAmount: number | null;
};

type PublicationProfile = {
  id: string;
  localCategoryId: string;
  categoryId: string;
  name: string;
  attributes: MarketplaceAttribute[];
  stockSafetyBuffer: number;
  minimumMarginAmount: number | null;
  localCategory: { id: string; name: string };
};

type PriceEstimate = {
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

type ShippingCostEstimate = {
  sellerCost: number;
  currencyId: string | null;
  billableWeightGrams: number | null;
  discountRate: number | null;
  promotedAmount: number | null;
};

type ShippingCostComparison = {
  buyerPays: ShippingCostEstimate | null;
  sellerOffersFree: ShippingCostEstimate;
  currentFreeShipping: boolean | null;
  mandatoryFreeShipping: boolean;
  logisticType: string | null;
};

type ActiveSaleConditions = {
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
  options: PriceEstimate[];
};

type ImportCandidate = {
  key: string;
  externalItemId: string;
  externalVariationId: string | null;
  title: string;
  status: Listing["status"];
  statusNote: string | null;
  marketplacePrice: number | null;
  currencyId: string | null;
  catalogListing: boolean;
  sellerSku: string | null;
  availableQuantity: number | null;
  existingListingId: string | null;
  linkedProduct: ProductReference | null;
  suggestedProduct: ProductReference | null;
  /** Borrador local del producto sugerido; vincular lo reemplaza. */
  draftListingId: string | null;
  issue: string | null;
  warnings: string[];
};

type ImportPreview = {
  listings: ImportCandidate[];
  summary: {
    total: number;
    alreadyLinked: number;
    readyToImport: number;
    needsReview: number;
    unavailable: number;
  };
  partial: boolean;
};

type ImportSelection = {
  productId: string;
  selected: boolean;
  /** La persona aceptó reemplazar el borrador local del producto elegido. */
  replaceDraft: boolean;
};

type ImportResult = {
  importedCount: number;
  imported: { listingId: string; title: string; replacedDraft: boolean }[];
};

const emptyForm: ListingForm = {
  productId: "",
  familyName: "",
  marketplacePrice: "",
  categoryId: "",
  listingType: "gold_special",
  stockSafetyBuffer: "0",
  minimumMarginAmount: "",
  syncPrice: true,
  imageUrls: [],
  attributes: "",
  freeShipping: false,
  localPickUp: false,
  packageHeightCm: "",
  packageWidthCm: "",
  packageLengthCm: "",
  packageWeightGrams: "",
  belowCostReason: "",
};


function formatCurrencyDifference(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${currencyFormatter.format(Math.abs(value))}`;
}

function getSellerShippingCost(
  comparison: ShippingCostComparison | null,
  freeShipping: boolean,
) {
  if (!comparison) return null;
  if (freeShipping) return comparison.sellerOffersFree.sellerCost;
  return comparison.buyerPays?.sellerCost ?? 0;
}

function attributesToText(attributes: MarketplaceAttribute[] | undefined) {
  return (attributes ?? [])
    .map(
      (attribute) =>
        `${attribute.id}=${attribute.value_name ?? attribute.value_id ?? ""}`,
    )
    .join("\n");
}

function parseAttributes(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0 || !line.slice(separatorIndex + 1).trim()) {
        throw new Error(
          "Cada atributo debe escribirse como CODIGO=Valor, por ejemplo BRAND=Panda",
        );
      }
      return {
        id: line.slice(0, separatorIndex).trim().toUpperCase(),
        value_name: line.slice(separatorIndex + 1).trim(),
      };
    });
}

type ResponseError = {
  message: string;
  code: string | null;
  /** Texto literal de Mercado Libre cuando el fallo vino de allá. */
  upstreamMessage: string | null;
};

function getResponseError(response: Response): Promise<ResponseError> {
  return response
    .json()
    .then(
      (body: {
        error?: string;
        details?: { code?: string; upstreamMessage?: string };
      }) => ({
        message: body.error ?? "No fue posible completar la acción",
        code: typeof body.details?.code === "string" ? body.details.code : null,
        upstreamMessage:
          typeof body.details?.upstreamMessage === "string"
            ? body.details.upstreamMessage
            : null,
      }),
    )
    .catch(() => ({
      message: "No fue posible completar la acción",
      code: null,
      upstreamMessage: null,
    }));
}

function getErrorMessage(response: Response) {
  return getResponseError(response).then((error) =>
    error.upstreamMessage && !error.message.includes(error.upstreamMessage)
      ? `${error.message} Mercado Libre dijo: ${error.upstreamMessage}`
      : error.message,
  );
}

export function MercadoLibreListingManager({
  storeId,
  canPublish,
  highlightedListingId = null,
}: {
  storeId: string;
  canPublish: boolean;
  /** Listing id from the daily email link; scrolled into view and outlined. */
  highlightedListingId?: string | null;
}) {
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  /** Borrador creado por el propio asistente al avanzar del paso 1. */
  const [draftId, setDraftId] = useState<string | null>(null);
  /** Copia del formulario tal como quedó guardado: decide si cerrar pide confirmación. */
  const [persistedForm, setPersistedForm] = useState<string>("");
  /** Precio|categoría con los que se calcularon las comisiones cargadas. */
  const [priceEstimateKey, setPriceEstimateKey] = useState<string | null>(null);
  const [initialWizardStep, setInitialWizardStep] = useState<ListingWizardStep>(1);
  /** Paso visible del asistente; da el título del diálogo. */
  const [wizardStep, setWizardStep] = useState<ListingWizardStep>(1);
  /** Aviso de resultados parciales al sugerir categorías (no bloquea). */
  const [suggestionsNotice, setSuggestionsNotice] = useState<string | null>(
    null,
  );
  const [initialWizardIssue, setInitialWizardIssue] =
    useState<ListingPublicationIssue | null>(null);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [form, setForm] = useState<ListingForm>(emptyForm);

  useEffect(() => {
    if (
      !highlightedListingId ||
      isLoading ||
      !listings.some((listing) => listing.id === highlightedListingId)
    ) {
      return;
    }
    document
      .getElementById(`mercadolibre-listing-${highlightedListingId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedListingId, isLoading, listings]);
  const [suggestions, setSuggestions] = useState<CategorySuggestion[]>([]);
  const [isSearchingCategories, setIsSearchingCategories] = useState(false);
  const [categoryAttributes, setCategoryAttributes] = useState<
    CategoryAttribute[]
  >([]);
  const [verifiedCategoryId, setVerifiedCategoryId] = useState<string | null>(
    null,
  );
  const [isLoadingCategoryAttributes, setIsLoadingCategoryAttributes] =
    useState(false);
  const [priceEstimate, setPriceEstimate] = useState<PriceEstimate | null>(
    null,
  );
  const [priceOptions, setPriceOptions] = useState<PriceEstimate[]>([]);
  const [isLoadingPriceEstimate, setIsLoadingPriceEstimate] = useState(false);
  const [shippingComparison, setShippingComparison] =
    useState<ShippingCostComparison | null>(null);
  const [activeSaleConditions, setActiveSaleConditions] =
    useState<ActiveSaleConditions | null>(null);
  const [activeCurrentShippingComparison, setActiveCurrentShippingComparison] =
    useState<ShippingCostComparison | null>(null);
  const [isLoadingSaleConditions, setIsLoadingSaleConditions] = useState(false);
  const [isApplyingSaleConditions, setIsApplyingSaleConditions] =
    useState(false);
  const saleConditionsRequestId = useRef(0);
  const [isLoadingShippingComparison, setIsLoadingShippingComparison] =
    useState(false);
  const [qualityByListingId, setQualityByListingId] = useState<
    Record<string, ListingQuality>
  >({});
  const [loadingQualityId, setLoadingQualityId] = useState<string | null>(null);
  const [videoLibraryTarget, setVideoLibraryTarget] = useState<{
    listing: Listing;
    uploadUrl: string | null;
  } | null>(null);
  const [updatingVideoReminderId, setUpdatingVideoReminderId] = useState<
    string | null
  >(null);
  const [contentReviewByListingId, setContentReviewByListingId] = useState<
    Record<string, ContentReview>
  >({});
  const [reviewingContentId, setReviewingContentId] = useState<string | null>(
    null,
  );
  const [syncingContentId, setSyncingContentId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedProduct, setSelectedProduct] =
    useState<SelectedProduct | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(
    null,
  );
  const [importSelections, setImportSelections] = useState<
    Record<string, ImportSelection>
  >({});
  const [isLoadingImportPreview, setIsLoadingImportPreview] = useState(false);
  const [isImportingListings, setIsImportingListings] = useState(false);
  /** Resultado de la última vinculación, para decirlo en pantalla. */
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  /** Último resultado masivo, fila por fila, hasta que la persona lo cierre. */
  const [bulkOutcome, setBulkOutcome] = useState<BulkOutcome | null>(null);
  /** Selección de la tabla, por id; sobrevive a cada recarga de la lista. */
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [isRunningBulkAction, setIsRunningBulkAction] = useState(false);
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);
  /** Mensaje de éxito de la última acción (se cierra solo al actuar de nuevo). */
  const [notice, setNotice] = useState<string | null>(null);
  /** Publicación cuyo panel de calidad y contenido está abierto. */
  const [detailsListingId, setDetailsListingId] = useState<string | null>(null);
  const hasLoadedListings = useRef(false);
  const [categoryTemplates, setCategoryTemplates] = useState<
    CategoryTemplate[]
  >([]);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [publicationProfiles, setPublicationProfiles] = useState<
    PublicationProfile[]
  >([]);
  const [quickProfile, setQuickProfile] = useState<PublicationProfile | null>(
    null,
  );
  const [isSavingQuickProfile, setIsSavingQuickProfile] = useState(false);
  const [isSuggestingPrice, setIsSuggestingPrice] = useState(false);

  const loadListings = useCallback(async () => {
    // Solo la primera carga muestra el esqueleto: una recarga tras una acción
    // deja la tabla, la selección y el panel abierto en su sitio.
    if (!hasLoadedListings.current) setIsLoading(true);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/listings`,
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const nextListings = (await response.json()) as Listing[];
      setListings(nextListings);
      const ids = new Set(nextListings.map((listing) => listing.id));
      setRowSelection((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([id, selected]) => selected && ids.has(id)),
        ),
      );
      setQualityByListingId((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(id))),
      );
      setContentReviewByListingId((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(id))),
      );
      hasLoadedListings.current = true;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible cargar las publicaciones",
      );
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  const parseFormAttributes = (text: string) =>
    withKnownValueIds(parseAttributes(text), editingListing?.metadata?.attributes);

  const loadCategoryTemplates = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/templates`,
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setCategoryTemplates((await response.json()) as CategoryTemplate[]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible cargar las plantillas de categorías",
      );
    }
  }, [storeId]);

  useEffect(() => {
    void loadCategoryTemplates();
  }, [loadCategoryTemplates]);

  const loadPublicationProfiles = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/profiles`,
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setPublicationProfiles((await response.json()) as PublicationProfile[]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible cargar los perfiles rápidos",
      );
    }
  }, [storeId]);

  useEffect(() => {
    void loadPublicationProfiles();
  }, [loadPublicationProfiles]);

  const updateForm = (key: keyof ListingForm, value: string) => {
    setError(null);
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "marketplacePrice") {
      setPriceEstimate(null);
      setPriceOptions([]);
      setPriceEstimateKey(null);
      setShippingComparison(null);
    }
    if (
      key === "packageHeightCm" ||
      key === "packageWidthCm" ||
      key === "packageLengthCm" ||
      key === "packageWeightGrams"
    ) {
      setShippingComparison(null);
    }
  };

  const updateCategory = (categoryId: string) => {
    const normalizedCategoryId = categoryId.trim().toUpperCase();
    setError(null);
    setForm((current) =>
      current.categoryId === normalizedCategoryId
        ? current
        : {
            ...current,
            categoryId: normalizedCategoryId,
            attributes: "",
          },
    );
    // La lista de sugerencias se queda: escribir o pegar un código no la
    // borra; solo cambiar de producto o volver a sugerir la reemplaza.
    setCategoryAttributes([]);
    setVerifiedCategoryId(null);
    setPriceEstimate(null);
    setPriceOptions([]);
    setShippingComparison(null);
    setQuickProfile(null);
  };

  const openNewListingRef = useRef<() => void>(() => undefined);
  const openNewListing = () => {
    saleConditionsRequestId.current += 1;
    setEditingListing(null);
    setForm(emptyForm);
    setSuggestions([]);
    setSuggestionsNotice(null);
    setCategoryAttributes([]);
    setVerifiedCategoryId(null);
    setPriceEstimate(null);
    setPriceOptions([]);
    setShippingComparison(null);
    setActiveSaleConditions(null);
    setActiveCurrentShippingComparison(null);
    setIsLoadingSaleConditions(false);
    setSelectedProduct(null);
    setQuickProfile(null);
    setError(null);
    setDraftId(null);
    setPriceEstimateKey(null);
    setPersistedForm(JSON.stringify(emptyForm));
    setInitialWizardStep(1);
    setInitialWizardIssue(null);
    setIsDialogOpen(true);
  };

  openNewListingRef.current = openNewListing;

  const openEditListing = (listing: Listing) => {
    const requestId = saleConditionsRequestId.current + 1;
    saleConditionsRequestId.current = requestId;
    setEditingListing(listing);
    const editForm: ListingForm = {
      productId: listing.product.id,
      familyName: listing.metadata?.familyName ?? listing.product.name,
      marketplacePrice: String(listing.marketplacePrice ?? ""),
      categoryId: listing.categoryId ?? "",
      listingType: listing.listingType ?? "gold_special",
      stockSafetyBuffer: String(listing.stockSafetyBuffer),
      minimumMarginAmount: String(listing.minimumMarginAmount ?? ""),
      syncPrice: listing.syncPrice,
      imageUrls: listing.metadata?.media?.imageUrls?.length
        ? listing.metadata.media.imageUrls
        : listing.product.images.map((image) => image.url),
      attributes: attributesToText(listing.metadata?.attributes),
      freeShipping: listing.metadata?.saleConditions?.freeShipping ?? false,
      localPickUp: listing.metadata?.saleConditions?.localPickUp ?? false,
      packageHeightCm: String(
        listing.metadata?.saleConditions?.packageDimensions?.heightCm ?? "",
      ),
      packageWidthCm: String(
        listing.metadata?.saleConditions?.packageDimensions?.widthCm ?? "",
      ),
      packageLengthCm: String(
        listing.metadata?.saleConditions?.packageDimensions?.lengthCm ?? "",
      ),
      packageWeightGrams: String(
        listing.metadata?.saleConditions?.packageDimensions?.weightGrams ?? "",
      ),
      belowCostReason: listing.metadata?.belowCostOverride?.reason ?? "",
    };
    setForm(editForm);
    setDraftId(null);
    setPriceEstimateKey(null);
    setPersistedForm(JSON.stringify(editForm));
    // Se abre en el paso que Mercado Libre rechazó (con el campo señalado) o
    // en el primer paso incompleto; nunca desde cero.
    const failure = listing.metadata?.publicationError ?? null;
    setInitialWizardStep(
      getInitialListingWizardStep({
        productId: editForm.productId,
        familyName: editForm.familyName,
        marketplacePrice: editForm.marketplacePrice,
        categoryId: editForm.categoryId,
        imageUrls: editForm.imageUrls,
        publicationErrorStep: failure?.kind === "review" ? failure.step : null,
      }),
    );
    setInitialWizardIssue(
      failure?.kind === "review" && failure.step
        ? {
            field:
              failure.step === "ficha" && failure.field
                ? `attribute:${failure.field}`
                : failure.field === "familyName" ||
                    failure.field === "marketplacePrice" ||
                    failure.field === "categoryId" ||
                    failure.field === "imageUrls"
                  ? failure.field
                  : null,
            message: failure.message,
          }
        : null,
    );
    setSelectedProduct(toSelectedProductFromListing(listing.product));
    setSuggestions([]);
    setSuggestionsNotice(null);
    setCategoryAttributes([]);
    setVerifiedCategoryId(null);
    setPriceEstimate(null);
    setPriceOptions([]);
    setShippingComparison(null);
    setActiveSaleConditions(null);
    setActiveCurrentShippingComparison(null);
    setIsLoadingSaleConditions(Boolean(listing.externalItemId));
    setQuickProfile(null);
    setError(null);
    setIsDialogOpen(true);
    if (listing.externalItemId) {
      void loadActiveSaleConditions(listing, requestId);
    }
  };

  const loadImportPreview = async () => {
    setIsLoadingImportPreview(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/listings/import/preview`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const preview = (await response.json()) as ImportPreview;
      setImportPreview(preview);
      const automaticallySelectedProductIds = new Set<string>();
      setImportSelections(
        Object.fromEntries(
          preview.listings.map((listing) => {
            const suggestedProductId = listing.suggestedProduct?.id ?? "";
            // Con borrador local no se propone sola: reemplazarlo se confirma
            // fila por fila.
            const canAutoSelect = Boolean(
              !listing.existingListingId &&
              suggestedProductId &&
              !listing.issue &&
              !listing.draftListingId &&
              listing.status !== "ERROR" &&
              !automaticallySelectedProductIds.has(suggestedProductId),
            );
            if (canAutoSelect) {
              automaticallySelectedProductIds.add(suggestedProductId);
            }

            return [
              listing.key,
              {
                productId: suggestedProductId,
                selected: canAutoSelect,
                replaceDraft: false,
              },
            ];
          }),
        ),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible revisar las publicaciones existentes",
      );
    } finally {
      setIsLoadingImportPreview(false);
    }
  };

  const updateImportSelection = (
    key: string,
    update: Partial<ImportSelection>,
  ) => {
    setImportSelections((current) => ({
      ...current,
      [key]: {
        productId: current[key]?.productId ?? "",
        selected: current[key]?.selected ?? false,
        replaceDraft: current[key]?.replaceDraft ?? false,
        ...update,
      },
    }));
  };

  /**
   * Borrador local del producto elegido para una fila: el que la revisión
   * detectó para el SKU sugerido, o el que ya está en la lista cuando la
   * persona eligió otro producto a mano.
   */
  const getDraftForImportRow = (listing: ImportCandidate, productId: string) => {
    if (!productId) return null;
    if (listing.suggestedProduct?.id === productId && listing.draftListingId) {
      return listing.draftListingId;
    }
    return (
      listings.find(
        (candidate) => !candidate.externalItemId && candidate.product.id === productId,
      )?.id ?? null
    );
  };

  const importExistingListings = async () => {
    if (!importPreview) return;
    const selections = importPreview.listings.flatMap((listing) => {
      const selection = importSelections[listing.key];
      if (
        listing.existingListingId ||
        listing.status === "ERROR" ||
        !selection?.selected ||
        !selection.productId
      ) {
        return [];
      }
      return [
        {
          externalItemId: listing.externalItemId,
          externalVariationId: listing.externalVariationId,
          productId: selection.productId,
          replaceDraft: selection.replaceDraft,
        },
      ];
    });
    if (selections.length === 0) {
      setError("Selecciona al menos una publicación con producto local");
      return;
    }
    if (
      new Set(selections.map((selection) => selection.productId)).size !==
      selections.length
    ) {
      setError(
        "Un mismo producto local fue elegido para varias publicaciones. Deja una sola publicación seleccionada y revisa las demás antes de continuar.",
      );
      return;
    }
    if (
      !(await requestConfirmation({
        title: "¿Vincular publicaciones?",
        description: `Se vincularán ${selections.length} publicación${selections.length === 1 ? "" : "es"} y se sincronizará su stock con P de Papel.`,
        confirmLabel: "Vincular y sincronizar",
      }))
    ) {
      return;
    }

    setIsImportingListings(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/listings/import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selections }),
        },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const result = (await response.json()) as ImportResult;
      setImportResult(result);
      setImportPreview(null);
      setImportSelections({});
      await loadListings();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible importar las publicaciones seleccionadas",
      );
    } finally {
      setIsImportingListings(false);
    }
  };

  const selectedImportCount = importPreview
    ? importPreview.listings.filter((listing) => {
        const selection = importSelections[listing.key];
        return (
          !listing.existingListingId &&
          listing.status !== "ERROR" &&
          selection?.selected &&
          Boolean(selection.productId) &&
          (!getDraftForImportRow(listing, selection.productId) ||
            selection.replaceDraft)
        );
      }).length
    : 0;

  const searchCategories = async ({ preserveError = false } = {}) => {
    const query = form.familyName.trim() || selectedProduct?.name || "";
    if (query.length < 3) {
      setError("Selecciona un producto para buscar una categoría");
      return;
    }

    setIsSearchingCategories(true);
    setSuggestionsNotice(null);
    if (!preserveError) setError(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/categories?query=${encodeURIComponent(query)}`,
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const result = (await response.json()) as MercadoLibreCategorySearchResponse;
      const verifiedSuggestions: CategorySuggestion[] = result.suggestions;
      setSuggestions(verifiedSuggestions);
      setSuggestionsNotice(
        result.unavailableCount > 0
          ? `Mercado Libre no respondió por ${result.unavailableCount} de las categorías sugeridas; puede haber más opciones. Vuelve a sugerir en unos minutos si ninguna de estas encaja.`
          : null,
      );
      if (verifiedSuggestions.length === 0 && !preserveError) {
        setError(
          "Mercado Libre no encontró una categoría final y publicable para este nombre. Ajusta el nombre de familia con el tipo de producto y vuelve a sugerir.",
        );
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible buscar categorías",
      );
    } finally {
      setIsSearchingCategories(false);
    }
  };

  const loadCategoryAttributes = async ({ force = false } = {}): Promise<boolean> => {
    if (!form.categoryId) {
      setError("Selecciona una categoría antes de cargar sus características");
      return false;
    }
    const normalizedCategoryId = form.categoryId.trim().toUpperCase();
    // Ya verificada y cargada: volver atrás y adelante no vuelve a pedirla.
    if (!force && verifiedCategoryId === normalizedCategoryId) return true;

    setIsLoadingCategoryAttributes(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/categories/${encodeURIComponent(form.categoryId)}/attributes`,
      );
      if (!response.ok) {
        const responseError = await getResponseError(response);
        if (responseError.code === MERCADOLIBRE_CATEGORY_REVIEW_REQUIRED) {
          setCategoryAttributes([]);
          setVerifiedCategoryId(null);
          setPriceEstimate(null);
          setPriceOptions([]);
          setShippingComparison(null);
          setQuickProfile(null);
          // La ficha técnica se conserva: al elegir la nueva categoría solo
          // se completan los campos que falten.
          setForm((current) => ({ ...current, categoryId: "" }));
          await searchCategories({ preserveError: true });
        }
        throw new Error(responseError.message);
      }
      const attributes = (await response.json()) as CategoryAttribute[];
      setCategoryAttributes(attributes);
      setVerifiedCategoryId(normalizedCategoryId);
      // Marca, GTIN, MPN, color y tamaño salen del producto; solo se llenan
      // los vacíos y nunca se adivina un valor de lista cerrada.
      if (selectedProduct) {
        const product = selectedProduct;
        setForm((current) => ({
          ...current,
          attributes: prefillListingAttributes(current.attributes, attributes, product),
        }));
      }
      return true;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible cargar las características de la categoría",
      );
      return false;
    } finally {
      setIsLoadingCategoryAttributes(false);
    }
  };

  const loadPriceEstimate = async (): Promise<boolean> => {
    if (!form.marketplacePrice || !form.categoryId) {
      setError("Define precio y categoría para calcular los costos");
      return false;
    }
    const key = `${form.marketplacePrice}|${form.categoryId.trim().toUpperCase()}`;
    // Mismo precio y categoría: las comisiones ya cargadas siguen valiendo y
    // la comparación de envío no se pierde.
    if (priceEstimateKey === key && priceOptions.length > 0) return true;

    setIsLoadingPriceEstimate(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        price: form.marketplacePrice,
        categoryId: form.categoryId,
      });
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/listings/pricing?${query.toString()}`,
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const result = (await response.json()) as { options: PriceEstimate[] };
      const options = activeSaleConditions
        ? result.options.filter((option) =>
            option.listingTypeId
              ? activeSaleConditions.availableListingTypes.includes(
                  option.listingTypeId,
                )
              : false,
          )
        : result.options;
      if (!options.length) {
        throw new Error(
          "Mercado Libre no devolvió tipos de publicación disponibles",
        );
      }
      setPriceOptions(options);
      const currentEstimate = options.find(
        (option) => option.listingTypeId === form.listingType,
      );
      const selectedEstimate =
        currentEstimate ??
        (editingListing?.externalItemId ? null : options[0]);
      setPriceEstimate(selectedEstimate);
      if (
        !editingListing?.externalItemId &&
        selectedEstimate?.listingTypeId &&
        selectedEstimate.listingTypeId !== form.listingType
      ) {
        setForm((current) => ({
          ...current,
          listingType: selectedEstimate.listingTypeId!,
        }));
      }
      setShippingComparison(null);
      setPriceEstimateKey(key);
      return true;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible calcular los costos de Mercado Libre",
      );
      return false;
    } finally {
      setIsLoadingPriceEstimate(false);
    }
  };

  const getPriceEstimate = async (
    price: number,
    categoryId: string,
    listingType = form.listingType,
  ): Promise<PriceEstimate> => {
    const query = new URLSearchParams({
      price: String(price),
      categoryId,
      listingType,
    });
    const response = await fetch(
      `/api/${storeId}/marketplaces/mercadolibre/listings/pricing?${query.toString()}`,
    );
    if (!response.ok) throw new Error(await getErrorMessage(response));
    return (await response.json()) as PriceEstimate;
  };

  const updateListingType = (listingType: string) => {
    setError(null);
    setForm((current) => ({ ...current, listingType }));
    setPriceEstimate(
      priceOptions.find((option) => option.listingTypeId === listingType) ??
        null,
    );
    setShippingComparison(null);
  };

  const loadShippingComparison = async (override?: {
    listingId?: string;
    price?: string;
    listingType?: string;
  }) => {
    const activeListingId =
      override?.listingId ??
      (editingListing?.externalItemId ? editingListing.id : undefined);
    const price = override?.price ?? form.marketplacePrice;
    const listingType = override?.listingType ?? form.listingType;
    const packageFields = [
      form.packageHeightCm,
      form.packageWidthCm,
      form.packageLengthCm,
      form.packageWeightGrams,
    ];
    if (!price || !listingType) {
      setError("Define precio y tipo de publicación antes de estimar el envío");
      return null;
    }
    if (
      !activeListingId &&
      packageFields.some((value) => !value || Number(value) <= 0)
    ) {
      setError(
        "Completa alto, ancho, largo y peso del paquete para comparar el envío",
      );
      return null;
    }

    setIsLoadingShippingComparison(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        price,
        listingType,
      });
      if (activeListingId) {
        query.set("listingId", activeListingId);
      } else {
        query.set("heightCm", form.packageHeightCm);
        query.set("widthCm", form.packageWidthCm);
        query.set("lengthCm", form.packageLengthCm);
        query.set("weightGrams", form.packageWeightGrams);
      }
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/listings/shipping-cost?${query.toString()}`,
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const comparison = (await response.json()) as ShippingCostComparison;
      setShippingComparison(comparison);
      return comparison;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible comparar los costos de envío",
      );
      return null;
    } finally {
      setIsLoadingShippingComparison(false);
    }
  };

  const loadActiveSaleConditions = async (
    listing: Listing,
    requestId: number,
  ) => {
    setIsLoadingSaleConditions(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/listings/${listing.id}/sale-conditions`,
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const result = (await response.json()) as ActiveSaleConditions;
      if (saleConditionsRequestId.current !== requestId) return;

      const currentEstimate =
        result.options.find(
          (option) => option.listingTypeId === result.current.listingType,
        ) ?? null;
      setActiveSaleConditions(result);
      setPriceOptions(result.options);
      setPriceEstimate(currentEstimate);
      setForm((current) => ({
        ...current,
        marketplacePrice: String(result.current.price),
        categoryId: result.current.categoryId,
        listingType: result.current.listingType,
        freeShipping: result.current.freeShipping,
        localPickUp: result.current.localPickUp,
      }));

      const comparison = await loadShippingComparison({
        listingId: listing.id,
        price: String(result.current.price),
        listingType: result.current.listingType,
      });
      if (saleConditionsRequestId.current === requestId) {
        setActiveCurrentShippingComparison(comparison);
      }
    } catch (requestError) {
      if (saleConditionsRequestId.current !== requestId) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible consultar las condiciones actuales de Mercado Libre",
      );
    } finally {
      if (saleConditionsRequestId.current === requestId) {
        setIsLoadingSaleConditions(false);
      }
    }
  };

  const applyActiveSaleConditions = async () => {
    if (!editingListing?.externalItemId || !activeSaleConditions) {
      setError(
        "Espera a que Administración consulte las condiciones actuales de Mercado Libre",
      );
      return;
    }
    if (
      form.listingType === activeSaleConditions.current.listingType &&
      form.freeShipping === activeSaleConditions.current.freeShipping
    ) {
      setError("No hay cambios de cuotas o envío para aplicar");
      return;
    }

    const currentEstimate = priceOptions.find(
      (option) =>
        option.listingTypeId === activeSaleConditions.current.listingType,
    );
    const selectedEstimate = priceOptions.find(
      (option) => option.listingTypeId === form.listingType,
    );
    if (!currentEstimate || !selectedEstimate) {
      setError(
        "Actualiza las comisiones antes de cambiar las cuotas de la publicación",
      );
      return;
    }
    if (!shippingComparison) {
      setError(
        "Compara el envío antes de aplicar estas condiciones en Mercado Libre",
      );
      return;
    }
    if (!form.freeShipping && !shippingComparison.buyerPays) {
      setError(
        "Mercado Libre exige envío gratis para esta publicación; P de Papel debe asumirlo",
      );
      return;
    }

    const currentShippingCost =
      getSellerShippingCost(
        activeCurrentShippingComparison,
        activeSaleConditions.current.freeShipping,
      ) ?? 0;
    const selectedShippingCost =
      getSellerShippingCost(shippingComparison, form.freeShipping) ?? 0;
    const feeDifference =
      selectedEstimate.saleFeeAmount - currentEstimate.saleFeeAmount;
    const shippingDifference = selectedShippingCost - currentShippingCost;
    const selectedNet =
      activeSaleConditions.current.price -
      selectedEstimate.saleFeeAmount -
      selectedShippingCost;
    const currentInstallments =
      currentEstimate.installmentLabel ??
      currentEstimate.listingTypeName ??
      activeSaleConditions.current.listingType;
    const selectedInstallments =
      selectedEstimate.installmentLabel ??
      selectedEstimate.listingTypeName ??
      form.listingType;
    const currentShippingLabel = activeSaleConditions.current.freeShipping
      ? `P de Papel paga aproximadamente ${currencyFormatter.format(currentShippingCost)}`
      : "La compradora paga el envío";
    const selectedShippingLabel = form.freeShipping
      ? `P de Papel pagará aproximadamente ${currencyFormatter.format(selectedShippingCost)}`
      : "La compradora pagará el envío";

    if (
      !(await requestConfirmation({
        title: "¿Aplicar estas condiciones en Mercado Libre?",
        description: `Cuotas: ${currentInstallments} → ${selectedInstallments}. Cargo por venta: ${currencyFormatter.format(currentEstimate.saleFeeAmount)} → ${currencyFormatter.format(selectedEstimate.saleFeeAmount)} (${formatCurrencyDifference(feeDifference)}). Envío: ${currentShippingLabel} → ${selectedShippingLabel} (${formatCurrencyDifference(shippingDifference)} para P de Papel). Neto estimado antes de costo del producto e impuestos: ${currencyFormatter.format(selectedNet)}.`,
        confirmLabel: "Aplicar condiciones",
      }))
    ) {
      return;
    }

    setIsApplyingSaleConditions(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/listings/${editingListing.id}/sale-conditions`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listingType: form.listingType,
            freeShipping: form.freeShipping,
          }),
        },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const result = (await response.json()) as {
        current: ActiveSaleConditions["current"];
      };
      const nextConditions = {
        ...activeSaleConditions,
        current: result.current,
        options: priceOptions,
      };
      setActiveSaleConditions(nextConditions);
      setForm((current) => ({
        ...current,
        listingType: result.current.listingType,
        freeShipping: result.current.freeShipping,
        localPickUp: result.current.localPickUp,
      }));
      setPriceEstimate(
        nextConditions.options.find(
          (option) => option.listingTypeId === result.current.listingType,
        ) ?? null,
      );
      const refreshedShipping = await loadShippingComparison({
        listingId: editingListing.id,
        price: String(result.current.price),
        listingType: result.current.listingType,
      });
      setActiveCurrentShippingComparison(refreshedShipping);
      await loadListings();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible actualizar las condiciones en Mercado Libre",
      );
    } finally {
      setIsApplyingSaleConditions(false);
    }
  };

  const suggestPriceFromProfile = async (
    product: SelectedProduct,
    profile: PublicationProfile,
    initialMarketplacePrice: string,
  ) => {
    if (product.acqPrice === null || profile.minimumMarginAmount === null) {
      return;
    }

    setIsSuggestingPrice(true);
    try {
      const recommendation = await recommendMercadoLibreListingPrice({
        acquisitionCost: product.acqPrice,
        targetProfit: profile.minimumMarginAmount,
        additionalCosts: Math.max(0, product.transportationCost ?? 0),
        initialPrice: product.price,
        getFeeQuote: (price) => getPriceEstimate(price, profile.categoryId),
      });
      if (!recommendation) return;
      setForm((current) =>
        current.productId === product.id &&
        current.categoryId === profile.categoryId &&
        current.marketplacePrice === initialMarketplacePrice
          ? { ...current, marketplacePrice: String(recommendation.price) }
          : current,
      );
    } catch {
      setPriceEstimate(null);
    } finally {
      setIsSuggestingPrice(false);
    }
  };

  const suggestPriceFromTarget = async () => {
    if (!selectedProduct) {
      setError("Selecciona un producto antes de calcular su precio");
      return;
    }
    if (!form.categoryId.trim()) {
      setError("Selecciona una categoría de Mercado Libre antes de calcular");
      return;
    }
    if (selectedProduct.acqPrice === null) {
      setError(
        "Registra el costo de adquisición del producto para calcular la ganancia objetivo",
      );
      return;
    }
    const targetProfit = Number(form.minimumMarginAmount);
    if (
      !form.minimumMarginAmount.trim() ||
      !Number.isFinite(targetProfit) ||
      targetProfit < 0
    ) {
      setError("Escribe una ganancia objetivo válida antes de calcular");
      return;
    }

    setIsSuggestingPrice(true);
    setError(null);
    try {
      if (form.freeShipping && !shippingComparison) {
        setError(
          "Compara primero el envío para incluir su costo en la ganancia objetivo",
        );
        return;
      }
      // Solo el envío que paga la tienda entra al costo: si lo paga el
      // comprador, no se descuenta de la ganancia.
      const estimatedShippingCost =
        shippingComparison && form.freeShipping
          ? shippingComparison.sellerOffersFree.sellerCost
          : 0;
      // Envío y otros gastos por unidad del producto: parte del costo real.
      const unitExtraCosts = Math.max(0, selectedProduct.transportationCost ?? 0);
      const initialPrice = Number(form.marketplacePrice);
      const recommendation = await recommendMercadoLibreListingPrice({
        acquisitionCost: selectedProduct.acqPrice,
        targetProfit,
        additionalCosts: estimatedShippingCost + unitExtraCosts,
        initialPrice:
          Number.isFinite(initialPrice) && initialPrice > 0
            ? initialPrice
            : selectedProduct.price,
        getFeeQuote: (price) => getPriceEstimate(price, form.categoryId),
      });
      if (!recommendation) {
        setError("No fue posible calcular un precio sugerido para esta meta");
        return;
      }

      setForm((current) =>
        current.productId === selectedProduct.id &&
        current.categoryId === form.categoryId
          ? { ...current, marketplacePrice: String(recommendation.price) }
          : current,
      );
      setPriceEstimate(
        await getPriceEstimate(
          recommendation.price,
          form.categoryId,
          form.listingType,
        ),
      );
      setShippingComparison(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible calcular el precio de Mercado Libre",
      );
    } finally {
      setIsSuggestingPrice(false);
    }
  };

  const updateSelectedProduct = (
    productId: string,
    product?: AsyncProductOption | null,
  ) => {
    const selected = toSelectedProduct(product);
    const initialMarketplacePrice = String(selected?.price ?? "");
    const profile = publicationProfiles.find(
      (item) => item.localCategoryId === selected?.category?.id,
    );
    setSelectedProduct(selected);
    setQuickProfile(profile ?? null);
    setSuggestions([]);
    setSuggestionsNotice(null);
    setCategoryAttributes([]);
    setVerifiedCategoryId(null);
    setPriceEstimate(null);
    setPriceOptions([]);
    setShippingComparison(null);
    setError(null);
    setForm((current) => ({
      ...current,
      productId,
      familyName: selected?.name ?? "",
      marketplacePrice: initialMarketplacePrice,
      categoryId: profile?.categoryId ?? "",
      stockSafetyBuffer: String(profile?.stockSafetyBuffer ?? 0),
      minimumMarginAmount:
        profile?.minimumMarginAmount === null ||
        profile?.minimumMarginAmount === undefined
          ? ""
          : String(profile.minimumMarginAmount),
      imageUrls: selected?.images.map((image) => image.url) ?? [],
      attributes: profile ? attributesToText(profile.attributes) : "",
    }));
    if (selected && profile) {
      void suggestPriceFromProfile(selected, profile, initialMarketplacePrice);
    }
  };

  const loadListingQuality = async (listing: Listing) => {
    if (!listing.externalItemId) return;

    setLoadingQualityId(listing.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/listings/${listing.id}/quality`,
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const quality = (await response.json()) as ListingQuality;
      setQualityByListingId((current) => ({
        ...current,
        [listing.id]: quality,
      }));
      setDetailsListingId(listing.id);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible consultar la calidad de la publicación",
      );
    } finally {
      setLoadingQualityId(null);
    }
  };

  const updateVideoReminder = async (
    listing: Listing,
    action: "snooze" | "show",
  ) => {
    setUpdatingVideoReminderId(listing.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/listings/${listing.id}/quality/video-reminder`,
        { method: action === "snooze" ? "POST" : "DELETE" },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const responseBody =
        action === "snooze"
          ? ((await response.json()) as { snoozedUntil?: unknown })
          : null;
      const snoozedUntil =
        typeof responseBody?.snoozedUntil === "string"
          ? responseBody.snoozedUntil
          : null;

      setQualityByListingId((current) => {
        const quality = current[listing.id];
        if (!quality?.videoRecommendation) return current;

        return {
          ...current,
          [listing.id]: {
            ...quality,
            videoRecommendation: {
              ...quality.videoRecommendation,
              snoozedUntil,
            },
          },
        };
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible actualizar el recordatorio del clip",
      );
    } finally {
      setUpdatingVideoReminderId(null);
    }
  };

  const syncListingContent = async (listing: Listing) => {
    if (
      !(await requestConfirmation({
        title: "¿Sincronizar contenido?",
        description:
          "Se reemplazarán en Mercado Libre las imágenes elegidas, la descripción y las características configuradas.",
        confirmLabel: "Sincronizar contenido",
      }))
    ) {
      return;
    }

    setSyncingContentId(listing.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/listings/${listing.id}/sync-content`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      setNotice(
        `${listing.product.name}: ${body?.message ?? "el contenido quedó programado para sincronizarse"}.`,
      );
      await loadListings();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible programar la sincronización de contenido",
      );
    } finally {
      setSyncingContentId(null);
    }
  };

  const reviewListingContent = async (listing: Listing) => {
    setReviewingContentId(listing.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/listings/${listing.id}/content-review`,
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const review = (await response.json()) as ContentReview;
      setContentReviewByListingId((current) => ({
        ...current,
        [listing.id]: review,
      }));
      setDetailsListingId(listing.id);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible revisar el contenido de la publicación",
      );
    } finally {
      setReviewingContentId(null);
    }
  };

  const saveListing = async (): Promise<PublishableListing | null> => {
    if (!form.productId || !form.marketplacePrice || !form.categoryId) {
      setError(
        "Producto, precio de Mercado Libre y categoría son obligatorios",
      );
      return null;
    }
    if (verifiedCategoryId !== form.categoryId.trim().toUpperCase()) {
      const categoryIsReady = await loadCategoryAttributes();
      if (!categoryIsReady) return null;
    }

    setIsSaving(true);
    setError(null);
    try {
      const attributes = parseFormAttributes(form.attributes);
      const payload = {
        familyName: form.familyName,
        marketplacePrice: form.marketplacePrice,
        categoryId: form.categoryId,
        ...(!editingListing?.externalItemId
          ? {
              listingType: form.listingType,
              saleConditions: {
                shippingMode: "me2",
                freeShipping: form.freeShipping,
                localPickUp: form.localPickUp,
                packageDimensions:
                  form.packageHeightCm &&
                  form.packageWidthCm &&
                  form.packageLengthCm &&
                  form.packageWeightGrams
                    ? {
                        heightCm: Number(form.packageHeightCm),
                        widthCm: Number(form.packageWidthCm),
                        lengthCm: Number(form.packageLengthCm),
                        weightGrams: Number(form.packageWeightGrams),
                      }
                    : null,
              },
            }
          : {}),
        stockSafetyBuffer: form.stockSafetyBuffer,
        minimumMarginAmount: form.minimumMarginAmount,
        syncStock: true,
        syncPrice: form.syncPrice,
        imageUrls: form.imageUrls,
        attributes,
        ...(form.belowCostReason.trim()
          ? { priceOverride: { reason: form.belowCostReason.trim() } }
          : {}),
      };
      let savedListingId = editingListing?.id ?? draftId ?? undefined;
      if (savedListingId) {
        const response = await fetch(
          `/api/${storeId}/marketplaces/mercadolibre/listings/${savedListingId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (!response.ok) throw new Error(await getErrorMessage(response));
        savedListingId = ((await response.json()) as { id: string }).id;
      } else {
        const response = await fetch(
          `/api/${storeId}/marketplaces/mercadolibre/listings`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, productId: form.productId }),
          },
        );
        if (!response.ok) throw new Error(await getErrorMessage(response));
        savedListingId = ((await response.json()) as { id: string }).id;
      }
      if (!savedListingId) {
        throw new Error("No fue posible identificar la publicación guardada");
      }

      const savedListing: PublishableListing = {
        id: savedListingId,
        marketplacePrice: Number(form.marketplacePrice),
        product: {
          name:
            selectedProduct?.name ??
            editingListing?.product.name ??
            "Producto seleccionado",
        },
      };

      setPersistedForm(JSON.stringify(form));
      setIsDialogOpen(false);
      await loadListings();
      return savedListing;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible guardar la publicación",
      );
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const publishListing = async (
    listing: PublishableListing,
    skipConfirmation = false,
  ) => {
    if (!canPublish) {
      setError(
        "Activa primero el procesamiento seguro para evitar desajustes de inventario",
      );
      return;
    }
    if (
      !skipConfirmation &&
      !(await requestConfirmation({
        title: "¿Publicar en Mercado Libre?",
        description: `Publicarás “${listing.product.name}” por ${currencyFormatter.format(listing.marketplacePrice ?? 0)}.`,
        confirmLabel: "Publicar producto",
      }))
    ) {
      return;
    }

    setPublishingId(listing.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/listings/${listing.id}/publish`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setNotice(`${listing.product.name} se envió a Mercado Libre.`);
      await loadListings();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible publicar el producto",
      );
    } finally {
      setPublishingId(null);
    }
  };

  const deleteDraft = async (listing: Listing) => {
    if (
      !(await requestConfirmation({
        title: "¿Eliminar este borrador?",
        description:
          "Se eliminará solo de Administración. No se puede recuperar y no afecta publicaciones ya activas en Mercado Libre.",
        confirmLabel: "Eliminar borrador",
        destructive: true,
      }))
    ) {
      return;
    }

    setDeletingDraftId(listing.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/listings/${listing.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setNotice(`Se eliminó el borrador de ${listing.product.name}.`);
      await loadListings();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible eliminar el borrador",
      );
    } finally {
      setDeletingDraftId(null);
    }
  };

  /**
   * Borrador paso a paso: al salir del paso 1 se crea el borrador; al salir
   * de 2 y 3 se guarda lo completado. Cerrar el diálogo ya no pierde nada.
   */
  const persistWizardStep = async (step: ListingWizardStep): Promise<boolean> => {
    const existingId = editingListing?.id ?? draftId;
    try {
      if (step === 1 && !existingId) {
        const response = await fetch(
          `/api/${storeId}/marketplaces/mercadolibre/listings`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              productId: form.productId,
              familyName: form.familyName,
              // Las fotos se confirman en el paso 2; aquí solo van si ya hay
              // una selección válida (sin fotos el borrador igual se crea).
              ...(form.imageUrls.length > 0 && form.imageUrls.length <= 10
                ? { imageUrls: form.imageUrls }
                : {}),
              stockSafetyBuffer: form.stockSafetyBuffer,
              minimumMarginAmount: form.minimumMarginAmount,
              syncStock: true,
              syncPrice: form.syncPrice,
              attributes: [],
            }),
          },
        );
        if (!response.ok) {
          const message = await getErrorMessage(response);
          throw new Error(
            response.status === 409
              ? "Este producto ya tiene un borrador de Mercado Libre. Ciérralo y ábrelo desde la lista con «Editar»."
              : message,
          );
        }
        const created = (await response.json()) as { id: string };
        setDraftId(created.id);
        void loadListings();
      } else if (existingId && (step === 2 || step === 3)) {
        const body =
          step === 2
            ? {
                categoryId: form.categoryId,
                imageUrls: form.imageUrls,
                familyName: form.familyName,
              }
            : { attributes: parseFormAttributes(form.attributes) };
        const response = await fetch(
          `/api/${storeId}/marketplaces/mercadolibre/listings/${existingId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        if (!response.ok) {
          const responseError = await getResponseError(response);
          // «No hay cambios para guardar» no es un fallo: el paso ya estaba igual.
          if (response.status !== 400 || !/cambios/i.test(responseError.message)) {
            throw new Error(responseError.message);
          }
        }
      }
      setPersistedForm(JSON.stringify(form));
      return true;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible guardar el borrador",
      );
      return false;
    }
  };

  const isWizardDirty = () => JSON.stringify(form) !== persistedForm;

  const requestCloseWizard = async (): Promise<boolean> => {
    if (isSaving) return false;
    if (!isWizardDirty()) return true;
    return requestConfirmation({
      title: "¿Cerrar sin guardar?",
      description:
        editingListing || draftId
          ? "Se perderán los cambios hechos desde el último paso guardado. El borrador sigue disponible en la lista."
          : "Todavía no hay borrador: se perderá todo lo escrito en este asistente.",
      confirmLabel: "Cerrar de todos modos",
      destructive: true,
    });
  };

  const dirtyCheckRef = useRef({ form, persistedForm });
  dirtyCheckRef.current = { form, persistedForm };
  useEffect(() => {
    if (!isDialogOpen) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(dirtyCheckRef.current.form) === dirtyCheckRef.current.persistedForm) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDialogOpen]);

  const saveAndPublishListing = async () => {
    if (!canPublish) {
      setError(
        "Activa primero el procesamiento seguro para evitar desajustes de inventario",
      );
      return;
    }
    const publishableStock = Math.max(
      (selectedProduct?.stock ?? 0) -
        Math.max(Number(form.stockSafetyBuffer) || 0, 0),
      0,
    );
    if (publishableStock === 0) {
      setError(
        "No hay unidades disponibles después de descontar el stock de seguridad. Repón stock o ajusta la seguridad antes de publicar.",
      );
      return;
    }

    const productName =
      selectedProduct?.name ?? editingListing?.product.name ?? "este producto";
    if (
      !(await requestConfirmation({
        title: "¿Guardar y publicar?",
        description: `Guardarás y publicarás “${productName}” por ${currencyFormatter.format(Number(form.marketplacePrice) || 0)}.`,
        confirmLabel: "Guardar y publicar",
      }))
    ) {
      return;
    }

    const savedListing = await saveListing();
    if (!savedListing) return;
    await publishListing(savedListing, true);
  };

  /**
   * Envía una acción a la cola para las publicaciones indicadas y guarda el
   * resultado fila por fila. La usan la barra de selección de la tabla y las
   * acciones «Pausar»/«Activar» de una sola fila.
   */
  const queueBulkAction = async (
    action: BulkAction,
    listingIds: string[],
    { confirmed = false, singleListing }: { confirmed?: boolean; singleListing?: Listing } = {},
  ) => {
    if (listingIds.length === 0) {
      setError("Selecciona al menos una publicación para continuar");
      return;
    }
    if (listingIds.length > MAX_BULK_LISTINGS) {
      setError(
        `Las acciones masivas se aplican de a ${MAX_BULK_LISTINGS} publicaciones como máximo; tienes ${listingIds.length} seleccionadas.`,
      );
      return;
    }
    const actionLabel = bulkActionLabels[action];
    if (
      !confirmed &&
      !(await requestConfirmation({
        title: singleListing
          ? `¿${action === "pause" ? "Pausar" : "Activar"} ${singleListing.product.name}?`
          : `¿${actionLabel}?`,
        description: singleListing
          ? `El cambio se envía a Mercado Libre en segundo plano y la fila se actualiza cuando termine.`
          : `Se aplicará «${actionLabel}» a ${listingIds.length} publicación${listingIds.length === 1 ? "" : "es"}, en segundo plano y con reintentos. Las que no cumplan la condición se omiten y se indica el motivo en su fila.`,
        confirmLabel: singleListing
          ? action === "pause"
            ? "Pausar"
            : "Activar"
          : "Aplicar de forma segura",
      }))
    ) {
      return;
    }

    if (singleListing) setChangingStatusId(singleListing.id);
    else setIsRunningBulkAction(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/listings/bulk`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, listingIds }),
        },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const body = (await response.json()) as {
        queued: number;
        skipped: { listingId: string; reason: string }[];
        results: { listingId: string; outcome: "queued" | "skipped"; reason: string | null }[];
      };
      setBulkOutcome({
        action,
        at: new Date().toISOString(),
        queued: body.queued,
        skipped: body.skipped.length,
        byListingId: Object.fromEntries(
          body.results.map((result) => [
            result.listingId,
            { outcome: result.outcome, reason: result.reason },
          ]),
        ),
      });
      setNotice(
        singleListing
          ? body.queued === 1
            ? `${singleListing.product.name}: ${action === "pause" ? "pausa" : "activación"} programada en segundo plano.`
            : (body.skipped[0]?.reason ?? "No se aplicó el cambio.")
          : `${actionLabel}: ${body.queued} programada${body.queued === 1 ? "" : "s"} en segundo plano${body.skipped.length > 0 ? `, ${body.skipped.length} omitida${body.skipped.length === 1 ? "" : "s"} (el motivo aparece en cada fila)` : ""}.`,
      );
      if (!singleListing) setRowSelection({});
      await loadListings();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible programar la acción masiva",
      );
    } finally {
      setIsRunningBulkAction(false);
      setChangingStatusId(null);
    }
  };

  const applyCategoryTemplate = (template: CategoryTemplate) => {
    setForm((current) => ({
      ...current,
      attributes: attributesToText(template.attributes),
      stockSafetyBuffer:
        template.stockSafetyBuffer === null
          ? current.stockSafetyBuffer
          : String(template.stockSafetyBuffer),
      minimumMarginAmount:
        template.minimumMarginAmount === null
          ? current.minimumMarginAmount
          : String(template.minimumMarginAmount),
    }));
    setError(null);
  };

  const openCategoryTemplateDialog = async () => {
    if (!form.categoryId) {
      setError("Selecciona una categoría antes de guardar una plantilla");
      return;
    }

    setTemplateName("");
    setIsTemplateDialogOpen(true);
  };

  const saveCategoryTemplate = async () => {
    if (!form.categoryId) {
      setError("Selecciona una categoría antes de guardar una plantilla");
      return;
    }
    if (verifiedCategoryId !== form.categoryId.trim().toUpperCase()) {
      const categoryIsReady = await loadCategoryAttributes();
      if (!categoryIsReady) return;
    }
    let attributes: MarketplaceAttribute[];
    try {
      attributes = parseFormAttributes(form.attributes);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Revisa las características antes de guardar la plantilla",
      );
      return;
    }
    if (attributes.length === 0) {
      setError(
        "Agrega al menos una característica antes de guardar la plantilla",
      );
      return;
    }
    const name = templateName.trim();
    if (!name) {
      setError("Escribe un nombre para identificar esta plantilla");
      return;
    }

    setIsSavingTemplate(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/templates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId: form.categoryId,
            name: name.trim(),
            attributes,
            stockSafetyBuffer: form.stockSafetyBuffer,
            minimumMarginAmount: form.minimumMarginAmount,
          }),
        },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      await loadCategoryTemplates();
      setIsTemplateDialogOpen(false);
      setTemplateName("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible guardar la plantilla",
      );
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const saveQuickProfile = async () => {
    if (!selectedProduct?.category) {
      setError(
        "Selecciona un producto con categoría antes de guardar el perfil",
      );
      return;
    }
    if (!form.categoryId) {
      setError(
        "Selecciona una categoría de Mercado Libre antes de guardar el perfil",
      );
      return;
    }
    if (verifiedCategoryId !== form.categoryId.trim().toUpperCase()) {
      const categoryIsReady = await loadCategoryAttributes();
      if (!categoryIsReady) return;
    }

    let attributes: MarketplaceAttribute[];
    try {
      attributes = parseFormAttributes(form.attributes);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Revisa las características antes de guardar el perfil",
      );
      return;
    }

    setIsSavingQuickProfile(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/profiles`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            localCategoryId: selectedProduct.category.id,
            categoryId: form.categoryId,
            name: `${selectedProduct.category.name} · Mercado Libre`,
            attributes,
            stockSafetyBuffer: form.stockSafetyBuffer,
            minimumMarginAmount: form.minimumMarginAmount,
          }),
        },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const profile = (await response.json()) as PublicationProfile;
      setPublicationProfiles((current) => [
        profile,
        ...current.filter((item) => item.id !== profile.id),
      ]);
      setQuickProfile(profile);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible guardar el perfil rápido",
      );
    } finally {
      setIsSavingQuickProfile(false);
    }
  };

  // La tabla está memorizada: recibe funciones de identidad fija que leen
  // siempre la versión más reciente de cada acción a través de una ref.
  const actionsRef = useRef({
    openEditListing,
    publishListing,
    deleteDraft,
    reviewListingContent,
    syncListingContent,
    loadListingQuality,
    queueBulkAction,
    updateVideoReminder,
    setVideoLibraryTarget,
  });
  actionsRef.current = {
    openEditListing,
    publishListing,
    deleteDraft,
    reviewListingContent,
    syncListingContent,
    loadListingQuality,
    queueBulkAction,
    updateVideoReminder,
    setVideoLibraryTarget,
  };
  const rowHandlers = useMemo<ListingRowHandlers>(
    () => ({
      onEdit: (listing) => actionsRef.current.openEditListing(listing),
      onPublish: (listing) => void actionsRef.current.publishListing(listing),
      onDeleteDraft: (listing) => void actionsRef.current.deleteDraft(listing),
      onReviewContent: (listing) => void actionsRef.current.reviewListingContent(listing),
      onSyncContent: (listing) => void actionsRef.current.syncListingContent(listing),
      onReviewQuality: (listing) => void actionsRef.current.loadListingQuality(listing),
      onPause: (listing) =>
        void actionsRef.current.queueBulkAction("pause", [listing.id], { singleListing: listing }),
      onActivate: (listing) =>
        void actionsRef.current.queueBulkAction("activate", [listing.id], { singleListing: listing }),
    }),
    [],
  );
  const runBulkAction = useCallback(
    (action: BulkAction, listingIds: string[]) => void actionsRef.current.queueBulkAction(action, listingIds),
    [],
  );
  const busy = useMemo(
    () => ({
      publishingId,
      deletingDraftId,
      reviewingContentId,
      syncingContentId,
      loadingQualityId,
      changingStatusId,
      updatingVideoReminderId,
    }),
    [
      publishingId,
      deletingDraftId,
      reviewingContentId,
      syncingContentId,
      loadingQualityId,
      changingStatusId,
      updatingVideoReminderId,
    ],
  );
  const detailsListing = detailsListingId
    ? (listings.find((listing) => listing.id === detailsListingId) ?? null)
    : null;
  const emptyAction = useMemo(
    () => (
      <Button type="button" onClick={() => openNewListingRef.current()} disabled={!canPublish}>
        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
        Preparar publicación
      </Button>
    ),
    [canPublish],
  );

  return (
    <SectionCard
      id="mercadolibre-listings"
      title="Publicaciones"
      description="Define un precio exclusivo de Mercado Libre. Nunca se copiarán descuentos ni precios de la tienda."
      action={
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadImportPreview()}
            disabled={!canPublish || isLoadingImportPreview}
            isLoading={isLoadingImportPreview}
            loadingText="Revisando…"
          >
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Importar existentes
          </Button>
          <Button type="button" size="sm" onClick={openNewListing} disabled={!canPublish}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Preparar publicación
          </Button>
        </div>
      }
    >

        {!canPublish ? (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            Conecta Mercado Libre y activa el procesamiento seguro antes de
            crear o publicar productos.
          </p>
        ) : null}
        {error ? (
          <div
            className="flex items-start justify-between gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            <p>{error}</p>
            <Button type="button" variant="ghost" size="xs" onClick={() => setError(null)}>
              Cerrar
            </Button>
          </div>
        ) : null}
        {notice ? (
          <div
            className="flex items-start justify-between gap-2 rounded-md border border-tint-mint bg-tint-mint/30 p-3 text-sm"
            role="status"
          >
            <p>{notice}</p>
            <Button type="button" variant="ghost" size="xs" onClick={() => setNotice(null)}>
              Cerrar
            </Button>
          </div>
        ) : null}
        {importResult ? (
          <div
            className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-tint-mint bg-tint-mint/30 p-3 text-sm"
            role="status"
          >
            <div>
              <p className="font-medium">
                Se vincularon {importResult.importedCount} publicación
                {importResult.importedCount === 1 ? "" : "es"} y su stock quedó
                programado para sincronizarse.
              </p>
              <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                {importResult.imported.map((item) => (
                  <li key={item.listingId}>
                    {item.title}
                    {item.replacedDraft ? " (reemplazó un borrador)" : ""}
                  </li>
                ))}
              </ul>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setImportResult(null)}
            >
              Entendido
            </Button>
          </div>
        ) : null}
        {importPreview ? (
          <div className="space-y-4 rounded-md border bg-muted/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-medium">Revisar publicaciones existentes</p>
                <p className="text-sm text-muted-foreground">
                  Se encontraron {importPreview.summary.total}. Las que tienen
                  SKU se proponen automáticamente; si falta, elige el producto
                  local manualmente antes de vincularla.
                </p>
                {importPreview.partial ? (
                  <p className="mt-1 text-sm text-warning" role="status">
                    Mercado Libre no respondió por{" "}
                    {importPreview.summary.unavailable} publicación
                    {importPreview.summary.unavailable === 1 ? "" : "es"}; la
                    lista está incompleta. Vuelve a revisar en unos minutos
                    para verlas.
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setImportPreview(null);
                  setImportSelections({});
                }}
              >
                Cerrar
              </Button>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <p className="rounded-md bg-background p-3">
                <span className="block text-muted-foreground">
                  Ya vinculadas
                </span>
                <span className="font-semibold">
                  {importPreview.summary.alreadyLinked}
                </span>
              </p>
              <p className="rounded-md bg-background p-3">
                <span className="block text-muted-foreground">
                  Con vínculo sugerido
                </span>
                <span className="font-semibold">
                  {importPreview.summary.readyToImport}
                </span>
              </p>
              <p className="rounded-md bg-background p-3">
                <span className="block text-muted-foreground">
                  Para revisar
                </span>
                <span className="font-semibold">
                  {importPreview.summary.needsReview}
                </span>
              </p>
            </div>
            <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-4 [scrollbar-gutter:stable]">
              {importPreview.listings.map((listing) => {
                const selection = importSelections[listing.key] ?? {
                  productId: "",
                  selected: false,
                };
                const isAlreadyLinked = Boolean(listing.existingListingId);
                const cannotImport =
                  isAlreadyLinked || listing.status === "ERROR";
                const draftListingId = getDraftForImportRow(
                  listing,
                  selection.productId,
                );
                const needsDraftConfirmation =
                  Boolean(draftListingId) && !selection.replaceDraft;
                return (
                  <div
                    key={listing.key}
                    className="grid gap-3 rounded-md border bg-background p-3 lg:grid-cols-[auto_minmax(0,1fr)_minmax(14rem,0.8fr)] lg:items-center"
                  >
                    <Checkbox
                      aria-label={`Importar ${listing.title}`}
                      checked={selection.selected && !needsDraftConfirmation}
                      disabled={
                        cannotImport ||
                        !selection.productId ||
                        needsDraftConfirmation
                      }
                      onCheckedChange={(checked) =>
                        updateImportSelection(listing.key, {
                          selected: checked === true,
                        })
                      }
                    />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{listing.title}</p>
                        <Badge
                          variant={getListingStatusMeta(listing.status).variant}
                        >
                          {getListingStatusMeta(listing.status).label}
                        </Badge>
                        {isAlreadyLinked ? (
                          <Badge variant="secondary">Ya vinculada</Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {listing.externalItemId}
                        {listing.externalVariationId
                          ? ` · Variación ${listing.externalVariationId}`
                          : ""}
                        {listing.sellerSku
                          ? ` · SKU ${listing.sellerSku}`
                          : " · Sin SKU"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Precio Mercado Libre:{" "}
                        {currencyFormatter.format(
                          listing.marketplacePrice ?? 0,
                        )}
                        {listing.availableQuantity !== null
                          ? ` · Stock publicado: ${listing.availableQuantity}`
                          : ""}
                      </p>
                      {listing.issue ? (
                        <p className="text-xs text-warning">{listing.issue}</p>
                      ) : null}
                      {listing.warnings
                        .filter(
                          (warning) =>
                            // El aviso de borrador se muestra junto a su casilla.
                            !warning.startsWith("El producto local ya tiene un borrador"),
                        )
                        .map((warning) => (
                          <p key={warning} className="text-xs text-warning">
                            {warning}
                          </p>
                        ))}
                      {draftListingId ? (
                        <label className="flex items-start gap-2 text-xs text-warning">
                          <Checkbox
                            className="mt-0.5"
                            checked={selection.replaceDraft}
                            onCheckedChange={(checked) =>
                              updateImportSelection(listing.key, {
                                replaceDraft: checked === true,
                              })
                            }
                          />
                          <span>
                            El producto elegido ya tiene un borrador en
                            Administración. Reemplazar el borrador con esta
                            publicación (el borrador se sobrescribe; su
                            reserva de seguridad se conserva).
                          </span>
                        </label>
                      ) : null}
                    </div>
                    {isAlreadyLinked ? (
                      <p className="text-sm text-success">
                        Vinculada a:{" "}
                        {listing.linkedProduct?.name ?? "Producto local"}
                      </p>
                    ) : (
                      <div className="grid gap-1">
                        <Label
                          className="text-xs font-medium"
                          htmlFor={`mercadolibre-import-${listing.key}`}
                        >
                          Producto local
                        </Label>
                        <AsyncProductSelect
                          id={`mercadolibre-import-${listing.key}`}
                          value={selection.productId ?? ""}
                          modal
                          ariaLabel={`Producto local para ${listing.title}`}
                          placeholder="Buscar producto local..."
                          className="min-h-10"
                          disabled={listing.status === "ERROR"}
                          onChange={(productId) =>
                            updateImportSelection(listing.key, {
                              productId,
                              selected: Boolean(productId),
                            })
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {selectedImportCount} publicación
                {selectedImportCount === 1
                  ? " seleccionada"
                  : "es seleccionadas"}
              </p>
              <Button
                type="button"
                onClick={() => void importExistingListings()}
                disabled={isImportingListings || selectedImportCount === 0}
              >
                {isImportingListings ? "Vinculando…" : "Vincular y sincronizar"}
              </Button>
            </div>
          </div>
        ) : null}
        <ListingTable
          listings={listings}
          isLoading={isLoading}
          error={null}
          onRetry={() => void loadListings()}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          highlightedListingId={highlightedListingId}
          busy={busy}
          bulkOutcome={bulkOutcome}
          isRunningBulkAction={isRunningBulkAction}
          onRunBulkAction={runBulkAction}
          handlers={rowHandlers}
          emptyAction={emptyAction}
        />
        <ListingDetailsSheet
          listing={detailsListing}
          quality={detailsListing ? qualityByListingId[detailsListing.id] : undefined}
          contentReview={detailsListing ? contentReviewByListingId[detailsListing.id] : undefined}
          isLoadingQuality={Boolean(detailsListing) && loadingQualityId === detailsListing?.id}
          isLoadingContent={Boolean(detailsListing) && reviewingContentId === detailsListing?.id}
          isUpdatingVideoReminder={Boolean(detailsListing) && updatingVideoReminderId === detailsListing?.id}
          handlers={{
            onRefreshQuality: (listing) => void loadListingQuality(listing),
            onRefreshContent: (listing) => void reviewListingContent(listing),
            onSnoozeVideoReminder: (listing) => void updateVideoReminder(listing, "snooze"),
            onShowVideoReminder: (listing) => void updateVideoReminder(listing, "show"),
            onPrepareClip: (listing, uploadUrl) => setVideoLibraryTarget({ listing, uploadUrl }),
          }}
          onClose={() => setDetailsListingId(null)}
        />


      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsDialogOpen(true);
            return;
          }
          void requestCloseWizard().then((canClose) => {
            if (!canClose) return;
            setIsDialogOpen(false);
            saleConditionsRequestId.current += 1;
          });
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingListing ? (
                <Pencil className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Plus className="h-5 w-5 text-muted-foreground" />
              )}
              {editingListing?.externalItemId
                ? "Editar publicación"
                : editingListing
                  ? "Editar borrador"
                  : "Preparar publicación"}
              <span className="font-normal text-muted-foreground">
                · {getListingWizardStepLabel(wizardStep)}
              </span>
            </DialogTitle>
            <DialogDescription>
              Paso {wizardStep} de {LISTING_WIZARD_STEPS.length}. El precio
              corresponde solo a Mercado Libre e incluye su comisión.
            </DialogDescription>
          </DialogHeader>
          <ListingPublicationWizard
            key={editingListing?.id ?? "new-listing"}
            storeId={storeId}
            editing={Boolean(editingListing)}
            productLocked={Boolean(editingListing) || Boolean(draftId)}
            draftSaved={Boolean(editingListing) || Boolean(draftId)}
            initialStep={initialWizardStep}
            initialIssue={initialWizardIssue}
            onPersistStep={persistWizardStep}
            onStepChange={setWizardStep}
            suggestionsNotice={suggestionsNotice}
            activePublication={Boolean(editingListing?.externalItemId)}
            activeSaleConditions={activeSaleConditions}
            canPublishDirectly={canPublish && !editingListing?.externalItemId}
            form={form}
            setForm={setForm}
            error={error}
            selectedProduct={selectedProduct}
            suggestions={suggestions}
            categoryAttributes={categoryAttributes}
            verifiedCategoryId={verifiedCategoryId}
            categoryTemplates={categoryTemplates.filter(
              (template) => template.categoryId === form.categoryId,
            )}
            quickProfile={quickProfile}
            priceEstimate={priceEstimate}
            priceOptions={priceOptions}
            shippingComparison={shippingComparison}
            isSearchingCategories={isSearchingCategories}
            isLoadingCategoryAttributes={isLoadingCategoryAttributes}
            isLoadingPriceEstimate={isLoadingPriceEstimate}
            isLoadingShippingComparison={isLoadingShippingComparison}
            isLoadingSaleConditions={isLoadingSaleConditions}
            isApplyingSaleConditions={isApplyingSaleConditions}
            isSuggestingPrice={isSuggestingPrice}
            isSaving={isSaving}
            isSavingTemplate={isSavingTemplate}
            isSavingQuickProfile={isSavingQuickProfile}
            onFormChange={updateForm}
            onProductChange={updateSelectedProduct}
            onSearchCategories={() => searchCategories()}
            onCategoryChange={updateCategory}
            onLoadCategoryAttributes={loadCategoryAttributes}
            onLoadPriceEstimate={loadPriceEstimate}
            onLoadShippingComparison={loadShippingComparison}
            onApplyActiveSaleConditions={applyActiveSaleConditions}
            onListingTypeChange={updateListingType}
            onSuggestPriceFromTarget={suggestPriceFromTarget}
            onApplyCategoryTemplate={(templateId) => {
              const template = categoryTemplates.find(
                (item) => item.id === templateId,
              );
              if (template) applyCategoryTemplate(template);
            }}
            onSaveCategoryTemplate={openCategoryTemplateDialog}
            onSaveQuickProfile={saveQuickProfile}
            onSave={saveListing}
            onSaveAndPublish={saveAndPublishListing}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={isTemplateDialogOpen}
        onOpenChange={(open) => {
          if (!isSavingTemplate) setIsTemplateDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guardar plantilla de categoría</DialogTitle>
            <DialogDescription>
              Escribe un nombre corto para reconocer estas características en
              futuras publicaciones.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveCategoryTemplate();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="category-template-name">Nombre</Label>
              <Input
                id="category-template-name"
                value={templateName}
                maxLength={80}
                autoFocus
                placeholder="Ej. Térmicos kawaii"
                onChange={(event) => setTemplateName(event.target.value)}
              />
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={isSavingTemplate}
                onClick={() => setIsTemplateDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSavingTemplate}>
                {isSavingTemplate ? "Guardando..." : "Guardar plantilla"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(videoLibraryTarget)}
        onOpenChange={(open) => {
          if (open || !videoLibraryTarget) return;

          void loadListingQuality(videoLibraryTarget.listing);
          setVideoLibraryTarget(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              Clip para {videoLibraryTarget?.listing.product.name}
            </DialogTitle>
            <DialogDescription>
              Guarda y revisa el clip aquí. La publicación final se hace en el
              cargador oficial de Mercado Libre; P de Papel nunca la ejecuta
              automáticamente.
            </DialogDescription>
          </DialogHeader>
          {videoLibraryTarget ? (
            <ProductVideoLibrary
              storeId={storeId}
              productId={videoLibraryTarget.listing.product.id}
              marketplaceUploadUrl={videoLibraryTarget.uploadUrl}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      {confirmationDialog}
    </SectionCard>
  );
}
