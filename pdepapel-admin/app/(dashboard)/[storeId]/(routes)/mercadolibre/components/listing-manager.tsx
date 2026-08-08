"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getListingStatusMeta } from "@/lib/mercadolibre/listing-status";
import {
  BarChart3,
  CircleDollarSign,
  Download,
  ImageIcon,
  Loader2,
  PackageOpen,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

type ProductReference = {
  id: string;
  name: string;
  sku: string;
  stock: number;
  acqPrice: number | null;
  images: { url: string; isMain?: boolean }[];
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
  };
}

type Listing = {
  id: string;
  categoryId: string | null;
  marketplacePrice: number | null;
  stockSafetyBuffer: number;
  syncStock: boolean;
  syncPrice: boolean;
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

type PriceEstimate = {
  saleFeeAmount: number;
  percentageFee: number | null;
  fixedFee: number | null;
  listingTypeId: string | null;
  listingTypeName: string | null;
};

type ListingQuality = {
  score: number | null;
  level: string | null;
  levelWording: string | null;
  pendingRules: {
    title: string;
    label: string | null;
    mode: "OPPORTUNITY" | "WARNING" | null;
  }[];
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
  syncPrice: true,
  imageUrls: [],
  attributes: "",
};

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

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

function getAttributeValues(value: string) {
  try {
    return new Map(
      parseAttributes(value).map((attribute) => [
        attribute.id,
        attribute.value_name,
      ]),
    );
  } catch {
    return new Map<string, string>();
  }
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

  const loadListings = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/listings`,
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setListings((await response.json()) as Listing[]);
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

  const updateForm = (key: keyof ListingForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const openNewListing = () => {
    setEditingListing(null);
    setForm(emptyForm);
    setSuggestions([]);
    setCategoryAttributes([]);
    setPriceEstimate(null);
    setSelectedProduct(null);
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
      setImportSelections(
        Object.fromEntries(
          preview.listings.map((listing) => [
            listing.key,
            {
              productId: listing.suggestedProduct?.id ?? "",
              selected: Boolean(
                !listing.existingListingId &&
                listing.suggestedProduct &&
                listing.status !== "ERROR",
              ),
            },
          ]),
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

  const loadCategoryAttributes = async () => {
    if (!form.categoryId) {
      setError("Selecciona una categoría antes de cargar sus características");
      return;
    }

    setIsLoadingCategoryAttributes(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/categories/${encodeURIComponent(form.categoryId)}/attributes`,
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setCategoryAttributes((await response.json()) as CategoryAttribute[]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible cargar las características de la categoría",
      );
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

  const saveListing = async () => {
    if (!form.productId || !form.marketplacePrice || !form.categoryId) {
      setError(
        "Producto, precio de Mercado Libre y categoría son obligatorios",
      );
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const attributes = parseAttributes(form.attributes);
      const payload = {
        marketplacePrice: form.marketplacePrice,
        categoryId: form.categoryId,
        stockSafetyBuffer: form.stockSafetyBuffer,
        syncStock: true,
        syncPrice: form.syncPrice,
        imageUrls: form.imageUrls,
        attributes,
      };
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
      }

      setIsDialogOpen(false);
      await loadListings();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible guardar la publicación",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const publishListing = async (listing: Listing) => {
    if (!canPublish) {
      setError(
        "Activa primero el procesamiento seguro para evitar desajustes de inventario",
      );
      return;
    }
    if (
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
            Nuevo borrador
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
                    <input
                      type="checkbox"
                      aria-label={`Importar ${listing.title}`}
                      checked={selection.selected}
                      disabled={cannotImport || !selection.productId}
                      onChange={(event) =>
                        updateImportSelection(listing.key, {
                          selected: event.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-input"
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
                        <label
                          className="text-xs font-medium"
                          htmlFor={`mercadolibre-import-${listing.key}`}
                        >
                          Producto local
                        </label>
                        <AsyncProductSelect
                          id={`mercadolibre-import-${listing.key}`}
                          value={selection.productId}
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
            {listings.map((listing) => {
              const quality = qualityByListingId[listing.id];
              return (
                <div
                  key={listing.id}
                  className="flex flex-col gap-4 rounded-md border p-4 lg:flex-row lg:items-center lg:justify-between"
                >
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
                      {currencyFormatter.format(listing.marketplacePrice ?? 0)}{" "}
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
                        {quality.pendingRules.length ? (
                          <ul className="space-y-1 text-xs text-muted-foreground">
                            {quality.pendingRules.slice(0, 3).map((rule) => (
                              <li key={`${rule.mode}-${rule.title}`}>
                                • {rule.title}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-success">
                            No hay acciones pendientes reportadas.
                          </p>
                        )}
                      </div>
                    ) : null}
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
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="mercadolibre-product">
                Producto de P de Papel
              </Label>
              <AsyncProductSelect
                value={form.productId}
                id="mercadolibre-product"
                modal
                disabled={Boolean(editingListing)}
                ariaLabel="Producto local para la publicación"
                placeholder="Buscar por nombre o SKU..."
                onChange={(productId, product) => {
                  const selected = toSelectedProduct(product);
                  setSelectedProduct(selected);
                  setForm((current) => ({
                    ...current,
                    productId,
                    marketplacePrice: current.marketplacePrice
                      ? current.marketplacePrice
                      : String(selected?.price ?? ""),
                    imageUrls: selected?.images.map((image) => image.url) ?? [],
                  }));
                }}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="mercadolibre-price">
                  Precio de Mercado Libre
                </Label>
                <Input
                  id="mercadolibre-price"
                  inputMode="numeric"
                  value={form.marketplacePrice}
                  onChange={(event) =>
                    updateForm("marketplacePrice", event.target.value)
                  }
                  placeholder="Ej. 18500"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mercadolibre-buffer">
                  Unidades de seguridad
                </Label>
                <Input
                  id="mercadolibre-buffer"
                  inputMode="numeric"
                  value={form.stockSafetyBuffer}
                  onChange={(event) =>
                    updateForm("stockSafetyBuffer", event.target.value)
                  }
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/20 p-3 text-sm">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={form.syncPrice}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      syncPrice: event.target.checked,
                    }))
                  }
                  className="mt-0.5 h-4 w-4 rounded border-input"
                />
                <span>
                  <span className="block font-medium">
                    Sincronizar este precio con Mercado Libre
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Solo actualiza el precio de esta publicación; nunca el de la
                    tienda.
                  </span>
                </span>
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void loadPriceEstimate()}
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
                      Number(form.marketplacePrice) -
                        priceEstimate.saleFeeAmount,
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
                <p className="text-xs text-muted-foreground sm:col-span-3">
                  Mercado Libre calcula esta comisión según la categoría y el
                  tipo de publicación. El envío, impuestos y descuentos
                  posteriores pueden cambiar el neto real.
                </p>
              </div>
            ) : null}
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="mercadolibre-category">
                  Categoría de Mercado Libre
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void searchCategories()}
                  disabled={isSearchingCategories || !selectedProduct}
                >
                  {isSearchingCategories ? "Buscando…" : "Sugerir categoría"}
                </Button>
              </div>
              <Input
                id="mercadolibre-category"
                value={form.categoryId}
                onChange={(event) => {
                  updateForm("categoryId", event.target.value);
                  setCategoryAttributes([]);
                  setPriceEstimate(null);
                }}
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
                      onClick={() => {
                        updateForm("categoryId", suggestion.categoryId);
                        setSuggestions([]);
                        setCategoryAttributes([]);
                        setPriceEstimate(null);
                      }}
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
                  <p className="text-sm font-medium">
                    Fotos para Mercado Libre
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Elige qué fotos del producto se enviarán. La primera
                    seleccionada será la portada.
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
                          className={`relative aspect-square overflow-hidden rounded-md border-2 text-left transition ${selected ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"}`}
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
                      <select
                        id="mercadolibre-cover-image"
                        value={form.imageUrls[0]}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            imageUrls: [
                              event.target.value,
                              ...current.imageUrls.filter(
                                (url) => url !== event.target.value,
                              ),
                            ],
                          }))
                        }
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {form.imageUrls.map((url, index) => (
                          <option key={url} value={url}>
                            Foto {index + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-destructive">
                  Este producto no tiene imágenes. Agrégalas desde Productos
                  antes de publicar.
                </p>
              )}
            </div>
            <div className="grid gap-3 rounded-md border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    Ficha técnica de la categoría
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Carga los campos que Mercado Libre exige para reducir
                    rechazos y mejorar visibilidad.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void loadCategoryAttributes()}
                  disabled={isLoadingCategoryAttributes || !form.categoryId}
                >
                  {isLoadingCategoryAttributes ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Cargar campos
                </Button>
              </div>
              {categoryAttributes.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {categoryAttributes
                    .filter((attribute) => attribute.required)
                    .slice(0, 20)
                    .map((attribute) => {
                      const currentValue =
                        getAttributeValues(form.attributes).get(attribute.id) ??
                        "";
                      return (
                        <div key={attribute.id} className="grid gap-1">
                          <Label
                            htmlFor={`mercadolibre-attribute-${attribute.id}`}
                          >
                            {attribute.name}{" "}
                            <span className="text-destructive">*</span>
                          </Label>
                          {attribute.values.length > 0 ? (
                            <select
                              id={`mercadolibre-attribute-${attribute.id}`}
                              value={currentValue}
                              onChange={(event) =>
                                updateForm(
                                  "attributes",
                                  updateAttributeValue(
                                    form.attributes,
                                    attribute.id,
                                    event.target.value,
                                  ),
                                )
                              }
                              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                            >
                              <option value="">Selecciona una opción</option>
                              {attribute.values.map((option) => (
                                <option key={option.id} value={option.name}>
                                  {option.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <Input
                              id={`mercadolibre-attribute-${attribute.id}`}
                              value={currentValue}
                              onChange={(event) =>
                                updateForm(
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
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mercadolibre-attributes">
                Características adicionales (opcional)
              </Label>
              <Textarea
                id="mercadolibre-attributes"
                value={form.attributes}
                onChange={(event) =>
                  updateForm("attributes", event.target.value)
                }
                placeholder={
                  "Una por línea, por ejemplo:\nCOLOR=Rosado\nMATERIAL=Plástico"
                }
                className="min-h-28 font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Se agregan automáticamente marca, MPN y GTIN cuando el producto
                los tiene. Completa aquí los requisitos específicos que Mercado
                Libre indique.
              </p>
            </div>
            <div className="flex gap-3 rounded-md border border-amber-300 bg-amber-50/50 p-3 text-sm dark:bg-amber-950/10">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div className="space-y-1">
                <p className="font-medium">Videos de la publicación</p>
                <p className="text-xs text-muted-foreground">
                  Crea el guion y la voz con la herramienta gratuita de Mercado
                  Libre, pero graba el producto real en vertical. No uses
                  animaciones creadas desde fotos: Mercado Libre puede
                  rechazarlas. Después de publicar, carga el clip desde Mercado
                  Libre en la sección Videos.
                </p>
              </div>
            </div>
            <Button
              type="button"
              onClick={() => void saveListing()}
              disabled={isSaving}
            >
              {isSaving ? "Guardando…" : "Guardar borrador"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
