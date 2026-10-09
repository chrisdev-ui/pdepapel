"use client";

import { Layers, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import {
  buildVariantAttributes,
  describeGroupVariantState,
  getGroupVariantEconomics,
  type GroupVariantState,
} from "@/lib/mercadolibre/group-publication";
import type { GroupPublicationPlan } from "@/lib/mercadolibre/group-publication-server";
import { MERCADOLIBRE_SHIPPING_ESTIMATE } from "@/lib/mercadolibre/listing-margin";
import type { ListingWizardCategoryAttribute } from "@/lib/mercadolibre/listing-wizard";

type PricingTargets = { targetMarginPercent: number; minNetPerUnit: number } | null;

type DraftResult = {
  created: { listingId: string; productId: string }[];
  skipped: { productId: string; reason: string }[];
};

type ShippingComparison = {
  mandatoryFreeShipping?: boolean;
  buyerPays: { sellerCost: number } | null;
  sellerOffersFree: { sellerCost: number };
};

const currency = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const money = (value: number) => currency.format(Math.round(value));

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? "No fue posible completar la acción";
  } catch {
    return "No fue posible completar la acción";
  }
}

const STATE_BADGE: Record<GroupVariantState["kind"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ready: { label: "Lista", variant: "default" },
  listed: { label: "Ya publicada", variant: "secondary" },
  draft: { label: "Ya tiene borrador", variant: "outline" },
  remote: { label: "Ya existe en Mercado Libre", variant: "destructive" },
  unchecked: { label: "Sin revisar", variant: "destructive" },
  archived: { label: "Archivada", variant: "outline" },
  "no-stock": { label: "Sin stock", variant: "outline" },
  "no-photos": { label: "Sin fotos", variant: "outline" },
};

/**
 * «Publicar grupo»: el borrador base ya tiene familia, categoría, ficha y
 * envío; aquí se extiende a las demás variantes con su propio precio. Crear
 * los borradores y publicarlos son dos pasos: nada sale a Mercado Libre
 * hasta «Publicar».
 */
export function GroupPublicationDialog({
  storeId,
  listingId,
  pricingTargets,
  onClose,
  onDraftsCreated,
  onPublish,
}: {
  storeId: string;
  listingId: string | null;
  pricingTargets: PricingTargets;
  onClose: () => void;
  onDraftsCreated: () => Promise<void> | void;
  onPublish: (listingIds: string[]) => Promise<void> | void;
}) {
  const [plan, setPlan] = useState<GroupPublicationPlan | null>(null);
  const [categoryAttributes, setCategoryAttributes] = useState<ListingWizardCategoryAttribute[]>([]);
  const [feeRate, setFeeRate] = useState<number | null>(null);
  const [shipping, setShipping] = useState<{ cost: number; quoted: boolean } | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DraftResult | null>(null);

  const load = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/listings/group?listingId=${encodeURIComponent(id)}`,
      );
      if (!response.ok) throw new Error(await readError(response));
      const next = (await response.json()) as GroupPublicationPlan;
      setPlan(next);
      const basePrice = next.master.marketplacePrice ? String(next.master.marketplacePrice) : "";
      setPrices(Object.fromEntries(next.variants.map((variant) => [variant.productId, basePrice])));
      setSelected(
        Object.fromEntries(next.variants.map((variant) => [variant.productId, variant.state.kind === "ready"])),
      );

      const { categoryId, listingType, marketplacePrice, saleConditions } = next.master;
      if (!categoryId) throw new Error("El borrador base todavía no tiene categoría.");
      const [attributesResponse, feeResponse] = await Promise.all([
        fetch(`/api/${storeId}/marketplaces/mercadolibre/categories/${encodeURIComponent(categoryId)}/attributes`),
        marketplacePrice && listingType
          ? fetch(
              `/api/${storeId}/marketplaces/mercadolibre/listings/pricing?${new URLSearchParams({
                price: String(marketplacePrice),
                categoryId,
                listingType,
              }).toString()}`,
            )
          : Promise.resolve(null),
      ]);
      if (!attributesResponse.ok) throw new Error(await readError(attributesResponse));
      setCategoryAttributes((await attributesResponse.json()) as ListingWizardCategoryAttribute[]);
      if (feeResponse?.ok && marketplacePrice) {
        const fee = (await feeResponse.json()) as { saleFeeAmount: number };
        setFeeRate(fee.saleFeeAmount / marketplacePrice);
      }

      const dimensions = saleConditions?.packageDimensions;
      if (dimensions && marketplacePrice && listingType) {
        const shippingResponse = await fetch(
          `/api/${storeId}/marketplaces/mercadolibre/listings/shipping-cost?${new URLSearchParams({
            price: String(marketplacePrice),
            listingType,
            heightCm: String(dimensions.heightCm),
            widthCm: String(dimensions.widthCm),
            lengthCm: String(dimensions.lengthCm),
            weightGrams: String(dimensions.weightGrams),
          }).toString()}`,
        );
        if (shippingResponse.ok) {
          const comparison = (await shippingResponse.json()) as ShippingComparison;
          const sellerPaysAll = saleConditions?.freeShipping || comparison.mandatoryFreeShipping;
          setShipping({
            cost: sellerPaysAll ? comparison.sellerOffersFree.sellerCost : (comparison.buyerPays?.sellerCost ?? 0),
            quoted: true,
          });
        } else {
          setShipping({ cost: MERCADOLIBRE_SHIPPING_ESTIMATE, quoted: false });
        }
      } else {
        setShipping({ cost: MERCADOLIBRE_SHIPPING_ESTIMATE, quoted: false });
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No fue posible revisar el grupo");
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (listingId) void load(listingId);
    else {
      setPlan(null);
      setFeeRate(null);
      setShipping(null);
      setResult(null);
      setError(null);
    }
  }, [listingId, load]);

  const rows = useMemo(() => {
    if (!plan) return [];
    return plan.variants.map((variant) => {
      const price = Number(prices[variant.productId]);
      const hasPrice = Number.isFinite(price) && price > 0;
      const economics =
        hasPrice && feeRate !== null && shipping
          ? getGroupVariantEconomics({
              price,
              product: variant,
              feeRate,
              shippingCost: shipping.cost,
              pricingTargets,
            })
          : null;
      return { variant, price, hasPrice, economics };
    });
  }, [plan, prices, feeRate, shipping, pricingTargets]);

  const chosen = rows.filter((row) => row.variant.state.kind === "ready" && selected[row.variant.productId]);
  const canCreate = chosen.length > 0 && chosen.every((row) => row.hasPrice) && !isCreating;

  const createDrafts = async () => {
    if (!plan || !canCreate) return;
    setIsCreating(true);
    setError(null);
    try {
      const response = await fetch(`/api/${storeId}/marketplaces/mercadolibre/listings/group`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: plan.master.listingId,
          variants: chosen.map(({ variant, price }) => ({
            productId: variant.productId,
            marketplacePrice: price,
            attributes: buildVariantAttributes(plan.master.attributes, categoryAttributes, variant),
          })),
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setResult((await response.json()) as DraftResult);
      await onDraftsCreated();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No fue posible crear los borradores");
    } finally {
      setIsCreating(false);
    }
  };

  const nameOf = (productId: string) => plan?.variants.find((variant) => variant.productId === productId)?.name ?? productId;
  const publishable = [
    ...(result?.created.map((row) => row.listingId) ?? []),
    ...(plan?.variants.some((variant) => variant.isMaster && variant.state.kind === "draft") ? [plan.master.listingId] : []),
  ];

  return (
    <Dialog open={Boolean(listingId)} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            Publicar grupo{plan ? `: ${plan.group.name}` : ""}
          </DialogTitle>
          <DialogDescription>
            {plan?.master.familyName
              ? `Cada variante se publica como su propio ítem con el nombre de familia «${plan.master.familyName}»; Mercado Libre las agrupa por ese nombre.`
              : "Cada variante se publica como su propio ítem y Mercado Libre las agrupa por el nombre de familia del borrador base."}{" "}
            Categoría, ficha común y envío salen del borrador base.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Stock en Mercado Libre</p>
          <p className="text-muted-foreground">
            Cada variante tiene su propio stock allá. Dos ítems con el mismo SKU son gemelos: comparten
            stock y SKU (lo que se venda en uno baja en el otro), aunque pausar o activar uno no siempre
            cambia el otro. Una variante que ya tiene ítem no se vuelve a crear.
          </p>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {isLoading ? <p className="text-sm text-muted-foreground">Revisando el grupo en Mercado Libre…</p> : null}
        {plan?.truncated ? (
          <p className="text-sm text-muted-foreground">El grupo tiene más de 20 variantes: se muestran las primeras 20.</p>
        ) : null}
        {shipping && !shipping.quoted ? (
          <p className="text-sm text-muted-foreground">
            Envío estimado en {money(shipping.cost)}: el borrador base no tiene medidas del paquete.
          </p>
        ) : null}

        {result ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              {result.created.length} borrador{result.created.length === 1 ? "" : "es"} creado
              {result.created.length === 1 ? "" : "s"}. Todavía no se publicó nada.
            </p>
            {result.skipped.length ? (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {result.skipped.map((row) => (
                  <li key={row.productId}>
                    <span className="font-medium text-foreground">{nameOf(row.productId)}:</span> {row.reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map(({ variant, hasPrice, economics }) => {
              const badge = STATE_BADGE[variant.state.kind];
              const ready = variant.state.kind === "ready";
              const inputId = `group-price-${variant.productId}`;
              return (
                <li key={variant.productId} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <Checkbox
                      checked={ready && Boolean(selected[variant.productId])}
                      disabled={!ready}
                      onCheckedChange={(checked) =>
                        setSelected((current) => ({ ...current, [variant.productId]: checked === true }))
                      }
                      aria-label={`Incluir ${variant.name}`}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="break-words font-medium">{variant.name}</span>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        {variant.isMaster ? (
                          <Badge variant="outline">{variant.state.kind === "listed" ? "Publicación base" : "Borrador base"}</Badge>
                        ) : null}
                      </div>
                      <p className="break-all text-xs text-muted-foreground">
                        {variant.sku} · {variant.stock} en inventario
                      </p>
                      <p className="text-sm text-muted-foreground">{describeGroupVariantState(variant.state)}</p>
                    </div>
                    {ready ? (
                      <div className="w-full space-y-1 sm:w-44">
                        <Label htmlFor={inputId}>Precio en Mercado Libre</Label>
                        <CurrencyInput
                          id={inputId}
                          inputMode="numeric"
                          value={prices[variant.productId] ? Number(prices[variant.productId]) : undefined}
                          onChange={(value) =>
                            setPrices((current) => ({
                              ...current,
                              [variant.productId]: value === undefined ? "" : String(value),
                            }))
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                  {ready && hasPrice && economics ? (
                    <div className="mt-2 space-y-1 text-sm sm:pl-7">
                      {economics.breakdown.net === null ? (
                        <p className="text-muted-foreground">Sin costo registrado: no se puede calcular la ganancia.</p>
                      ) : (
                        <p>
                          Te quedan {money(economics.breakdown.net)} por unidad (
                          {((economics.breakdown.marginRate ?? 0) * 100).toFixed(1)} %) después de comisión{" "}
                          {money(economics.breakdown.fee)}, envío {money(economics.breakdown.shipping)} y retenciones{" "}
                          {money(economics.breakdown.withholding)}.
                        </p>
                      )}
                      {economics.warning ? (
                        <p className="text-destructive">
                          {economics.warning}
                          {economics.suggestedPrice ? ` Precio que cumple: ${money(economics.suggestedPrice)}.` : ""}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          {result ? (
            <Button
              type="button"
              disabled={publishable.length === 0}
              onClick={() => void onPublish(publishable)}
            >
              <UploadCloud className="mr-2 h-4 w-4" aria-hidden="true" />
              Publicar {publishable.length} en Mercado Libre
            </Button>
          ) : (
            <Button type="button" disabled={!canCreate} isLoading={isCreating} loadingText="Creando…" onClick={() => void createDrafts()}>
              Crear {chosen.length} borrador{chosen.length === 1 ? "" : "es"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
