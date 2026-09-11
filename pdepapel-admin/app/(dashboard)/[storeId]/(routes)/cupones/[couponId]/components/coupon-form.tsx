"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { DiscountType } from "@prisma/client";
import axios from "axios";
import { ArrowLeft, Ban, CalendarDays, Trash } from "lucide-react";
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
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { PercentageInput } from "@/components/ui/percentage-input";
import { SectionCard } from "@/components/ui/section-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TintBadge } from "@/components/ui/tint-badge";
import { discountOptions } from "@/constants";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { getErrorMessage } from "@/lib/api-errors";
import type { CouponDetail } from "@/lib/coupon-availability";
import { COUPON_CODE_MESSAGE, COUPON_CODE_PATTERN } from "@/lib/coupons";
import { getDatePresets } from "@/lib/date-presets";
import { ORDER_STATUS_LABELS } from "@/lib/order-transitions";
import { daysUntilEnd, formatDiscount, getPromotionStatus, PROMOTION_STATUS } from "@/lib/promotion-status";
import { localDateToPromotionDay, promotionDayToLocalDate } from "@/lib/promotion-window";
import { currencyFormatter } from "@/lib/utils";

import { CouponCodeField } from "../../components/coupon-code-field";

const formSchema = z
  .object({
    code: z.string().regex(COUPON_CODE_PATTERN, COUPON_CODE_MESSAGE),
    type: z.nativeEnum(DiscountType, { errorMap: () => ({ message: "Elige el tipo de descuento" }) }),
    amount: z.coerce.number({ invalid_type_error: "Escribe el descuento" }).positive("El descuento debe ser mayor a 0"),
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
    if (value.type === DiscountType.PERCENTAGE && value.amount > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amount"], message: "El porcentaje no puede ser mayor a 100" });
    }
    if (value.type === DiscountType.PERCENTAGE && !Number.isInteger(value.amount)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amount"], message: "El porcentaje debe ser un número entero" });
    }
    if (value.limitUses && !value.maxUses) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["maxUses"], message: "Escribe el máximo de usos o quita el límite" });
    }
  });

type CouponFormValues = z.infer<typeof formSchema>;

interface CouponFormProps {
  initialData: CouponDetail | null;
}

const LONG_DATE = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", timeZone: "America/Bogota" });
const SHORT_DATE = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" });

function orderStateLabel(order: CouponDetail["recentOrders"][number]) {
  if (order.paidAt) return "Pagado";
  return ORDER_STATUS_LABELS[order.status] ?? order.status;
}

export const CouponForm: React.FC<CouponFormProps> = ({ initialData }) => {
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

  const type = form.watch("type");
  const limitUses = form.watch("limitUses");
  const dateRange = form.watch("dateRange");
  const usedCount = initialData?.usedCount ?? 0;

  const onSubmit = async ({ dateRange, limitUses, maxUses, ...data }: CouponFormValues) => {
    const payload = {
      ...data,
      maxUses: limitUses ? maxUses ?? null : null,
      startDate: localDateToPromotionDay(dateRange.from),
      endDate: localDateToPromotionDay(dateRange.to),
    };
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(`/api/${storeId}/coupons/${initialData.id}`, payload);
      } else {
        await axios.post(`/api/${storeId}/coupons`, payload);
      }
      clearStorage();
      router.refresh();
      router.push(listHref);
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
      router.refresh();
      router.push(listHref);
      toast({ description: "Cupón eliminado", variant: "success" });
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
      setDeleteOpen(false);
    }
  };

  const remainingDays = initialData ? daysUntilEnd(initialData.endDate) : null;
  const canDelete = Boolean(initialData) && (initialData?.ordersCount ?? 0) === 0;

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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Volver a cupones"
            onClick={async () => {
              if (await confirmLeave()) router.push(listHref);
            }}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-primary">{initialData ? "Editar cupón" : "Nuevo cupón"}</h1>
              {status && <TintBadge label={PROMOTION_STATUS[status].label} tone={PROMOTION_STATUS[status].tone} />}
            </div>
            <p className="text-sm text-muted-foreground">
              {initialData
                ? `${initialData.code} · ${formatDiscount(initialData.type, initialData.amount, currencyFormatter)} · hasta el ${LONG_DATE.format(new Date(initialData.endDate))}`
                : "Un código que la persona escribe al pagar. Se guarda en mayúsculas y sin espacios."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {initialData && initialData.isActive && status !== "vencida" && (
            <Button type="button" variant="outline" onClick={() => void onDeactivate()} isLoading={deactivating} loadingText="Desactivando…">
              <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
              Desactivar
            </Button>
          )}
          <Button type="submit" form="coupon-form" isLoading={loading} loadingText={initialData ? "Guardando…" : "Creando…"}>
            {initialData ? "Guardar cambios" : "Crear cupón"}
          </Button>
        </div>
      </div>

      <div className={initialData ? "grid gap-5 lg:grid-cols-3" : "grid gap-5"}>
        <Form {...form}>
          <form id="coupon-form" onSubmit={form.handleSubmit(onSubmit)} noValidate className={initialData ? "flex flex-col gap-5 lg:col-span-2" : "flex flex-col gap-5"}>
            <SectionCard id="cupon-datos" title="Datos del cupón" description="El código se escribe al pagar. Se guarda en mayúsculas y sin espacios.">
              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="code"
                  render={() => (
                    <FormItem>
                      <FormLabel isRequired htmlFor="coupon-code">Código</FormLabel>
                      <FormControl>
                        <CouponCodeField id="coupon-code" form={form} fieldName="code" disabled={loading} />
                      </FormControl>
                      {initialData && usedCount > 0 ? <FormDescription>Cambiarlo no afecta los pedidos que ya lo usaron.</FormDescription> : null}
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
                      <Select disabled={loading} onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar tipo" />
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
                        {type === DiscountType.PERCENTAGE ? (
                          <PercentageInput disabled={loading} placeholder="10" value={field.value} onChange={field.onChange} />
                        ) : (
                          <CurrencyInput placeholder="$ 10.000" disabled={loading} value={field.value} onChange={field.onChange} />
                        )}
                      </FormControl>
                      <FormDescription>{type === DiscountType.PERCENTAGE ? "Entre 1 y 100." : "Se descuenta del subtotal, nunca por debajo de $ 0."}</FormDescription>
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

            <SectionCard id="cupon-vigencia" title="Vigencia y límite de usos" description="Las fechas van en hora de Colombia: empieza a las 00:00 del primer día y termina a las 23:59 del último.">
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

            <SectionCard id="cupon-estado" title="Estado">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between gap-3 rounded-lg border bg-muted/30 p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Cupón activo</FormLabel>
                        <FormDescription>Apagarlo lo deja en «Desactivado» y conserva la vigencia. El recálculo diario no lo vuelve a encender.</FormDescription>
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
                    <FormItem className="flex flex-row items-center justify-between gap-3 rounded-lg border border-tint-lavender bg-tint-lavender/30 p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Beneficio de bienvenida</FormLabel>
                        <FormDescription>Solo cuentas con correo verificado, una vez por persona. Un único beneficio activo a la vez.</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} disabled={loading} aria-label="Beneficio de bienvenida" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </SectionCard>
          </form>
        </Form>

        {initialData && (
          <div className="flex flex-col gap-5">
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
                        <Link href={`/${storeId}/pedidos/${order.id}`} className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
                          Pedido #{order.orderNumber}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {SHORT_DATE.format(new Date(order.createdAt))} · {orderStateLabel(order)}
                        </span>
                      </div>
                      {order.paidAt ? (
                        <span className="text-sm font-semibold tabular-nums">− {currencyFormatter(order.couponDiscount)}</span>
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
          </div>
        )}
      </div>
    </>
  );
};
