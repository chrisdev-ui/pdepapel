"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { DiscountType, type Offer, type OfferCategory, type OfferProduct, type OfferProductGroup } from "@prisma/client";
import axios from "axios";
import { AlertTriangle, Ban, CalendarDays, Copy, Search, Trash, X } from "lucide-react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AlertModal } from "@/components/modals/alert-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { DiscountTypeToggle } from "@/components/ui/discount-type-toggle";
import { FormPageHeader, FormStickyFooter } from "@/components/ui/form-page-chrome";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { PercentageInput } from "@/components/ui/percentage-input";
import { ProductPlaceholder } from "@/components/ui/product-placeholder";
import { SectionCard } from "@/components/ui/section-card";
import { Switch } from "@/components/ui/switch";
import { TintBadge } from "@/components/ui/tint-badge";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { useDebounce } from "@/hooks/use-debounce";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { getErrorMessage } from "@/lib/api-errors";
import { getDatePresets } from "@/lib/date-presets";
import { priceAfter, type ScopeProductRow, type ScopeSummary } from "@/lib/offer-scope";
import { refineDiscountAmount } from "@/lib/coupons";
import { OFFER_LABEL_MAX, OFFER_NAME_MAX } from "@/lib/offers";
import { formatDiscount, getPromotionStatus, PROMOTION_STATUS } from "@/lib/promotion-status";
import { localDateToPromotionDay, promotionDayToLocalDate } from "@/lib/promotion-window";
import { cn, currencyFormatter } from "@/lib/utils";

import { OFFER_DELETE_COPY, OFFER_END_COPY } from "../../components/offer-copy";
import type { OfferPickerData } from "../server/get-offer-picker";

const formSchema = z
  .object({
    name: z.string().trim().min(1, "Escribe el nombre interno").max(OFFER_NAME_MAX, `Hasta ${OFFER_NAME_MAX} caracteres`),
    label: z.string().trim().max(OFFER_LABEL_MAX, `Hasta ${OFFER_LABEL_MAX} caracteres`),
    type: z.nativeEnum(DiscountType, { errorMap: () => ({ message: "Elige el tipo de descuento" }) }),
    amount: z.preprocess((value) => (value === null || value === "" ? undefined : value), z.coerce.number({ required_error: "Escribe el descuento", invalid_type_error: "Escribe el descuento" }).positive("El descuento debe ser mayor a 0")),
    dateRange: z.object({
      from: z.date({ required_error: "Elige la fecha de inicio", invalid_type_error: "Elige la fecha de inicio" }),
      to: z.date({ required_error: "Elige la fecha de finalización", invalid_type_error: "Elige la fecha de finalización" }),
    }),
    isActive: z.boolean(),
    productIds: z.array(z.string()),
    categoryIds: z.array(z.string()),
    productGroupIds: z.array(z.string()),
  })
  .superRefine((value, ctx) => {
    refineDiscountAmount(value, ctx);
    if (value.productIds.length + value.categoryIds.length + value.productGroupIds.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["productIds"], message: "Elige al menos un producto, subcategoría o grupo" });
    }
  });

type OfferFormValues = z.infer<typeof formSchema>;
type ScopeTab = "productIds" | "categoryIds" | "productGroupIds";

/** Datos con los que arranca una oferta nueva creada con «Duplicar». */
export interface OfferSeed {
  name: string;
  label: string | null;
  type: DiscountType;
  amount: number;
  productIds: string[];
  categoryIds: string[];
  productGroupIds: string[];
}

interface OfferFormProps {
  initialData: (Offer & { products: OfferProduct[]; categories: OfferCategory[]; productGroups: OfferProductGroup[] }) | null;
  picker: OfferPickerData;
  seed?: OfferSeed | null;
}

const SCOPE_TABS: { id: ScopeTab; label: string }[] = [
  { id: "productIds", label: "Productos" },
  { id: "categoryIds", label: "Subcategorías" },
  { id: "productGroupIds", label: "Grupos" },
];
const LONG_DATE = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", timeZone: "America/Bogota" });
const isValidDate = (value: unknown): value is Date => value instanceof Date && !Number.isNaN(value.getTime());
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export const OfferForm: React.FC<OfferFormProps> = ({ initialData, picker, seed = null }) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const storeId = String(params.storeId);
  const listHref = `/${storeId}/promociones`;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ending, setEnding] = useState(false);
  const [tab, setTab] = useState<ScopeTab>("productIds");
  const [query, setQuery] = useState("");
  const [includeOutOfStock, setIncludeOutOfStock] = useState(false);
  const [results, setResults] = useState<{ products: ScopeProductRow[]; hasMore: boolean } | null>(null);
  const [searching, setSearching] = useState(false);
  const [known, setKnown] = useState<Record<string, ScopeProductRow>>(() => Object.fromEntries(picker.selectedProducts.map((product) => [product.id, product])));
  const [summary, setSummary] = useState<ScopeSummary | null>(null);
  const status = initialData ? getPromotionStatus(initialData) : null;

  const defaultValues = useMemo<OfferFormValues>(() => {
    if (initialData) {
      return {
        name: initialData.name,
        label: initialData.label ?? "",
        type: initialData.type,
        amount: initialData.amount,
        dateRange: { from: promotionDayToLocalDate(initialData.startDate), to: promotionDayToLocalDate(initialData.endDate) },
        isActive: initialData.isActive,
        productIds: initialData.products.map((row) => row.productId),
        categoryIds: initialData.categories.map((row) => row.categoryId),
        productGroupIds: initialData.productGroups.map((row) => row.productGroupId),
      };
    }
    return {
      name: seed?.name ?? "",
      label: seed?.label ?? "",
      type: seed?.type ?? DiscountType.PERCENTAGE,
      amount: (seed?.amount ?? undefined) as unknown as number,
      dateRange: { from: undefined as unknown as Date, to: undefined as unknown as Date },
      isActive: true,
      productIds: seed?.productIds ?? [],
      categoryIds: seed?.categoryIds ?? [],
      productGroupIds: seed?.productGroupIds ?? [],
    };
  }, [initialData, seed]);

  const form = useForm<OfferFormValues>({ resolver: zodResolver(formSchema), defaultValues });
  const { clearStorage } = useFormPersist({ form, key: `offer-form-${storeId}-${initialData?.id ?? "new"}`, enabled: !initialData && !seed });
  useFormValidationToast({ form });
  const { confirmLeave, confirmationDialog: leaveDialog } = useUnsavedChangesGuard(form, { enabled: !loading });
  const { isDirty } = form.formState;

  const values = form.watch();
  const { type, amount, label, dateRange, productIds, categoryIds, productGroupIds } = values;
  const amountNumber = amount === undefined || amount === null || Number.isNaN(Number(amount)) ? undefined : Number(amount);
  const isPercentage = type === DiscountType.PERCENTAGE;
  const debouncedQuery = useDebounce(query, 300);
  const scopeKey = JSON.stringify({ productIds, categoryIds, productGroupIds, type, amount: amountNumber });
  const debouncedScopeKey = useDebounce(scopeKey, 400);

  // Búsqueda incremental: nunca el catálogo entero.
  useEffect(() => {
    let cancelled = false;
    setSearching(true);
    axios
      .get<{ products: ScopeProductRow[]; hasMore: boolean }>(`/api/${storeId}/offers/scope-search`, { params: { q: debouncedQuery, agotados: includeOutOfStock ? "1" : "0", excluir: initialData?.id ?? "" } })
      .then((response) => {
        if (cancelled) return;
        setResults(response.data);
        setKnown((current) => ({ ...current, ...Object.fromEntries(response.data.products.map((product) => [product.id, product])) }));
      })
      .catch((error) => {
        if (!cancelled) toast({ description: getErrorMessage(error), variant: "destructive" });
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, includeOutOfStock, initialData?.id, storeId, toast]);

  // Resumen del alcance calculado en el servidor.
  const summaryRequest = useRef(0);
  useEffect(() => {
    const scope = JSON.parse(debouncedScopeKey) as { productIds: string[]; categoryIds: string[]; productGroupIds: string[]; type?: DiscountType; amount?: number };
    const request = ++summaryRequest.current;
    axios
      .post<ScopeSummary>(`/api/${storeId}/offers/scope-summary`, { ...scope, excludeOfferId: initialData?.id ?? null })
      .then((response) => {
        if (request === summaryRequest.current) setSummary(response.data);
      })
      .catch(() => undefined);
  }, [debouncedScopeKey, initialData?.id, storeId]);

  const setScope = (field: ScopeTab, next: string[]) => form.setValue(field, next, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
  const toggleProduct = (product: ScopeProductRow, checked: boolean) => {
    setKnown((current) => ({ ...current, [product.id]: product }));
    setScope("productIds", checked ? Array.from(new Set([...productIds, product.id])) : productIds.filter((id) => id !== product.id));
  };
  const onTypeChange = (next: DiscountType) => {
    if (next === type) return;
    form.setValue("type", next, { shouldDirty: true, shouldValidate: true });
    form.setValue("amount", null as unknown as number, { shouldDirty: true });
    form.clearErrors("amount");
  };

  const selectedProducts = productIds.map((id) => known[id]).filter((product): product is ScopeProductRow => Boolean(product));
  const missingSelected = productIds.length - selectedProducts.length;
  const wouldBeFree = (price: number) => type === DiscountType.FIXED && amountNumber !== undefined && amountNumber > 0 && price <= amountNumber;

  const onSubmit = async ({ dateRange: range, ...data }: OfferFormValues) => {
    const payload = { ...data, label: data.label || null, startDate: localDateToPromotionDay(range.from), endDate: localDateToPromotionDay(range.to) };
    try {
      setLoading(true);
      if (initialData) await axios.patch(`/api/${storeId}/offers/${initialData.id}`, payload);
      else await axios.post(`/api/${storeId}/offers`, payload);
      clearStorage();
      router.push(listHref);
      router.refresh();
      toast({ description: initialData ? "Oferta actualizada" : "Oferta creada", variant: "success" });
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const onEnd = async () => {
    if (!initialData) return;
    const confirmed = await requestConfirmation({ title: OFFER_END_COPY.title(initialData.name), description: OFFER_END_COPY.description, confirmLabel: OFFER_END_COPY.confirmLabel });
    if (!confirmed) return;
    try {
      setEnding(true);
      await axios.put(`/api/${storeId}/offers/${initialData.id}`);
      form.setValue("isActive", false);
      router.refresh();
      toast({ description: `Oferta ${initialData.name} terminada`, variant: "success" });
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setEnding(false);
    }
  };

  const onDelete = async () => {
    if (!initialData) return;
    try {
      setLoading(true);
      await axios.delete(`/api/${storeId}/offers/${initialData.id}`);
      router.push(listHref);
      router.refresh();
      toast({ description: "Oferta eliminada", variant: "success" });
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
      setDeleteOpen(false);
    }
  };

  const goBack = async () => {
    if (await confirmLeave()) router.push(listHref);
  };
  const duplicate = async () => {
    if (!initialData) return;
    if (await confirmLeave()) router.push(`/${storeId}/ofertas/nuevo?desde=${initialData.id}`);
  };

  const scopeError = form.formState.errors.productIds?.message;
  const canEnd = Boolean(initialData?.isActive) && (status === "vigente" || status === "programada");
  const summaryLines = summary
    ? [
        { tone: summary.affected > 0 ? "ok" : "todo", text: summary.affected > 0 ? `${plural(summary.affected, "producto", "productos")} con precio rebajado` : "Falta elegir a qué aplica" },
        ...(summary.affected > 0 && summary.sellable < summary.affected ? [{ tone: "warn", text: `${summary.affected - summary.sellable} de ellos ${summary.affected - summary.sellable === 1 ? "está agotado" : "están agotados"}` }] : []),
        ...(summary.overlaps.count > 0 ? [{ tone: "warn", text: `${summary.overlaps.count} ya ${summary.overlaps.count === 1 ? "está" : "están"} en otra oferta (${summary.overlaps.names.join(", ")}): gana el precio más bajo` }] : []),
        ...(summary.free.count > 0 ? [{ tone: "bad", text: `${summary.free.count} ${summary.free.count === 1 ? "quedaría" : "quedarían"} en $ 0 (${summary.free.names.join(", ")}): baja el monto o usa %` }] : []),
      ]
    : [];

  return (
    <>
      {confirmationDialog}
      {leaveDialog}
      <AlertModal isOpen={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={onDelete} loading={loading} title={OFFER_DELETE_COPY.title(initialData?.name ?? "")} description={OFFER_DELETE_COPY.description} />
      <FormPageHeader
        title={initialData ? "Editar oferta" : seed ? "Nueva oferta (copia)" : "Nueva oferta"}
        badge={status && <TintBadge label={PROMOTION_STATUS[status].label} tone={PROMOTION_STATUS[status].tone} />}
        summary={
          initialData
            ? `${initialData.name} · ${formatDiscount(initialData.type, initialData.amount, currencyFormatter)} · hasta el ${LONG_DATE.format(new Date(initialData.endDate))}`
            : "Rebaja el precio de productos, subcategorías o grupos durante unos días. La clienta ve el precio tachado; el nombre interno nunca sale."
        }
        backLabel="Volver a promociones"
        onBack={() => void goBack()}
        actions={
          initialData ? (
            <>
              <Button type="button" variant="outline" onClick={() => void duplicate()} disabled={loading}>
                <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                Duplicar
              </Button>
              {canEnd && (
                <Button type="button" variant="outline" onClick={() => void onEnd()} isLoading={ending} loadingText="Terminando…">
                  <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
                  Terminar ahora
                </Button>
              )}
            </>
          ) : undefined
        }
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Form {...form}>
          <form id="offer-form" onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex min-w-0 flex-col gap-5">
            <SectionCard id="oferta-datos" step={1} title="Datos de la oferta" description="El nombre es para ti. La etiqueta es lo que ve la clienta junto al precio rebajado; sin etiqueta solo ve el precio.">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Nombre interno</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Ej. Regreso a clases · agendas" maxLength={OFFER_NAME_MAX} disabled={loading} />
                      </FormControl>
                      <FormDescription>Ponle algo que la distinga en la lista.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Etiqueta pública</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Ej. ÚLTIMAS UNIDADES" maxLength={OFFER_LABEL_MAX} disabled={loading} />
                      </FormControl>
                      <FormDescription className="flex flex-wrap items-center gap-1.5">
                        En la tienda: {label?.trim() ? <TintBadge label={label.trim()} tone="pink" /> : <span>solo el precio tachado</span>}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[200px_minmax(0,1fr)_minmax(0,1.4fr)]">
                <FormField
                  control={form.control}
                  name="type"
                  render={() => (
                    <FormItem>
                      <FormLabel isRequired>Tipo</FormLabel>
                      <FormControl>
                        <DiscountTypeToggle value={type} onChange={onTypeChange} disabled={loading} />
                      </FormControl>
                      <FormDescription>Al cambiar, el monto se vacía.</FormDescription>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Descuento</FormLabel>
                      <FormControl>
                        {isPercentage ? (
                          <PercentageInput disabled={loading} step="1" min={1} placeholder="10" value={field.value} onChange={field.onChange} />
                        ) : (
                          <CurrencyInput placeholder="$ 5.000" disabled={loading} value={field.value} onChange={field.onChange} />
                        )}
                      </FormControl>
                      <FormDescription>{isPercentage ? "Entre 1 y 100, sin decimales." : "Se resta del precio; nunca deja un producto en $ 0."}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dateRange"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2 xl:col-span-1">
                      <FormLabel isRequired>Vigencia</FormLabel>
                      <FormControl>
                        <DateRangePicker customDates={getDatePresets} name={field.name} control={form.control} />
                      </FormControl>
                      <FormDescription>
                        {isValidDate(dateRange?.to)
                          ? `Días completos, hora de Colombia: termina el ${LONG_DATE.format(dateRange.to)} a las 23:59. La tienda se actualiza sola al empezar y al terminar.`
                          : "Abre el calendario: tiene atajos como «Este fin de semana» y «Este mes»."}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-3 rounded-lg border bg-muted/30 p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Oferta activa</FormLabel>
                      <FormDescription>Apagada a mano se queda apagada: el recálculo diario no la enciende.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} disabled={loading} aria-label="Oferta activa" />
                    </FormControl>
                  </FormItem>
                )}
              />
            </SectionCard>

            <SectionCard
              id="oferta-alcance"
              step={2}
              title="A qué aplica"
              description="Busca y marca. Si un producto ya está en otra oferta, gana la que deje el precio más bajo; aquí te lo avisamos antes de guardar."
            >
              <div className="flex flex-wrap gap-1.5">
                <TintBadge label={plural(productIds.length, "producto", "productos")} tone={productIds.length ? "sky" : "slate"} />
                <TintBadge label={plural(categoryIds.length, "subcategoría", "subcategorías")} tone={categoryIds.length ? "sky" : "slate"} />
                <TintBadge label={plural(productGroupIds.length, "grupo", "grupos")} tone={productGroupIds.length ? "sky" : "slate"} />
              </div>
              <div role="tablist" aria-label="Tipo de destino" className="flex max-w-full gap-1 overflow-x-auto self-start rounded-full border bg-white p-1">
                {SCOPE_TABS.map((item) => {
                  const count = values[item.id].length;
                  return (
                    <button key={item.id} type="button" role="tab" aria-selected={item.id === tab} onClick={() => setTab(item.id)} className={cn("flex h-8 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold transition-colors", item.id === tab ? "bg-primary text-primary-foreground" : "text-primary hover:bg-accent")}>
                      {item.label}
                      {count > 0 ? ` · ${count}` : ""}
                    </button>
                  );
                })}
              </div>

              {tab === "productIds" && (
                <>
                  <div className="flex flex-col gap-2 rounded-lg bg-muted/40 px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">En esta oferta · {productIds.length}</span>
                      {productIds.length > 0 && (
                        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setScope("productIds", [])} disabled={loading}>
                          Quitar todos
                        </Button>
                      )}
                    </div>
                    {productIds.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Todavía no hay productos sueltos. Busca abajo y marca los que entran.</p>
                    ) : (
                      <ul className="flex flex-wrap gap-1.5" aria-label="Productos en la oferta">
                        {selectedProducts.map((product) => (
                          <li key={product.id} className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-accent pl-2.5 pr-1 text-[13px]">
                            <span className="truncate">{product.name}</span>
                            <span className="shrink-0 text-muted-foreground">· {currencyFormatter(priceAfter(type, amountNumber, product.price))}</span>
                            <button type="button" aria-label={`Quitar ${product.name}`} disabled={loading} onClick={() => toggleProduct(product, false)} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20">
                              <X className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </li>
                        ))}
                        {missingSelected > 0 && <li className="inline-flex h-7 items-center rounded-full bg-muted px-2.5 text-[13px] text-muted-foreground">{plural(missingSelected, "producto sin ficha", "productos sin ficha")}</li>}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative sm:max-w-md sm:flex-1">
                      <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Busca por nombre, SKU o subcategoría…" aria-label="Buscar productos" className="pl-9" />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-primary">
                      <Checkbox checked={includeOutOfStock} onCheckedChange={(checked) => setIncludeOutOfStock(checked === true)} aria-label="Incluir agotados" />
                      Incluir agotados
                    </label>
                    <span className="text-xs text-muted-foreground sm:ml-auto" aria-live="polite">
                      {searching ? "Buscando…" : results ? (query.trim() ? `${results.products.length}${results.hasMore ? "+" : ""} resultados para «${query.trim()}»` : "Los más vendidos primero. Escribe para buscar.") : ""}
                    </span>
                  </div>
                  {results && results.products.length === 0 && !searching ? (
                    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nada coincide con la búsqueda.</p>
                  ) : (
                    <ul className="grid gap-2 md:grid-cols-2" aria-label="Resultados">
                      {(results?.products ?? []).map((product) => {
                        const checked = productIds.includes(product.id);
                        const free = wouldBeFree(product.price);
                        const after = priceAfter(type, amountNumber, product.price);
                        const overlap = product.overlaps[0];
                        return (
                          <li key={product.id} className="min-w-0">
                            <label className={cn("flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors", checked ? "border-primary bg-muted/40" : "hover:bg-accent/40", (product.stock === 0 || (free && !checked)) && "opacity-70", free && !checked && "cursor-not-allowed")}>
                              <Checkbox checked={checked} onCheckedChange={(value) => toggleProduct(product, value === true)} aria-label={product.name} disabled={loading || (free && !checked)} />
                              {product.imageUrl ? (
                                <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-muted">
                                  <Image src={product.imageUrl} alt="" fill sizes="36px" className="object-cover" />
                                </span>
                              ) : (
                                <ProductPlaceholder size="sm" className="shrink-0" />
                              )}
                              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <span className="truncate font-medium text-primary">{product.name}</span>
                                <span className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground">
                                  <span>{product.categoryName}</span>
                                  {overlap && <TintBadge label={`Ya en «${overlap.name}» · ${currencyFormatter(overlap.after)}${overlap.after < after ? " · seguirá ganando" : ""}`} tone="cream" className="h-[18px] max-w-full truncate text-[11px]" />}
                                  {free && <TintBadge label="Quedaría en $ 0" tone="pink" className="h-[18px] text-[11px]" />}
                                </span>
                              </span>
                              <span className="shrink-0 text-right text-xs text-muted-foreground">
                                {after < product.price ? (
                                  <>
                                    <span className="line-through">{currencyFormatter(product.price)}</span>
                                    <span className="ml-1 font-semibold text-primary">{currencyFormatter(after)}</span>
                                  </>
                                ) : (
                                  currencyFormatter(product.price)
                                )}
                                {product.stock === 0 && <span className="block">Agotado</span>}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {results?.hasMore && <p className="self-center text-xs text-muted-foreground">Se muestran 20 resultados a la vez. Afina la búsqueda para encontrar el resto.</p>}
                </>
              )}

              {tab === "categoryIds" && (
                <FormField
                  control={form.control}
                  name="categoryIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subcategorías en la oferta</FormLabel>
                      <FormControl>
                        <MultiSelect
                          options={picker.categories.map((category) => ({ value: category.id, label: `${category.name} · ${category.typeName} · ${plural(category.productCount, "producto", "productos")}` }))}
                          defaultValue={field.value}
                          onValueChange={(next) => setScope("categoryIds", next)}
                          placeholder="Escribe para buscar una subcategoría…"
                          disabled={loading}
                          hideSelectAll
                          maxCount={6}
                        />
                      </FormControl>
                      <FormDescription>Toda la subcategoría entra, incluidos los productos que se agreguen después.</FormDescription>
                    </FormItem>
                  )}
                />
              )}

              {tab === "productGroupIds" && (
                <FormField
                  control={form.control}
                  name="productGroupIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Grupos en la oferta</FormLabel>
                      <FormControl>
                        <MultiSelect
                          options={picker.productGroups.map((group) => ({ value: group.id, label: `${group.name} · ${plural(group.productCount, "variante", "variantes")}` }))}
                          defaultValue={field.value}
                          onValueChange={(next) => setScope("productGroupIds", next)}
                          placeholder="Escribe para buscar un grupo…"
                          disabled={loading}
                          hideSelectAll
                          maxCount={6}
                        />
                      </FormControl>
                      <FormDescription>Un grupo son las variantes de un mismo producto (colores, diseños). Entran todas.</FormDescription>
                    </FormItem>
                  )}
                />
              )}

              {scopeError && (
                <p className="text-sm font-medium text-destructive" role="alert">
                  {scopeError}
                </p>
              )}
            </SectionCard>

            <FormStickyFooter
              note={
                <span className="flex flex-wrap items-center gap-2">
                  {isDirty && <TintBadge label="Cambios sin guardar" tone="cream" />}
                  <span>{initialData ? "Al guardar, la tienda cambia los precios al instante." : "La oferta empieza sola el primer día de la vigencia."}</span>
                </span>
              }
            >
              <Button type="button" variant="outline" onClick={() => void goBack()} disabled={loading}>
                Cancelar
              </Button>
              <Button type="submit" form="offer-form" isLoading={loading} loadingText={initialData ? "Guardando…" : "Creando…"}>
                {initialData ? "Guardar cambios" : "Crear oferta"}
              </Button>
            </FormStickyFooter>
          </form>
        </Form>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-4 lg:self-start">
          <SectionCard id="oferta-resumen" title="Lo que verá la clienta" description="Se calcula con el alcance actual, sin cargar el catálogo.">
            <div className="flex flex-col gap-1 rounded-lg bg-muted/40 p-3.5">
              <span className="text-3xl font-bold leading-none tabular-nums text-primary">{summary?.affected ?? "—"}</span>
              <span className="text-xs text-muted-foreground">
                productos con precio rebajado{summary ? ` · ${summary.byProducts} sueltos · ${summary.byCategories} por subcategoría · ${summary.byGroups} por grupo` : ""}
              </span>
            </div>
            {summaryLines.length > 0 && (
              <ul className="flex flex-col gap-1.5" aria-label="Avisos del alcance">
                {summaryLines.map((line) => (
                  <li key={line.text} className={cn("flex items-start gap-2 text-[13px]", line.tone === "todo" ? "text-muted-foreground" : "text-primary")}>
                    {line.tone === "ok" ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" /> : line.tone === "todo" ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300" aria-hidden="true" /> : <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", line.tone === "bad" ? "text-destructive" : "text-amber-500")} aria-hidden="true" />}
                    <span>{line.text}</span>
                  </li>
                ))}
              </ul>
            )}
            {summary?.sample && (
              <div className="flex flex-col gap-1.5 border-t pt-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ejemplo en la tienda</span>
                <span className="text-[13px] font-semibold">{summary.sample.name}</span>
                <span className="flex flex-wrap items-center gap-1.5 text-[13px]">
                  <span className="text-muted-foreground line-through">{currencyFormatter(summary.sample.price)}</span>
                  <strong>{currencyFormatter(priceAfter(type, amountNumber, summary.sample.price))}</strong>
                  {label?.trim() && <TintBadge label={label.trim()} tone="pink" className="h-[18px] text-[11px]" />}
                </span>
              </div>
            )}
          </SectionCard>
          {initialData && (
            <>
              <SectionCard id="oferta-eliminar" title="Eliminar oferta" tone="care" description={OFFER_DELETE_COPY.description}>
                <Button type="button" variant="outline" size="sm" className="self-start text-destructive" onClick={() => setDeleteOpen(true)} disabled={loading}>
                  <Trash className="mr-2 h-4 w-4" aria-hidden="true" />
                  Eliminar
                </Button>
              </SectionCard>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                Creada el {LONG_DATE.format(new Date(initialData.createdAt))}
              </p>
            </>
          )}
        </aside>
      </div>
    </>
  );
};
