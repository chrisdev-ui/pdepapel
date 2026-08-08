"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MercadoLibreLogo } from "@/components/mercadolibre-logo";
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
import { Download, Loader2, Pencil, Plus, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type ProductOption = {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
};

type Listing = {
  id: string;
  categoryId: string | null;
  marketplacePrice: number | null;
  stockSafetyBuffer: number;
  syncStock: boolean;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "CLOSED" | "ERROR" | "UNLINKED";
  externalPermalink: string | null;
  externalItemId: string | null;
  lastError: string | null;
  metadata: { attributes?: MarketplaceAttribute[] } | null;
  product: {
    id: string;
    name: string;
    sku: string;
    stock: number;
  };
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
  attributes: string;
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
  linkedProduct: ProductOption | null;
  suggestedProduct: ProductOption | null;
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
  attributes: "",
};

const listingLabels: Record<Listing["status"], string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activa",
  PAUSED: "Pausada",
  CLOSED: "Cerrada",
  ERROR: "Requiere revisión",
  UNLINKED: "Sin vínculo",
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
  products,
  canPublish,
}: {
  storeId: string;
  products: ProductOption[];
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
  const [isSaving, setIsSaving] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(
    null,
  );
  const [importSelections, setImportSelections] = useState<
    Record<string, ImportSelection>
  >({});
  const [isLoadingImportPreview, setIsLoadingImportPreview] = useState(false);
  const [isImportingListings, setIsImportingListings] = useState(false);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === form.productId) ?? null,
    [form.productId, products],
  );

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
      attributes: attributesToText(listing.metadata?.attributes),
    });
    setSuggestions([]);
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
        const createdListing = (await response.json()) as Listing;
        if (attributes.length > 0) {
          const attributesResponse = await fetch(
            `/api/${storeId}/marketplaces/mercadolibre/listings/${createdListing.id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ attributes }),
            },
          );
          if (!attributesResponse.ok) {
            throw new Error(await getErrorMessage(attributesResponse));
          }
        }
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
            <MercadoLibreLogo className="h-5" />
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
            <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
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
                          variant={
                            listing.status === "ACTIVE"
                              ? "success"
                              : "secondary"
                          }
                        >
                          {listing.status}
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
                        <select
                          id={`mercadolibre-import-${listing.key}`}
                          value={selection.productId}
                          disabled={listing.status === "ERROR"}
                          onChange={(event) =>
                            updateImportSelection(listing.key, {
                              productId: event.target.value,
                              selected: Boolean(event.target.value),
                            })
                          }
                          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="">Selecciona manualmente</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name} · {product.sku} · Stock{" "}
                              {product.stock}
                            </option>
                          ))}
                        </select>
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
            {listings.map((listing) => (
              <div
                key={listing.id}
                className="flex flex-col gap-4 rounded-md border p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{listing.product.name}</p>
                    <Badge
                      variant={
                        listing.status === "ACTIVE" ? "success" : "secondary"
                      }
                    >
                      {listingLabels[listing.status]}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    SKU {listing.product.sku} · Stock local{" "}
                    {listing.product.stock} · Seguridad{" "}
                    {listing.stockSafetyBuffer}
                  </p>
                  <p className="text-sm">
                    Mercado Libre:{" "}
                    {currencyFormatter.format(listing.marketplacePrice ?? 0)} ·{" "}
                    {listing.categoryId ?? "Sin categoría"}
                  </p>
                  {listing.lastError ? (
                    <p className="text-sm text-destructive">
                      {listing.lastError}
                    </p>
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
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MercadoLibreLogo className="h-5" />
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
              <select
                id="mercadolibre-product"
                value={form.productId}
                disabled={Boolean(editingListing)}
                onChange={(event) => {
                  const product = products.find(
                    (item) => item.id === event.target.value,
                  );
                  setForm((current) => ({
                    ...current,
                    productId: event.target.value,
                    marketplacePrice: current.marketplacePrice
                      ? current.marketplacePrice
                      : String(product?.price ?? ""),
                  }));
                }}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Selecciona un producto</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} · {product.sku} · Stock {product.stock}
                  </option>
                ))}
              </select>
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
                onChange={(event) =>
                  updateForm("categoryId", event.target.value)
                }
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
