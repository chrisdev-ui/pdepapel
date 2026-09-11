"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { DiscountType, type Offer, type OfferCategory, type OfferProduct, type OfferProductGroup } from "@prisma/client";
import axios from "axios";
import { ArrowLeft, Trash } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AlertModal } from "@/components/modals/alert-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PercentageInput } from "@/components/ui/percentage-input";
import { ProductPlaceholder } from "@/components/ui/product-placeholder";
import { SectionCard } from "@/components/ui/section-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TintBadge } from "@/components/ui/tint-badge";
import { discountOptions } from "@/constants";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { getErrorMessage } from "@/lib/api-errors";
import { getDatePresets } from "@/lib/date-presets";
import { OFFER_LABEL_MAX, OFFER_NAME_MAX } from "@/lib/offers";
import { formatDiscount, getPromotionStatus, PROMOTION_STATUS } from "@/lib/promotion-status";
import { localDateToPromotionDay, promotionDayToLocalDate } from "@/lib/promotion-window";
import { cn, currencyFormatter } from "@/lib/utils";

import type { OfferPickerData } from "../server/get-offer-picker";

const formSchema = z
  .object({
    name: z.string().trim().min(1, "Escribe el nombre interno").max(OFFER_NAME_MAX, `Hasta ${OFFER_NAME_MAX} caracteres`),
    label: z.string().trim().max(OFFER_LABEL_MAX, `Hasta ${OFFER_LABEL_MAX} caracteres`),
    type: z.nativeEnum(DiscountType, { errorMap: () => ({ message: "Elige el tipo de descuento" }) }),
    amount: z.coerce.number({ invalid_type_error: "Escribe el descuento" }).positive("El descuento debe ser mayor a 0"),
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
    if (value.type === DiscountType.PERCENTAGE && value.amount > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amount"], message: "El porcentaje no puede ser mayor a 100" });
    }
    if (value.productIds.length + value.categoryIds.length + value.productGroupIds.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["productIds"], message: "Elige al menos un producto, grupo o subcategoría" });
    }
  });

type OfferFormValues = z.infer<typeof formSchema>;

type ScopeTab = "productIds" | "productGroupIds" | "categoryIds";

interface OfferFormProps {
  initialData: (Offer & { products: OfferProduct[]; categories: OfferCategory[]; productGroups: OfferProductGroup[] }) | null;
  picker: OfferPickerData;
}

const SCOPE_TABS: { id: ScopeTab; label: string; search: string }[] = [
  { id: "productIds", label: "Productos", search: "Buscar por nombre…" },
  { id: "productGroupIds", label: "Grupos", search: "Buscar grupo…" },
  { id: "categoryIds", label: "Subcategorías", search: "Buscar subcategoría o categoría…" },
];

const PAGE_SIZE = 40;
const LONG_DATE = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", timeZone: "America/Bogota" });

function includes(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

export const OfferForm: React.FC<OfferFormProps> = ({ initialData, picker }) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const storeId = String(params.storeId);
  const listHref = `/${storeId}/promociones`;

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<ScopeTab>("productIds");
  const [search, setSearch] = useState("");
  const [includeOutOfStock, setIncludeOutOfStock] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const status = initialData ? getPromotionStatus(initialData) : null;

  const defaultValues = useMemo<OfferFormValues>(
    () =>
      initialData
        ? {
            name: initialData.name,
            label: initialData.label ?? "",
            type: initialData.type,
            amount: initialData.amount,
            dateRange: { from: promotionDayToLocalDate(initialData.startDate), to: promotionDayToLocalDate(initialData.endDate) },
            isActive: initialData.isActive,
            productIds: initialData.products.map((item) => item.productId),
            categoryIds: initialData.categories.map((item) => item.categoryId),
            productGroupIds: initialData.productGroups.map((item) => item.productGroupId),
          }
        : {
            name: "",
            label: "",
            type: DiscountType.PERCENTAGE,
            amount: undefined as unknown as number,
            dateRange: { from: undefined as unknown as Date, to: undefined as unknown as Date },
            isActive: true,
            productIds: [],
            categoryIds: [],
            productGroupIds: [],
          },
    [initialData],
  );

  const form = useForm<OfferFormValues>({ resolver: zodResolver(formSchema), defaultValues });
  const { clearStorage } = useFormPersist({ form, key: `offer-form-${storeId}-${initialData?.id ?? "new"}`, enabled: !initialData });
  useFormValidationToast({ form });
  const { confirmLeave, confirmationDialog: leaveDialog } = useUnsavedChangesGuard(form, { enabled: !loading });

  const type = form.watch("type");
  const amount = form.watch("amount");
  const label = form.watch("label");
  const dateRange = form.watch("dateRange");
  const selectedProductIds = form.watch("productIds");
  const selectedCategoryIds = form.watch("categoryIds");
  const selectedGroupIds = form.watch("productGroupIds");

  const selected: Record<ScopeTab, string[]> = { productIds: selectedProductIds, categoryIds: selectedCategoryIds, productGroupIds: selectedGroupIds };

  const discountedPrice = (price: number) => {
    if (!amount || amount <= 0) return null;
    return type === DiscountType.PERCENTAGE ? Math.max(0, price * (1 - amount / 100)) : Math.max(0, price - amount);
  };

  /** Filas del tab activo ya filtradas por la búsqueda (y por stock en productos). */
  const rows = useMemo(() => {
    if (tab === "productIds") {
      return picker.products
        .filter((product) => includeOutOfStock || product.stock > 0 || selectedProductIds.includes(product.id))
        .filter((product) => !search || includes(product.name, search))
        .map((product) => ({ id: product.id, title: product.name, subtitle: product.categoryName, price: product.price, stock: product.stock, imageUrl: product.imageUrl }));
    }
    if (tab === "productGroupIds") {
      return picker.productGroups
        .filter((group) => !search || includes(group.name, search))
        .map((group) => ({ id: group.id, title: group.name, subtitle: `${group.productCount} ${group.productCount === 1 ? "variante" : "variantes"}`, price: null, stock: null, imageUrl: null }));
    }
    return picker.categories
      .filter((category) => !search || includes(category.name, search) || includes(category.typeName, search))
      .map((category) => ({ id: category.id, title: category.name, subtitle: `Categoría: ${category.typeName} · ${category.productCount} ${category.productCount === 1 ? "producto" : "productos"}`, price: null, stock: null, imageUrl: null }));
  }, [tab, picker, includeOutOfStock, search, selectedProductIds]);

  const visibleRows = rows.slice(0, visible);
  const currentSelected = selected[tab];
  const filteredIds = rows.map((row) => row.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => currentSelected.includes(id));

  const toggle = (field: ScopeTab, id: string, checked: boolean) => {
    const current = form.getValues(field);
    form.setValue(field, checked ? Array.from(new Set([...current, id])) : current.filter((value) => value !== id), { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
  };

  /** Une los filtrados a la selección actual (o los quita) sin pisar lo que ya estaba marcado. */
  const toggleFiltered = () => {
    const current = form.getValues(tab);
    const next = allFilteredSelected ? current.filter((id) => !filteredIds.includes(id)) : Array.from(new Set([...current, ...filteredIds]));
    form.setValue(tab, next, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
  };

  const affectedProducts = useMemo(
    () =>
      picker.products.filter(
        (product) =>
          selectedProductIds.includes(product.id) ||
          selectedCategoryIds.includes(product.categoryId) ||
          (product.productGroupId !== null && selectedGroupIds.includes(product.productGroupId)),
      ),
    [picker.products, selectedProductIds, selectedCategoryIds, selectedGroupIds],
  );

  const freeProducts = useMemo(
    () => (type === DiscountType.FIXED && amount > 0 ? affectedProducts.filter((product) => product.price <= amount) : []),
    [affectedProducts, amount, type],
  );

  const onSubmit = async ({ dateRange, ...data }: OfferFormValues) => {
    const payload = {
      ...data,
      label: data.label || null,
      startDate: localDateToPromotionDay(dateRange.from),
      endDate: localDateToPromotionDay(dateRange.to),
    };
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(`/api/${storeId}/offers/${initialData.id}`, payload);
      } else {
        await axios.post(`/api/${storeId}/offers`, payload);
      }
      clearStorage();
      router.refresh();
      router.push(listHref);
      toast({ description: initialData ? "Oferta actualizada" : "Oferta creada", variant: "success" });
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async () => {
    if (!initialData) return;
    try {
      setLoading(true);
      await axios.delete(`/api/${storeId}/offers/${initialData.id}`);
      router.refresh();
      router.push(listHref);
      toast({ description: "Oferta eliminada", variant: "success" });
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
      setDeleteOpen(false);
    }
  };

  const scopeError = form.formState.errors.productIds?.message;

  return (
    <>
      {leaveDialog}
      <AlertModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={onDelete}
        loading={loading}
        title={`¿Eliminar la oferta ${initialData?.name ?? ""}?`}
        description="Los pedidos ya hechos conservan sus precios. La tienda vuelve al precio normal al instante."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Volver a ofertas"
            onClick={async () => {
              if (await confirmLeave()) router.push(listHref);
            }}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-primary">{initialData ? "Editar oferta" : "Nueva oferta"}</h1>
              {status && <TintBadge label={PROMOTION_STATUS[status].label} tone={PROMOTION_STATUS[status].tone} />}
            </div>
            <p className="text-sm text-muted-foreground">
              {initialData
                ? `${initialData.name} · ${formatDiscount(initialData.type, initialData.amount, currencyFormatter)} · hasta el ${LONG_DATE.format(new Date(initialData.endDate))}`
                : "Rebaja el precio de productos, grupos o subcategorías durante un periodo. El nombre interno nunca sale en la tienda."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {initialData && (
            <Button type="button" variant="outline" className="text-destructive" onClick={() => setDeleteOpen(true)} disabled={loading}>
              <Trash className="mr-2 h-4 w-4" aria-hidden="true" />
              Eliminar
            </Button>
          )}
          <Button type="submit" form="offer-form" isLoading={loading} loadingText={initialData ? "Guardando…" : "Creando…"}>
            {initialData ? "Guardar cambios" : "Crear oferta"}
          </Button>
        </div>
      </div>

      <Form {...form}>
        <form id="offer-form" onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
          <SectionCard id="oferta-datos" title="Datos de la oferta" description="Sin etiqueta pública, la tienda muestra solo el precio rebajado.">
            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel isRequired>Nombre interno</FormLabel>
                    <FormControl>
                      <Input disabled={loading} placeholder="Ej. Regreso a clases" maxLength={OFFER_NAME_MAX} {...field} />
                    </FormControl>
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
                      <Input disabled={loading} placeholder="Ej. Hasta agotar existencias" maxLength={OFFER_LABEL_MAX} {...field} />
                    </FormControl>
                    <FormDescription className="flex flex-wrap items-center gap-1.5">
                      {label?.trim() ? (
                        <>
                          En la tienda: <TintBadge label={label.trim()} tone="pink" />
                        </>
                      ) : (
                        "Vacía: la tienda no muestra ninguna insignia, solo el precio rebajado."
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex flex-col gap-2">
                <FormLabel isRequired>Descuento</FormLabel>
                <div className="flex gap-2">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem className="w-36 shrink-0 space-y-0">
                        <Select disabled={loading} onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger aria-label="Tipo de descuento">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.values(DiscountType).map((option) => (
                              <SelectItem key={option} value={option}>
                                {discountOptions[option]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem className="flex-1 space-y-0">
                        <FormControl>
                          {type === DiscountType.PERCENTAGE ? (
                            <PercentageInput disabled={loading} placeholder="10" value={field.value} onChange={field.onChange} />
                          ) : (
                            <CurrencyInput placeholder="$ 5.000" disabled={loading} value={field.value} onChange={field.onChange} />
                          )}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormDescription>
                  {freeProducts.length > 0
                    ? `Dejaría en $ 0 a ${freeProducts.slice(0, 2).map((product) => product.name).join(", ")}${freeProducts.length > 2 ? ` y ${freeProducts.length - 2} más` : ""}: baja el monto o usa un porcentaje.`
                    : "Nunca deja un producto por debajo de $ 0."}
                </FormDescription>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="dateRange"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel isRequired>Fecha de inicio y finalización</FormLabel>
                    <FormControl>
                      <DateRangePicker customDates={getDatePresets} name={field.name} control={form.control} />
                    </FormControl>
                    <FormDescription>
                      {dateRange?.to instanceof Date && !Number.isNaN(dateRange.to.getTime())
                        ? `Aplica de 00:00 a 23:59 hora de Colombia; termina el ${LONG_DATE.format(dateRange.to)}. La tienda se actualiza sola al empezar y al terminar.`
                        : "Días completos en hora de Colombia. La tienda se actualiza sola al empezar y al terminar."}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-3 self-end rounded-lg border bg-muted/30 p-4">
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
            </div>
          </SectionCard>

          <SectionCard
            id="oferta-alcance"
            title="Alcance"
            description="Elige al menos un producto, grupo o subcategoría. Si un producto cae en varias ofertas, gana la del precio más bajo."
            action={
              <div className="flex flex-wrap justify-end gap-1.5">
                <TintBadge label={`${selectedProductIds.length} ${selectedProductIds.length === 1 ? "producto" : "productos"}`} tone={selectedProductIds.length ? "sky" : "slate"} />
                <TintBadge label={`${selectedGroupIds.length} ${selectedGroupIds.length === 1 ? "grupo" : "grupos"}`} tone={selectedGroupIds.length ? "sky" : "slate"} />
                <TintBadge label={`${selectedCategoryIds.length} ${selectedCategoryIds.length === 1 ? "subcategoría" : "subcategorías"}`} tone={selectedCategoryIds.length ? "sky" : "slate"} />
              </div>
            }
          >
            <div role="tablist" aria-label="Tipo de destino" className="flex max-w-full gap-1 overflow-x-auto self-start rounded-full border bg-white p-1">
              {SCOPE_TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={item.id === tab}
                  onClick={() => {
                    setTab(item.id);
                    setSearch("");
                    setVisible(PAGE_SIZE);
                  }}
                  className={cn("flex h-8 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold transition-colors", item.id === tab ? "bg-primary text-primary-foreground" : "text-primary hover:bg-accent")}
                >
                  {item.label}
                  {selected[item.id].length > 0 ? ` · ${selected[item.id].length}` : ""}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setVisible(PAGE_SIZE);
                }}
                placeholder={SCOPE_TABS.find((item) => item.id === tab)?.search}
                aria-label={`Buscar en ${SCOPE_TABS.find((item) => item.id === tab)?.label.toLowerCase()}`}
                className="sm:max-w-sm"
              />
              {tab === "productIds" && (
                <label className="flex items-center gap-2 text-sm text-primary">
                  <Checkbox checked={includeOutOfStock} onCheckedChange={(checked) => setIncludeOutOfStock(checked === true)} aria-label="Incluir agotados" />
                  Incluir agotados
                </label>
              )}
              <Button type="button" variant="link" size="sm" className="sm:ml-auto" onClick={toggleFiltered} disabled={filteredIds.length === 0}>
                {allFilteredSelected ? `Quitar los ${filteredIds.length} filtrados` : `Seleccionar los ${filteredIds.length} filtrados`}
              </Button>
            </div>

            {rows.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nada coincide con la búsqueda.</p>
            ) : (
              <ul className="grid gap-2 md:grid-cols-2" aria-label={SCOPE_TABS.find((item) => item.id === tab)?.label}>
                {visibleRows.map((row) => {
                  const checked = currentSelected.includes(row.id);
                  const after = row.price !== null ? discountedPrice(row.price) : null;
                  return (
                    <li key={row.id}>
                      <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors", checked ? "border-primary bg-muted/40" : "hover:bg-accent/40", row.stock === 0 && !checked && "opacity-70")}>
                        <Checkbox checked={checked} onCheckedChange={(value) => toggle(tab, row.id, value === true)} aria-label={row.title} disabled={loading} />
                        {tab === "productIds" && (row.imageUrl ? <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-muted"><Image src={row.imageUrl} alt="" fill sizes="36px" className="object-cover" /></span> : <ProductPlaceholder size="sm" className="shrink-0" />)}
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium text-primary">{row.title}</span>
                          <span className="truncate text-xs text-muted-foreground">{row.subtitle}</span>
                        </span>
                        {row.price !== null && (
                          <span className="shrink-0 text-right text-xs text-muted-foreground">
                            {after !== null && after < row.price ? (
                              <>
                                <span className="line-through">{currencyFormatter(row.price)}</span>
                                <span className="ml-1 font-semibold text-primary">{currencyFormatter(after)}</span>
                              </>
                            ) : (
                              currencyFormatter(row.price)
                            )}
                            {row.stock === 0 && <span className="block">Agotado</span>}
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {rows.length > visible && (
              <Button type="button" variant="outline" size="sm" className="self-center" onClick={() => setVisible((count) => count + PAGE_SIZE)}>
                Ver más ({rows.length - visible} restantes)
              </Button>
            )}
            {scopeError && (
              <p className="text-sm font-medium text-destructive" role="alert">
                {scopeError}
              </p>
            )}
          </SectionCard>

          <SectionCard id="oferta-afectados" title={`Productos afectados (${affectedProducts.length})`} description="Todo lo que recibirá el descuento, sumando productos, grupos y subcategorías.">
            {affectedProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay productos en el alcance.</p>
            ) : (
              <p className="text-sm">
                {affectedProducts
                  .slice(0, 8)
                  .map((product) => product.name)
                  .join(", ")}
                {affectedProducts.length > 8 ? ` y ${affectedProducts.length - 8} más.` : "."}
              </p>
            )}
          </SectionCard>
        </form>
      </Form>
    </>
  );
};
