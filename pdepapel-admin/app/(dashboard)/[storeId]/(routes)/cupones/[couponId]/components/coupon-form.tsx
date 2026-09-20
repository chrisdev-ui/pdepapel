"use client";

import { useCanWrite } from "@/components/shell/viewer-access";
import { zodResolver } from "@hookform/resolvers/zod";
import { DiscountType } from "@prisma/client";
import axios from "axios";
import { AlertTriangle, Ban, CalendarDays, Trash } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AlertModal } from "@/components/modals/alert-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CountInput } from "@/components/ui/count-input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DiscountTypeToggle } from "@/components/ui/discount-type-toggle";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FormPageHeader, FormStickyFooter } from "@/components/ui/form-page-chrome";
import { PercentageInput } from "@/components/ui/percentage-input";
import { SectionCard } from "@/components/ui/section-card";
import { Switch } from "@/components/ui/switch";
import { TintBadge } from "@/components/ui/tint-badge";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { getErrorMessage } from "@/lib/api-errors";
import type { CouponDetail } from "@/lib/coupon-availability";
import { COUPON_CODE_MESSAGE, COUPON_CODE_PATTERN, discountAmountIssue, refineDiscountAmount } from "@/lib/coupons";
import { getDatePresets } from "@/lib/date-presets";
import { ORDER_STATUS_LABELS } from "@/lib/order-transitions";
import { daysUntilEnd, formatDiscount, getPromotionStatus, PROMOTION_STATUS } from "@/lib/promotion-status";
import { localDateToPromotionDay, promotionDayToLocalDate } from "@/lib/promotion-window";
import { cn, currencyFormatter } from "@/lib/utils";

import { CouponCodeField } from "../../components/coupon-code-field";

const formSchema = z
  .object({
    code: z.string().regex(COUPON_CODE_PATTERN, COUPON_CODE_MESSAGE),
    type: z.nativeEnum(DiscountType, { errorMap: () => ({ message: "Elige el tipo de descuento" }) }),
    amount: z.preprocess((value) => (value === null || value === "" ? undefined : value), z.coerce.number({ required_error: "Escribe el descuento", invalid_type_error: "Escribe el descuento" }).positive("El descuento debe ser mayor a 0")),
    dateRange: z.object({
      from: z.date({ required_error: "Elige la fecha de inicio", invalid_type_error: "Elige la fecha de inicio" }),
      to: z.date({ required_error: "Elige la fecha de finalización", invalid_type_error: "Elige la fecha de finalización" }),
    }),
    limitUses: z.boolean(),
    maxUses: z.coerce.number().int("Debe ser un número entero").min(1, "Al menos 1 uso").optional(),
    minOrderValue: z.coerce.number().min(0, "La compra mínima no puede ser negativa").optional(),
    isActive: z.boolean(),
    isWelcomeBenefit: z.boolean(),
  })
  .superRefine((value, ctx) => {
    refineDiscountAmount(value, ctx);
    if (value.limitUses && !value.maxUses) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["maxUses"], message: "Escribe el máximo de usos o quita el límite" });
    }
  });

type CouponFormValues = z.infer<typeof formSchema>;

interface CouponFormProps {
  initialData: CouponDetail | null;
  /** Código del beneficio de bienvenida ya activo en la tienda (otro cupón), si lo hay. */
  activeWelcomeCode: string | null;
}

const LONG_DATE = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", timeZone: "America/Bogota" });
const SHORT_DATE = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" });

const isValidDate = (value: unknown): value is Date => value instanceof Date && !Number.isNaN(value.getTime());

function orderStateLabel(order: CouponDetail["recentOrders"][number]) {
  if (order.paidAt) return "Pagado";
  return ORDER_STATUS_LABELS[order.status] ?? order.status;
}

export const CouponForm: React.FC<CouponFormProps> = ({ initialData, activeWelcomeCode }) => {
  const canWrite = useCanWrite();
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const storeId = String(params.storeId);
  const listHref = `/${storeId}/promociones?tab=cupones`;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const status = initialData ? getPromotionStatus(initialData) : null;

  const defaultValues = useMemo<CouponFormValues>(
    () =>
      initialData
        ? {
            code: initialData.code,
            type: initialData.type,
            amount: initialData.amount,
            dateRange: { from: promotionDayToLocalDate(initialData.startDate), to: promotionDayToLocalDate(initialData.endDate) },
            limitUses: initialData.maxUses !== null,
            maxUses: initialData.maxUses ?? undefined,
            minOrderValue: initialData.minOrderValue ?? 0,
            isActive: initialData.isActive,
            isWelcomeBenefit: initialData.isWelcomeBenefit,
          }
        : {
            code: "",
            type: undefined as unknown as DiscountType,
            amount: undefined as unknown as number,
            dateRange: { from: undefined as unknown as Date, to: undefined as unknown as Date },
            limitUses: true,
            maxUses: 1,
            minOrderValue: undefined,
            isActive: true,
            isWelcomeBenefit: false,
          },
    [initialData],
  );

  const form = useForm<CouponFormValues>({ resolver: zodResolver(formSchema), defaultValues });
  const { clearStorage } = useFormPersist({ form, key: `coupon-form-${storeId}-${initialData?.id ?? "new"}`, enabled: !initialData });
  useFormValidationToast({ form });
  const { confirmLeave, confirmationDialog: leaveDialog } = useUnsavedChangesGuard(form, { enabled: !loading });

  const values = form.watch();
  const { type, limitUses, dateRange, isWelcomeBenefit, isActive } = values;
  const isDirty = form.formState.isDirty;
  const usedCount = initialData?.usedCount ?? 0;
  const isPercentage = type === DiscountType.PERCENTAGE;
  const welcomeClash = Boolean(activeWelcomeCode) && isWelcomeBenefit && isActive;

  const onTypeChange = (next: string, current: DiscountType | undefined) => {
    if (next === current) return;
    form.setValue("type", next as DiscountType, { shouldDirty: true, shouldValidate: true });
    form.setValue("amount", null as unknown as number, { shouldDirty: true });
    form.clearErrors("amount");
  };

  const onSubmit = async ({ dateRange: range, limitUses: limited, maxUses, ...data }: CouponFormValues) => {
    const payload = {
      ...data,
      maxUses: limited ? maxUses ?? null : null,
      startDate: localDateToPromotionDay(range.from),
      endDate: localDateToPromotionDay(range.to),
    };
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(`/api/${storeId}/coupons/${initialData.id}`, payload);
      } else {
        await axios.post(`/api/${storeId}/coupons`, payload);
      }
      clearStorage();
      router.push(listHref);
      router.refresh();
      toast({ description: initialData ? "Cupón actualizado" : "Cupón creado", variant: "success" });
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const onDeactivate = async () => {
    if (!initialData) return;
    const confirmed = await requestConfirmation({
      title: `¿Desactivar el cupón ${initialData.code}?`,
      description: "Nadie podrá usarlo desde ahora. Conserva su vigencia y sus usos; puedes volver a activarlo con el interruptor y guardar.",
      confirmLabel: "Desactivar",
    });
    if (!confirmed) return;
    try {
      setDeactivating(true);
      await axios.put(`/api/${storeId}/coupons/${initialData.id}`);
      form.setValue("isActive", false);
      router.refresh();
      toast({ description: `Cupón ${initialData.code} desactivado`, variant: "success" });
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setDeactivating(false);
    }
  };

  const onDelete = async () => {
    if (!initialData) return;
    try {
      setLoading(true);
      await axios.delete(`/api/${storeId}/coupons/${initialData.id}`);
      router.push(listHref);
      router.refresh();
      toast({ description: "Cupón eliminado", variant: "success" });
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

  const remainingDays = initialData ? daysUntilEnd(initialData.endDate) : null;
  const canDelete = Boolean(initialData) && (initialData?.ordersCount ?? 0) === 0;

  const summary = initialData
    ? `${initialData.code} · ${formatDiscount(initialData.type, initialData.amount, currencyFormatter)}${initialData.minOrderValue ? ` · mínimo ${currencyFormatter(initialData.minOrderValue)}` : ""} · ${initialData.usage.limit === null ? `${initialData.usage.used} usos` : `${initialData.usage.used} de ${initialData.usage.limit} usos`} · hasta el ${LONG_DATE.format(new Date(initialData.endDate))}`
    : "Un código que la persona escribe al pagar. Se guarda en mayúsculas y sin espacios.";

  const amountNumber = values.amount === undefined || values.amount === null || Number.isNaN(Number(values.amount)) ? undefined : Number(values.amount);
  const amountIssue = discountAmountIssue(type, amountNumber);
  const preview = {
    code: values.code || "CÓDIGO",
    discount: !type || amountNumber === undefined ? "—" : formatDiscount(type, amountNumber, currencyFormatter),
    min: values.minOrderValue ? `mínimo ${currencyFormatter(Number(values.minOrderValue))}` : "sin mínimo",
    uses: limitUses ? `${values.maxUses ?? 1} ${Number(values.maxUses ?? 1) === 1 ? "uso" : "usos"}` : "sin límite de usos",
    window: isValidDate(dateRange?.from) && isValidDate(dateRange?.to) ? `${SHORT_DATE.format(dateRange.from)} – ${SHORT_DATE.format(dateRange.to)}` : "sin fechas",
    checks: [
      { ok: COUPON_CODE_PATTERN.test(values.code ?? ""), text: COUPON_CODE_PATTERN.test(values.code ?? "") ? "Código listo" : "Falta el código (4 a 20 caracteres)" },
      { ok: Boolean(type) && amountNumber !== undefined && amountNumber > 0 && !amountIssue, text: Boolean(type) && amountNumber !== undefined && amountNumber > 0 && !amountIssue ? "Descuento definido" : "Falta el tipo y el monto" },
      { ok: isValidDate(dateRange?.from) && isValidDate(dateRange?.to), text: isValidDate(dateRange?.from) && isValidDate(dateRange?.to) ? "Vigencia definida" : "Faltan las fechas" },
      { ok: !welcomeClash, text: welcomeClash ? `Choca con ${activeWelcomeCode}` : "Sin conflicto de bienvenida" },
    ],
  };

  return (
    <>
      {confirmationDialog}
      {leaveDialog}
      <AlertModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={onDelete}
        loading={loading}
        title={`¿Eliminar el cupón ${initialData?.code ?? ""}?`}
        description="Esta acción no se puede deshacer."
      />
      <FormPageHeader
        title={initialData ? (canWrite ? "Editar cupón" : "Ver cupón") : "Nuevo cupón"}
        badge={status && <TintBadge label={PROMOTION_STATUS[status].label} tone={PROMOTION_STATUS[status].tone} />}
        summary={summary}
        backLabel="Volver a cupones"
        onBack={() => void goBack()}
        actions={
          initialData && initialData.isActive && status !== "vencida" ? (
            <Button type="button" variant="outline" onClick={() => void onDeactivate()} isLoading={deactivating} loadingText="Desactivando…">
              <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
              Desactivar
            </Button>
          ) : undefined
        }
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Form {...form}>
          <form id="coupon-form" onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex min-w-0 flex-col gap-5">
            <SectionCard id="cupon-datos" step={1} title="Datos del cupón" description="El código se escribe al pagar. Se guarda en mayúsculas y sin espacios.">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <FormField
                  control={form.control}
                  name="code"
                  render={() => (
                    <FormItem>
                      <FormLabel isRequired htmlFor="coupon-code">Código</FormLabel>
                      <FormControl>
                        <CouponCodeField id="coupon-code" form={form} fieldName="code" disabled={loading} />
                      </FormControl>
                      <FormDescription>{initialData && usedCount > 0 ? "Cambiarlo no afecta los pedidos que ya lo usaron." : "Entre 4 y 20 caracteres. Se comprueba que no exista al guardar."}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Tipo de descuento</FormLabel>
                      <FormControl>
                        <DiscountTypeToggle value={field.value} onChange={(value) => onTypeChange(value, field.value)} disabled={loading} />
                      </FormControl>
                      <FormDescription>{type ? "Al cambiar el tipo, el monto se vacía para no guardar un «10» como 10 pesos." : "Elige % o $ fijo para habilitar el monto."}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Monto del descuento</FormLabel>
                      <FormControl>
                        {isPercentage ? (
                          <PercentageInput disabled={loading} step="1" min={1} placeholder="10" value={field.value} onChange={field.onChange} />
                        ) : (
                          <CurrencyInput placeholder={type ? "$ 10.000" : "Elige el tipo primero"} disabled={loading || !type} value={field.value} onChange={field.onChange} />
                        )}
                      </FormControl>
                      <FormDescription>{!type ? "Elige el tipo primero." : isPercentage ? "Entre 1 y 100, sin decimales." : "Se descuenta del subtotal, nunca por debajo de $ 0."}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="minOrderValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Compra mínima</FormLabel>
                      <FormControl>
                        <CurrencyInput placeholder="$ 0" disabled={loading} value={field.value} onChange={field.onChange} />
                      </FormControl>
                      <FormDescription>Subtotal después de ofertas. Vacío = sin mínimo.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </SectionCard>

            <SectionCard id="cupon-vigencia" step={2} title="Vigencia y límite de usos" description="Las fechas van en hora de Colombia: empieza a las 00:00 del primer día y termina a las 23:59 del último.">
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
                        {isValidDate(dateRange?.to)
                          ? `Termina el ${LONG_DATE.format(dateRange.to)} a las 23:59 (Bogotá).${remainingDays !== null && remainingDays > 0 && initialData ? ` Quedan ${remainingDays} ${remainingDays === 1 ? "día" : "días"}.` : ""}`
                          : "Elige el primer y el último día."}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex flex-col gap-3">
                  <FormField
                    control={form.control}
                    name="maxUses"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Máximo de usos</FormLabel>
                        <FormControl>
                          <CountInput
                            disabled={loading || !limitUses}
                            min={Math.max(1, usedCount)}
                            value={Number(field.value ?? Math.max(1, usedCount))}
                            onChange={field.onChange}
                            ariaLabel="Máximo de usos del cupón"
                          />
                        </FormControl>
                        <FormDescription>
                          {limitUses ? (usedCount > 0 ? `No puede bajar de ${usedCount}, los usos ya registrados.` : "Cuántas veces puede usarse en total.") : "Sin límite: cualquiera puede usarlo mientras esté vigente."}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="limitUses"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox id="coupon-unlimited" checked={!field.value} onCheckedChange={(checked) => field.onChange(checked !== true)} disabled={loading} />
                        </FormControl>
                        <FormLabel htmlFor="coupon-unlimited" className="cursor-pointer font-normal">
                          Sin límite de usos
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard id="cupon-estado" step={3} title="Estado" description="Lo que decide si el código aplica hoy en la tienda.">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between gap-3 rounded-lg border bg-muted/30 p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Cupón activo</FormLabel>
                        <FormDescription>Apagarlo lo deja en «Desactivada» y conserva la vigencia. El recálculo diario no lo vuelve a encender.</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} disabled={loading} aria-label="Cupón activo" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isWelcomeBenefit"
                  render={({ field }) => (
                    <FormItem className="flex flex-col gap-3 space-y-0 rounded-lg border border-tint-lavender bg-tint-lavender/30 p-4">
                      <div className="flex flex-row items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <FormLabel>Beneficio de bienvenida</FormLabel>
                          <FormDescription>Solo cuentas con correo verificado, una vez por persona. Un único beneficio activo a la vez.</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} disabled={loading} aria-label="Beneficio de bienvenida" />
                        </FormControl>
                      </div>
                      {welcomeClash && (
                        <p role="alert" className="flex items-start gap-2 rounded-md bg-tint-cream px-3 py-2 text-xs text-primary">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>
                            <strong>{activeWelcomeCode}</strong> ya es el beneficio de bienvenida activo. Al guardar se rechazará: desactívalo primero o apaga este interruptor.
                          </span>
                        </p>
                      )}
                    </FormItem>
                  )}
                />
              </div>
            </SectionCard>

            <FormStickyFooter
              note={
                <span className="flex flex-wrap items-center gap-2">
                  {isDirty && <TintBadge label="Cambios sin guardar" tone="cream" />}
                  <span>{initialData ? "Los cambios aplican en la tienda al guardar. Los pedidos ya pagados no cambian." : "El cupón queda disponible en la tienda en cuanto lo crees."}</span>
                </span>
              }
            >
              <Button type="button" variant="outline" onClick={() => void goBack()} disabled={loading}>
                Cancelar
              </Button>
              <Button type="submit" form="coupon-form" isLoading={loading} loadingText={initialData ? "Guardando…" : "Creando…"}>
                {initialData ? "Guardar cambios" : "Crear cupón"}
              </Button>
            </FormStickyFooter>
          </form>
        </Form>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-4 lg:self-start">
          {initialData ? (
            <>
              <SectionCard id="cupon-uso" title="Uso" description="Se cuenta cuando el pedido queda pagado.">
                <div className="flex flex-col gap-2">
                  <p className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-bold tabular-nums text-primary">{initialData.usage.used}</span>
                    <span className="text-sm text-muted-foreground">{initialData.usage.limit === null ? "usos, sin límite" : `de ${initialData.usage.limit} usos`}</span>
                  </p>
                  {initialData.usage.limit !== null && (
                    <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={initialData.usage.limit} aria-valuenow={initialData.usage.used} aria-label="Usos del cupón">
                      <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, (initialData.usage.used / initialData.usage.limit) * 100)}%` }} />
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {initialData.usage.remaining !== null ? `${initialData.usage.remaining} disponibles` : "Sin límite"}
                    {initialData.usage.reserved > 0 ? ` · ${initialData.usage.reserved} ${initialData.usage.reserved === 1 ? "reservado en un pedido pendiente" : "reservados en pedidos pendientes"}` : ""}
                  </p>
                </div>
                {initialData.recentOrders.length > 0 ? (
                  <ul className="divide-y border-t">
                    {initialData.recentOrders.map((order) => (
                      <li key={order.id} className="flex items-center justify-between gap-2 py-2.5">
                        <div className="flex min-w-0 flex-col">
                          <Link href={`/${storeId}/pedidos/${order.id}`} className="break-all text-sm font-semibold text-primary underline-offset-4 hover:underline">
                            Pedido #{order.orderNumber}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            {SHORT_DATE.format(new Date(order.createdAt))} · {orderStateLabel(order)}
                          </span>
                        </div>
                        {order.paidAt ? (
                          <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums">− {currencyFormatter(order.couponDiscount)}</span>
                        ) : (
                          <TintBadge label={order.status === "CANCELLED" ? "Cancelado" : "Reservado"} tone={order.status === "CANCELLED" ? "slate" : "cream"} />
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Todavía ningún pedido usa este cupón.</p>
                )}
                {initialData.ordersCount > initialData.recentOrders.length && (
                  <p className="text-xs text-muted-foreground">Mostrando los {initialData.recentOrders.length} más recientes de {initialData.ordersCount} pedidos.</p>
                )}
              </SectionCard>
              <SectionCard id="cupon-eliminar" title="Eliminar cupón" tone="care" description={canDelete ? "Solo si nadie lo ha usado. Esta acción no se puede deshacer." : `No se puede eliminar: ${initialData.ordersCount} ${initialData.ordersCount === 1 ? "pedido lo referencia" : "pedidos lo referencian"}. Desactívalo para que nadie más lo use.`}>
                <Button type="button" variant="outline" size="sm" className="self-start text-destructive" onClick={() => setDeleteOpen(true)} disabled={!canDelete || loading}>
                  <Trash className="mr-2 h-4 w-4" aria-hidden="true" />
                  Eliminar
                </Button>
              </SectionCard>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                Creado el {LONG_DATE.format(new Date(initialData.createdAt))}
              </p>
            </>
          ) : (
            <SectionCard id="cupon-vista-previa" title="Así quedará" description="Se actualiza mientras escribes. Léelo antes de crear.">
              <div className="flex flex-col gap-1.5 rounded-lg bg-muted/40 p-3.5">
                <span className="break-all font-mono text-lg font-bold tracking-wide text-primary">{preview.code}</span>
                <span className="text-sm">
                  <span className="font-semibold">{preview.discount}</span>
                  <span className="text-muted-foreground"> · {preview.min}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {preview.uses} · {preview.window}
                </span>
              </div>
              <ul className="flex flex-col gap-1.5" aria-label="Qué falta para crear el cupón">
                {preview.checks.map((check) => (
                  <li key={check.text} className={cn("flex items-center gap-2 text-[13px]", check.ok ? "text-primary" : "text-muted-foreground")}>
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", check.ok ? "bg-emerald-500" : "bg-slate-300")} aria-hidden="true" />
                    {check.text}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </aside>
      </div>
    </>
  );
};
