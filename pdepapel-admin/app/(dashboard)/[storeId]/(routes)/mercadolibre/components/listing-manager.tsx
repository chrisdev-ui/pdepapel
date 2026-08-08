"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Loader2, Pencil, Plus, UploadCloud } from "lucide-react";
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
          <CardTitle>Publicaciones</CardTitle>
          <CardDescription>
            Define un precio exclusivo de Mercado Libre. Nunca se copiarán
            descuentos ni precios de la tienda.
          </CardDescription>
        </div>
        <Button type="button" onClick={openNewListing} disabled={!canPublish}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo borrador
        </Button>
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
            <DialogTitle>
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
