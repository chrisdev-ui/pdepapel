"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AsyncProductSelect,
  type AsyncProductOption,
} from "@/components/ui/async-product-select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getListingStatusMeta } from "@/lib/mercadolibre/listing-status";
import { recommendMercadoLibreListingPrice } from "@/lib/mercadolibre/listing-price-recommendation";
import {
  BarChart3,
  Download,
  ImageIcon,
  Loader2,
  PackageOpen,
  Pencil,
  Plus,
  Sparkles,
  UploadCloud,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ListingPublicationWizard } from "./listing-publication-wizard";
import { ProductVideoLibrary } from "./product-video-library";

type ProductReference = {
  id: string;
  name: string;
  sku: string;
  stock: number;
  acqPrice: number | null;
  images: { url: string; isMain?: boolean }[];
  category?: { id: string; name: string } | null;
};

type SelectedProduct = ProductReference & { price: number };

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
    images: product.images ?? [],
    price: Number(product.price ?? 0),
    category: product.category?.id
      ? { id: product.category.id, name: product.category.name }
      : null,
  };
}

type Listing = {
  id: string;
  categoryId: string | null;
  marketplacePrice: number | null;
  stockSafetyBuffer: number;
  syncStock: boolean;
  syncPrice: boolean;
  minimumMarginAmount: number | null;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "CLOSED" | "ERROR" | "UNLINKED";
  externalPermalink: string | null;
  externalItemId: string | null;
  lastError: string | null;
  metadata: {
    attributes?: MarketplaceAttribute[];
    media?: { imageUrls?: string[] };
  } | null;
  product: ProductReference;
};

type PublishableListing = Pick<Listing, "id" | "marketplacePrice"> & {
  product: Pick<ProductReference, "name">;
};

type MarketplaceAttribute = {
  id: string;
  value_id?: string | null;
  value_name?: string | null;
};

type CategorySuggestion = {
  categoryId: string;
  categoryName: string;
  domainId: string | null;
  domainName: string | null;
};

type ListingForm = {
  productId: string;
  marketplacePrice: string;
  categoryId: string;
  stockSafetyBuffer: string;
  minimumMarginAmount: string;
  syncPrice: boolean;
  imageUrls: string[];
  attributes: string;
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
  listingTypeId: string | null;
  listingTypeName: string | null;
};

type ListingQualityRule = {
  key: string | null;
  link: string | null;
  title: string;
  label: string | null;
  mode: "OPPORTUNITY" | "WARNING" | null;
  isVideoRecommendation: boolean;
};

type ListingQuality = {
  score: number | null;
  level: string | null;
  levelWording: string | null;
  pendingRules: ListingQualityRule[];
  videoRecommendation:
    | (ListingQualityRule & {
        preparedVideoCount: number;
        snoozedUntil: string | null;
      })
    | null;
};

type ContentReview = {
  title: string;
  titleLength: number;
  descriptionPreview: string;
  checks: { label: string; ready: boolean; detail: string }[];
};

type ImportCandidate = {
  key: string;
  externalItemId: string;
  externalVariationId: string | null;
  title: string;
  status: Listing["status"];
  marketplacePrice: number | null;
  sellerSku: string | null;
  availableQuantity: number | null;
  existingListingId: string | null;
  linkedProduct: ProductReference | null;
  suggestedProduct: ProductReference | null;
  issue: string | null;
};

type ImportPreview = {
  listings: ImportCandidate[];
  summary: {
    total: number;
    alreadyLinked: number;
    readyToImport: number;
    needsReview: number;
  };
};

type ImportSelection = {
  productId: string;
  selected: boolean;
};

const emptyForm: ListingForm = {
  productId: "",
  marketplacePrice: "",
  categoryId: "",
  stockSafetyBuffer: "1",
  minimumMarginAmount: "",
  syncPrice: true,
  imageUrls: [],
  attributes: "",
};

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const bulkActionLabels = {
  publish: "Publicar borradores",
  sync_stock: "Sincronizar stock",
  sync_price: "Sincronizar precios",
  sync_content: "Sincronizar contenido",
  pause: "Pausar publicaciones",
  activate: "Activar publicaciones",
} as const;

type BulkAction = keyof typeof bulkActionLabels;

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

function getErrorMessage(response: Response) {
  return response
    .json()
    .then(
      (body: { error?: string }) =>
        body.error ?? "No fue posible completar la acción",
    )
    .catch(() => "No fue posible completar la acción");
}

export function MercadoLibreListingManager({
  storeId,
  canPublish,
}: {
  storeId: string;
  canPublish: boolean;
}) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [form, setForm] = useState<ListingForm>(emptyForm);
  const [suggestions, setSuggestions] = useState<CategorySuggestion[]>([]);
  const [isSearchingCategories, setIsSearchingCategories] = useState(false);
  const [categoryAttributes, setCategoryAttributes] = useState<
    CategoryAttribute[]
  >([]);
  const [isLoadingCategoryAttributes, setIsLoadingCategoryAttributes] =
    useState(false);
  const [priceEstimate, setPriceEstimate] = useState<PriceEstimate | null>(
    null,
  );
  const [isLoadingPriceEstimate, setIsLoadingPriceEstimate] = useState(false);
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
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(
    null,
  );
  const [importSelections, setImportSelections] = useState<
    Record<string, ImportSelection>
  >({});
  const [isLoadingImportPreview, setIsLoadingImportPreview] = useState(false);
  const [isImportingListings, setIsImportingListings] = useState(false);
  const [selectedListingIds, setSelectedListingIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkAction>("sync_stock");
  const [isRunningBulkAction, setIsRunningBulkAction] = useState(false);
  const [categoryTemplates, setCategoryTemplates] = useState<
    CategoryTemplate[]
  >([]);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [publicationProfiles, setPublicationProfiles] = useState<
    PublicationProfile[]
  >([]);
  const [quickProfile, setQuickProfile] = useState<PublicationProfile | null>(
    null,
  );
  const [isSavingQuickProfile, setIsSavingQuickProfile] = useState(false);
  const [isSuggestingPrice, setIsSuggestingPrice] = useState(false);

  const loadListings = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/listings`,
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setListings((await response.json()) as Listing[]);
      setSelectedListingIds([]);
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
  };

  const updateCategory = (categoryId: string) => {
    updateForm("categoryId", categoryId);
    setSuggestions([]);
    setCategoryAttributes([]);
    setPriceEstimate(null);
    setQuickProfile(null);
  };

  const openNewListing = () => {
    setEditingListing(null);
    setForm(emptyForm);
    setSuggestions([]);
    setCategoryAttributes([]);
    setPriceEstimate(null);
    setSelectedProduct(null);
    setQuickProfile(null);
    setError(null);
    setIsDialogOpen(true);
  };

  const openEditListing = (listing: Listing) => {
    setEditingListing(listing);
    setForm({
      productId: listing.product.id,
      marketplacePrice: String(listing.marketplacePrice ?? ""),
      categoryId: listing.categoryId ?? "",
      stockSafetyBuffer: String(listing.stockSafetyBuffer),
      minimumMarginAmount: String(listing.minimumMarginAmount ?? ""),
      syncPrice: listing.syncPrice,
      imageUrls: listing.metadata?.media?.imageUrls?.length
        ? listing.metadata.media.imageUrls
        : listing.product.images.map((image) => image.url),
      attributes: attributesToText(listing.metadata?.attributes),
    });
    setSelectedProduct({
      ...listing.product,
      price: listing.marketplacePrice ?? 0,
    });
    setSuggestions([]);
    setCategoryAttributes([]);
    setPriceEstimate(null);
    setQuickProfile(null);
    setError(null);
    setIsDialogOpen(true);
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
            const canAutoSelect = Boolean(
              !listing.existingListingId &&
                suggestedProductId &&
                !listing.issue &&
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
        ...update,
      },
    }));
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
      !window.confirm(
        `¿Vincular ${selections.length} publicación${selections.length === 1 ? "" : "es"} y sincronizar su stock con P de Papel?`,
      )
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
          Boolean(selection.productId)
        );
      }).length
    : 0;

  const searchCategories = async () => {
    const query = selectedProduct?.name ?? "";
    if (query.length < 3) {
      setError("Selecciona un producto para buscar una categoría");
      return;
    }

    setIsSearchingCategories(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/categories?query=${encodeURIComponent(query)}`,
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setSuggestions((await response.json()) as CategorySuggestion[]);
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

  const loadCategoryAttributes = async (): Promise<boolean> => {
    if (!form.categoryId) {
      setError("Selecciona una categoría antes de cargar sus características");
      return false;
    }

    setIsLoadingCategoryAttributes(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/categories/${encodeURIComponent(form.categoryId)}/attributes`,
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setCategoryAttributes((await response.json()) as CategoryAttribute[]);
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

  const loadPriceEstimate = async () => {
    if (!form.marketplacePrice || !form.categoryId) {
      setError("Define precio y categoría para calcular los costos");
      return;
    }

    setIsLoadingPriceEstimate(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        price: form.marketplacePrice,
        categoryId: form.categoryId,
        listingType: "gold_special",
      });
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/listings/pricing?${query.toString()}`,
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setPriceEstimate((await response.json()) as PriceEstimate);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible calcular los costos de Mercado Libre",
      );
    } finally {
      setIsLoadingPriceEstimate(false);
    }
  };

  const getPriceEstimate = async (
    price: number,
    categoryId: string,
  ): Promise<PriceEstimate> => {
    const query = new URLSearchParams({
      price: String(price),
      categoryId,
      listingType: "gold_special",
    });
    const response = await fetch(
      `/api/${storeId}/marketplaces/mercadolibre/listings/pricing?${query.toString()}`,
    );
    if (!response.ok) throw new Error(await getErrorMessage(response));
    return (await response.json()) as PriceEstimate;
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
    setCategoryAttributes([]);
    setPriceEstimate(null);
    setError(null);
    setForm((current) => ({
      ...current,
      productId,
      marketplacePrice: initialMarketplacePrice,
      categoryId: profile?.categoryId ?? "",
      stockSafetyBuffer: String(profile?.stockSafetyBuffer ?? 1),
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
      !window.confirm(
        "Se reemplazarán en Mercado Libre las imágenes elegidas, la descripción y las características configuradas. ¿Continuar?",
      )
    ) {
      return;
    }

    setSyncingContentId(listing.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/listings/${listing.id}/sync-content`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
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

    setIsSaving(true);
    setError(null);
    try {
      const attributes = parseAttributes(form.attributes);
      const payload = {
        marketplacePrice: form.marketplacePrice,
        categoryId: form.categoryId,
        stockSafetyBuffer: form.stockSafetyBuffer,
        minimumMarginAmount: form.minimumMarginAmount,
        syncStock: true,
        syncPrice: form.syncPrice,
        imageUrls: form.imageUrls,
        attributes,
      };
      let savedListingId = editingListing?.id;
      if (editingListing) {
        const response = await fetch(
          `/api/${storeId}/marketplaces/mercadolibre/listings/${editingListing.id}`,
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
      !window.confirm(
        `¿Publicar “${listing.product.name}” en Mercado Libre por ${currencyFormatter.format(listing.marketplacePrice ?? 0)}?`,
      )
    ) {
      return;
    }

    setPublishingId(listing.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/listings/${listing.id}/publish`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
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

  const saveAndPublishListing = async () => {
    if (!canPublish) {
      setError(
        "Activa primero el procesamiento seguro para evitar desajustes de inventario",
      );
      return;
    }

    const productName =
      selectedProduct?.name ?? editingListing?.product.name ?? "este producto";
    if (
      !window.confirm(
        `¿Guardar y publicar “${productName}” en Mercado Libre por ${currencyFormatter.format(Number(form.marketplacePrice) || 0)}?`,
      )
    ) {
      return;
    }

    const savedListing = await saveListing();
    if (!savedListing) return;
    await publishListing(savedListing, true);
  };

  const toggleListingSelection = (listingId: string) => {
    setSelectedListingIds((current) =>
      current.includes(listingId)
        ? current.filter((id) => id !== listingId)
        : [...current, listingId],
    );
  };

  const runBulkAction = async () => {
    if (selectedListingIds.length === 0) {
      setError("Selecciona al menos una publicación para continuar");
      return;
    }
    const actionLabel = bulkActionLabels[bulkAction].toLowerCase();
    if (
      !window.confirm(
        `¿Confirmas ${actionLabel} para ${selectedListingIds.length} publicación${selectedListingIds.length === 1 ? "" : "es"}? Las acciones se procesarán de forma segura en segundo plano.`,
      )
    ) {
      return;
    }

    setIsRunningBulkAction(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/listings/bulk`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: bulkAction,
            listingIds: selectedListingIds,
          }),
        },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      await loadListings();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible programar la acción masiva",
      );
    } finally {
      setIsRunningBulkAction(false);
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

  const saveCategoryTemplate = async () => {
    if (!form.categoryId) {
      setError("Selecciona una categoría antes de guardar una plantilla");
      return;
    }
    let attributes: MarketplaceAttribute[];
    try {
      attributes = parseAttributes(form.attributes);
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
    const name = window.prompt("Nombre para la plantilla de esta categoría:");
    if (!name?.trim()) return;

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

    let attributes: MarketplaceAttribute[];
    try {
      attributes = parseAttributes(form.attributes);
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

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <PackageOpen className="h-5 w-5 text-muted-foreground" />
            Publicaciones
          </CardTitle>
          <CardDescription>
            Define un precio exclusivo de Mercado Libre. Nunca se copiarán
            descuentos ni precios de la tienda.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadImportPreview()}
            disabled={!canPublish || isLoadingImportPreview}
          >
            {isLoadingImportPreview ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Importar existentes
          </Button>
          <Button type="button" onClick={openNewListing} disabled={!canPublish}>
            <Plus className="mr-2 h-4 w-4" />
            Preparar publicación
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canPublish ? (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            Conecta Mercado Libre y activa el procesamiento seguro antes de
            crear o publicar productos.
          </p>
        ) : null}
        {error ? (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
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
                return (
                  <div
                    key={listing.key}
                    className="grid gap-3 rounded-md border bg-background p-3 lg:grid-cols-[auto_minmax(0,1fr)_minmax(14rem,0.8fr)] lg:items-center"
                  >
                    <Checkbox
                      aria-label={`Importar ${listing.title}`}
                      checked={selection.selected}
                      disabled={cannotImport || !selection.productId}
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
                        <p className="text-xs text-amber-700">
                          {listing.issue}
                        </p>
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
        {isLoading ? (
          <p className="text-sm text-muted-foreground">
            Cargando publicaciones…
          </p>
        ) : listings.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Aún no hay publicaciones preparadas. Crea un borrador y revísalo
            antes de enviarlo.
          </p>
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  id="mercadolibre-select-all-listings"
                  checked={
                    listings.length > 0 &&
                    selectedListingIds.length === listings.length
                  }
                  onCheckedChange={(checked) =>
                    setSelectedListingIds(
                      checked === true
                        ? listings.map((listing) => listing.id)
                        : [],
                    )
                  }
                />
                <Label htmlFor="mercadolibre-select-all-listings">
                  Seleccionar todas ({selectedListingIds.length})
                </Label>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select
                  value={bulkAction}
                  onValueChange={(value) => setBulkAction(value as BulkAction)}
                >
                  <SelectTrigger aria-label="Acción masiva para publicaciones">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.entries(bulkActionLabels).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ),
                      )}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  onClick={() => void runBulkAction()}
                  disabled={
                    isRunningBulkAction || selectedListingIds.length === 0
                  }
                >
                  {isRunningBulkAction ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Aplicar de forma segura
                </Button>
              </div>
            </div>
            {listings.map((listing) => {
              const quality = qualityByListingId[listing.id];
              const contentReview = contentReviewByListingId[listing.id];
              const nonVideoQualityRules = quality?.pendingRules.filter(
                (rule) => !rule.isVideoRecommendation,
              );
              const videoRecommendation = quality?.videoRecommendation;
              const isVideoReminderSnoozed = Boolean(
                videoRecommendation?.snoozedUntil,
              );
              return (
                <div
                  key={listing.id}
                  className="flex flex-col gap-4 rounded-md border p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="flex min-w-0 gap-3">
                    <Checkbox
                      aria-label={`Seleccionar ${listing.product.name}`}
                      checked={selectedListingIds.includes(listing.id)}
                      onCheckedChange={() => toggleListingSelection(listing.id)}
                      className="mt-1 shrink-0"
                    />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{listing.product.name}</p>
                        <Badge
                          variant={getListingStatusMeta(listing.status).variant}
                        >
                          {getListingStatusMeta(listing.status).label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        SKU {listing.product.sku} · Stock local{" "}
                        {listing.product.stock} · Seguridad{" "}
                        {listing.stockSafetyBuffer}
                      </p>
                      <p className="text-sm">
                        Mercado Libre:{" "}
                        {currencyFormatter.format(
                          listing.marketplacePrice ?? 0,
                        )}{" "}
                        · {listing.categoryId ?? "Sin categoría"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {listing.externalItemId
                          ? `Precio publicado: ${listing.syncPrice ? "se actualiza desde este panel" : "se mantiene manualmente en Mercado Libre"}`
                          : "El precio se enviará al publicar este borrador."}
                      </p>
                      {listing.lastError ? (
                        <p className="text-sm text-destructive">
                          {listing.lastError}
                        </p>
                      ) : null}
                      {listing.minimumMarginAmount !== null ? (
                        <p className="text-xs text-muted-foreground">
                          Utilidad objetivo configurada:{" "}
                          {currencyFormatter.format(
                            listing.minimumMarginAmount,
                          )}
                        </p>
                      ) : null}
                      {quality ? (
                        <div className="mt-3 space-y-2 rounded-md bg-muted/50 p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">
                              Calidad de Mercado Libre
                            </span>
                            {quality.score !== null ? (
                              <Badge variant="secondary">
                                {Math.round(quality.score)} / 100
                              </Badge>
                            ) : null}
                            {(quality.levelWording ?? quality.level) ? (
                              <Badge variant="outline">
                                {quality.levelWording ?? quality.level}
                              </Badge>
                            ) : null}
                          </div>
                          {nonVideoQualityRules?.length ? (
                            <ul className="space-y-1 text-xs text-muted-foreground">
                              {nonVideoQualityRules.slice(0, 3).map((rule) => (
                                <li key={`${rule.mode}-${rule.title}`}>
                                  • {rule.title}
                                </li>
                              ))}
                            </ul>
                          ) : !videoRecommendation ? (
                            <p className="text-xs text-success">
                              No hay acciones pendientes reportadas.
                            </p>
                          ) : null}
                          {videoRecommendation ? (
                            <div className="flex flex-col gap-2 rounded-md border border-primary/20 bg-primary/[0.03] p-3 text-xs">
                              <div className="flex flex-wrap items-center gap-2">
                                <Video className="h-4 w-4 text-primary" />
                                <p className="font-medium">Clip recomendado</p>
                                <Badge variant="outline">
                                  {videoRecommendation.preparedVideoCount} listo
                                  {videoRecommendation.preparedVideoCount === 1
                                    ? ""
                                    : "s"}
                                </Badge>
                              </div>
                              <p className="text-muted-foreground">
                                {videoRecommendation.title}. P de Papel prepara
                                el video y la carga final se confirma en Mercado
                                Libre.
                              </p>
                              {isVideoReminderSnoozed ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-muted-foreground">
                                    El recordatorio está pospuesto.
                                  </p>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      void updateVideoReminder(listing, "show")
                                    }
                                    disabled={
                                      updatingVideoReminderId === listing.id
                                    }
                                  >
                                    Mostrar ahora
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      setVideoLibraryTarget({
                                        listing,
                                        uploadUrl: videoRecommendation.link,
                                      })
                                    }
                                  >
                                    <Video className="mr-2 h-4 w-4" />
                                    {videoRecommendation.preparedVideoCount > 0
                                      ? "Revisar clip"
                                      : "Preparar clip"}
                                  </Button>
                                  {videoRecommendation.link ? (
                                    <Button
                                      asChild
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                    >
                                      <a
                                        href={videoRecommendation.link}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        Subir en Mercado Libre
                                      </a>
                                    </Button>
                                  ) : null}
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      void updateVideoReminder(
                                        listing,
                                        "snooze",
                                      )
                                    }
                                    disabled={
                                      updatingVideoReminderId === listing.id
                                    }
                                  >
                                    Recordar en 30 días
                                  </Button>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {contentReview ? (
                        <div className="mt-3 space-y-2 rounded-md border border-primary/20 bg-primary/[0.03] p-3 text-sm">
                          <p className="flex items-center gap-2 font-medium">
                            <Sparkles className="h-4 w-4 text-primary" />
                            Revisión de contenido
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Título: {contentReview.titleLength} caracteres ·{" "}
                            {contentReview.descriptionPreview ||
                              "Sin descripción visible"}
                          </p>
                          <ul className="space-y-1 text-xs">
                            {contentReview.checks.map((check) => (
                              <li
                                key={check.label}
                                className={
                                  check.ready
                                    ? "text-success"
                                    : "text-amber-700"
                                }
                              >
                                {check.ready ? "✓" : "•"} {check.label}:{" "}
                                {check.detail}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {listing.externalPermalink ? (
                      <Button asChild type="button" variant="outline">
                        <a
                          href={listing.externalPermalink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver publicación
                        </a>
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => openEditListing(listing)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void reviewListingContent(listing)}
                      disabled={reviewingContentId === listing.id}
                    >
                      {reviewingContentId === listing.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-2 h-4 w-4" />
                      )}
                      Revisar contenido
                    </Button>
                    {listing.externalItemId ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void syncListingContent(listing)}
                          disabled={syncingContentId === listing.id}
                        >
                          {syncingContentId === listing.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <ImageIcon className="mr-2 h-4 w-4" />
                          )}
                          Sincronizar contenido
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void loadListingQuality(listing)}
                          disabled={loadingQualityId === listing.id}
                        >
                          {loadingQualityId === listing.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <BarChart3 className="mr-2 h-4 w-4" />
                          )}
                          Revisar calidad
                        </Button>
                      </>
                    ) : null}
                    {!listing.externalItemId ? (
                      <Button
                        type="button"
                        onClick={() => void publishListing(listing)}
                        disabled={publishingId === listing.id}
                      >
                        {publishingId === listing.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <UploadCloud className="mr-2 h-4 w-4" />
                        )}
                        Publicar
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingListing ? (
                <Pencil className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Plus className="h-5 w-5 text-muted-foreground" />
              )}
              {editingListing ? "Editar borrador" : "Preparar publicación"}
            </DialogTitle>
            <DialogDescription>
              El precio corresponde solo a Mercado Libre. Incluye su comisión
              antes de guardar.
            </DialogDescription>
          </DialogHeader>
          <ListingPublicationWizard
            key={editingListing?.id ?? "new-listing"}
            editing={Boolean(editingListing)}
            canPublishDirectly={canPublish && !editingListing?.externalItemId}
            form={form}
            setForm={setForm}
            selectedProduct={selectedProduct}
            suggestions={suggestions}
            categoryAttributes={categoryAttributes}
            categoryTemplates={categoryTemplates.filter(
              (template) => template.categoryId === form.categoryId,
            )}
            quickProfile={quickProfile}
            priceEstimate={priceEstimate}
            isSearchingCategories={isSearchingCategories}
            isLoadingCategoryAttributes={isLoadingCategoryAttributes}
            isLoadingPriceEstimate={isLoadingPriceEstimate}
            isSuggestingPrice={isSuggestingPrice}
            isSaving={isSaving}
            isSavingTemplate={isSavingTemplate}
            isSavingQuickProfile={isSavingQuickProfile}
            onError={setError}
            onFormChange={updateForm}
            onProductChange={updateSelectedProduct}
            onSearchCategories={searchCategories}
            onCategoryChange={updateCategory}
            onLoadCategoryAttributes={loadCategoryAttributes}
            onLoadPriceEstimate={loadPriceEstimate}
            onApplyCategoryTemplate={(templateId) => {
              const template = categoryTemplates.find(
                (item) => item.id === templateId,
              );
              if (template) applyCategoryTemplate(template);
            }}
            onSaveCategoryTemplate={saveCategoryTemplate}
            onSaveQuickProfile={saveQuickProfile}
            onSave={saveListing}
            onSaveAndPublish={saveAndPublishListing}
          />
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
              <Video className="h-5 w-5 text-muted-foreground" />
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
    </Card>
  );
}
