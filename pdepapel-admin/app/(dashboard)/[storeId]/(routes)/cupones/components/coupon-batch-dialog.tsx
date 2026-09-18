"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { DiscountType } from "@prisma/client";
import axios from "axios";
import { CheckCircle2, Copy, Download, Layers } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { CountInput } from "@/components/ui/count-input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PercentageInput } from "@/components/ui/percentage-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TintBadge } from "@/components/ui/tint-badge";
import { discountOptions } from "@/constants";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { buildBatchCode, MAX_BATCH_SIZE, refineDiscountAmount } from "@/lib/coupons";
import { getDatePresets } from "@/lib/date-presets";
import { formatDiscount, getPromotionStatus, PROMOTION_STATUS } from "@/lib/promotion-status";
import { localDateToPromotionDay } from "@/lib/promotion-window";
import { currencyFormatter } from "@/lib/utils";

const schema = z
  .object({
    prefix: z.string().trim().toUpperCase().max(12, "Hasta 12 caracteres").regex(/^[A-Z0-9]*$/, "Solo letras y números"),
    quantity: z.coerce.number().int("Debe ser un número entero").min(1, "Crea al menos un cupón").max(MAX_BATCH_SIZE, `Hasta ${MAX_BATCH_SIZE} cupones por lote`),
    type: z.nativeEnum(DiscountType, { errorMap: () => ({ message: "Elige el tipo de descuento" }) }),
    amount: z.preprocess((value) => (value === null || value === "" ? undefined : value), z.coerce.number({ required_error: "Escribe el descuento", invalid_type_error: "Escribe el descuento" }).positive("El descuento debe ser mayor a 0")),
    maxUses: z.coerce.number().int("Debe ser un número entero").min(1, "Al menos 1 uso por cupón"),
    minOrderValue: z.coerce.number().min(0).optional(),
    dateRange: z.object({
      from: z.date({ required_error: "Elige la vigencia", invalid_type_error: "Elige la vigencia" }),
      to: z.date({ required_error: "Elige la vigencia", invalid_type_error: "Elige la vigencia" }),
    }),
  })
  .superRefine(refineDiscountAmount);

type BatchValues = z.infer<typeof schema>;

interface CreatedCoupon {
  code: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

const SHORT_DATE = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" });
const isValidDate = (value: unknown): value is Date => value instanceof Date && !Number.isNaN(value.getTime());
const plural = (count: number) => `${count} ${count === 1 ? "cupón" : "cupones"}`;

/** Crea un lote de cupones con las mismas condiciones y entrega la lista de códigos. */
export function CouponBatchDialog() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const storeId = String(params.storeId);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ requested: number; coupons: CreatedCoupon[] } | null>(null);

  const defaultValues: BatchValues = { prefix: "", quantity: 20, type: DiscountType.PERCENTAGE, amount: undefined as unknown as number, maxUses: 1, minOrderValue: undefined, dateRange: { from: undefined as unknown as Date, to: undefined as unknown as Date } };
  const form = useForm<BatchValues>({ resolver: zodResolver(schema), defaultValues });

  const reset = () => {
    form.reset(defaultValues);
    setResult(null);
  };

  // Refrescar la lista con el diálogo abierto remonta el panel y se pierde la lista de códigos: se refresca al cerrar.
  const close = () => {
    const created = Boolean(result);
    setOpen(false);
    reset();
    if (created) router.refresh();
  };

  // Leer `isDirty` en el render suscribe el proxy de react-hook-form; dentro del callback llegaría desactualizado.
  const { isDirty } = form.formState;

  const requestClose = async () => {
    if (submitting) return;
    if (!result && isDirty) {
      const confirmed = await requestConfirmation({
        title: "¿Cerrar sin crear el lote?",
        description: "Lo que escribiste se pierde y no se crea ningún cupón.",
        confirmLabel: "Cerrar sin crear",
        cancelLabel: "Volver al lote",
        destructive: true,
      });
      if (!confirmed) return;
    }
    close();
  };

  const onSubmit = async ({ dateRange, ...values }: BatchValues) => {
    try {
      setSubmitting(true);
      const response = await axios.post<{ createdCount: number; coupons: CreatedCoupon[] }>(`/api/${storeId}/coupons/batch`, {
        ...values,
        startDate: localDateToPromotionDay(dateRange.from),
        endDate: localDateToPromotionDay(dateRange.to),
      });
      setResult({ requested: values.quantity, coupons: response.data.coupons });
      toast({ description: `Se ${response.data.createdCount === 1 ? "creó" : "crearon"} ${plural(response.data.createdCount)}`, variant: "success" });
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const codesText = (result?.coupons ?? []).map((coupon) => coupon.code).join("\n");
  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(codesText);
      toast({ description: "Códigos copiados al portapapeles", variant: "success" });
    } catch {
      toast({ description: "No se pudo copiar. Selecciona la lista y cópiala a mano.", variant: "destructive" });
    }
  };
  const downloadCodes = () => {
    const blob = new Blob([`codigo\n${codesText}\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cupones-${localDateToPromotionDay(new Date())}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const values = form.watch();
  const { prefix, quantity, type, amount, maxUses, minOrderValue, dateRange } = values;
  const isPercentage = type === DiscountType.PERCENTAGE;
  const amountNumber = amount === undefined || amount === null || Number.isNaN(Number(amount)) ? undefined : Number(amount);
  const hasDates = isValidDate(dateRange?.from) && isValidDate(dateRange?.to);
  // Ejemplos estables mientras el diálogo está abierto; los códigos reales se generan al guardar.
  const samples = useMemo(() => {
    void open;
    return Array.from({ length: 3 }, () => buildBatchCode(""));
  }, [open]);
  const sampleCodes = samples.slice(0, Math.max(1, Math.min(3, Number(quantity) || 1))).map((suffix) => (prefix ? `${String(prefix).toUpperCase()}-${suffix}` : suffix));
  const summary = `${plural(Number(quantity) || 0)} de ${type && amountNumber !== undefined ? formatDiscount(type, amountNumber, currencyFormatter) : "—"}, ${Number(maxUses) || 1} ${Number(maxUses) === 1 ? "uso" : "usos"} cada uno, ${minOrderValue ? `compra mínima ${currencyFormatter(Number(minOrderValue))}` : "sin mínimo"}, ${hasDates ? `del ${SHORT_DATE.format(dateRange.from)} al ${SHORT_DATE.format(dateRange.to)}` : "sin fechas todavía"}.`;

  const onTypeChange = (next: string, current: DiscountType) => {
    if (next === current) return;
    form.setValue("type", next as DiscountType, { shouldDirty: true, shouldValidate: true });
    form.setValue("amount", null as unknown as number, { shouldDirty: true });
    form.clearErrors("amount");
  };

  const createdStatus = result?.coupons[0] ? PROMOTION_STATUS[getPromotionStatus(result.coupons[0])] : null;
  const missing = result ? result.requested - result.coupons.length : 0;

  return (
    <>
      {confirmationDialog}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) setOpen(true);
          else void requestClose();
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline">
            <Layers className="mr-2 h-4 w-4" aria-hidden="true" />
            Crear lote de cupones
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          {result ? (
            <div className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                  {plural(result.coupons.length)} {result.coupons.length === 1 ? "creado" : "creados"}
                </DialogTitle>
                <DialogDescription>
                  Ya aparecen en la lista{createdStatus ? ` como «${createdStatus.label}»` : ""}. Copia o descarga los códigos para repartirlos; después no se vuelven a mostrar juntos.
                </DialogDescription>
              </DialogHeader>
              {missing > 0 && (
                <p role="status" className="rounded-md bg-tint-cream px-3 py-2 text-sm">
                  Pediste {result.requested} y se crearon {result.coupons.length}: {missing} {missing === 1 ? "código no se pudo generar" : "códigos no se pudieron generar"}. Puedes crear otro lote para completar.
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {type && amountNumber !== undefined && <TintBadge label={formatDiscount(type, amountNumber, currencyFormatter)} tone="lavender" />}
                <TintBadge label={`${Number(maxUses) || 1} ${Number(maxUses) === 1 ? "uso" : "usos"} cada uno`} tone="slate" />
                <TintBadge label={minOrderValue ? `Mínimo ${currencyFormatter(Number(minOrderValue))}` : "Sin mínimo"} tone="slate" />
                {result.coupons[0] && <TintBadge label={`${SHORT_DATE.format(new Date(result.coupons[0].startDate))} – ${SHORT_DATE.format(new Date(result.coupons[0].endDate))}`} tone="sky" />}
              </div>
              <textarea readOnly value={codesText} rows={Math.min(Math.max(result.coupons.length, 1), 8)} className="w-full rounded-md border border-input bg-muted/40 p-3 font-mono text-sm" aria-label="Códigos creados" />
              <DialogFooter className="gap-2 sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => void copyCodes()}>
                    <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                    Copiar los {result.coupons.length}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={downloadCodes}>
                    <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                    Descargar CSV
                  </Button>
                </div>
                <Button type="button" size="sm" onClick={close}>
                  Listo
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
                <DialogHeader>
                  <DialogTitle>Crear lote de cupones</DialogTitle>
                  <DialogDescription>Se crean de una vez con las mismas condiciones. Los códigos se garantizan únicos al guardar.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="prefix"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prefijo</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="VUELVE" className="font-mono uppercase" maxLength={12} autoComplete="off" disabled={submitting} />
                        </FormControl>
                        <FormDescription>Hasta 12 letras o números. Vacío = solo los cinco caracteres aleatorios.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel isRequired>Cantidad</FormLabel>
                        <FormControl>
                          <CountInput min={1} max={MAX_BATCH_SIZE} value={Number(field.value) || 1} onChange={field.onChange} disabled={submitting} ariaLabel="Cantidad de cupones del lote" />
                        </FormControl>
                        <FormDescription>Hasta {MAX_BATCH_SIZE} por lote.</FormDescription>
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
                        <Select onValueChange={(value) => onTypeChange(value, field.value)} value={field.value} disabled={submitting}>
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
                        <FormDescription>Al cambiar el tipo, el descuento se vacía.</FormDescription>
                        <FormMessage />
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
                            <PercentageInput disabled={submitting} step="1" min={1} placeholder="10" value={field.value} onChange={field.onChange} />
                          ) : (
                            <CurrencyInput disabled={submitting} placeholder="$ 10.000" value={field.value} onChange={field.onChange} />
                          )}
                        </FormControl>
                        <FormDescription>{isPercentage ? "Entre 1 y 100, sin decimales." : "Se descuenta del subtotal de cada pedido."}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="maxUses"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel isRequired>Usos por cupón</FormLabel>
                        <FormControl>
                          <CountInput min={1} value={Number(field.value) || 1} onChange={field.onChange} disabled={submitting} ariaLabel="Usos por cupón" />
                        </FormControl>
                        <FormDescription>Normalmente 1: un código por persona.</FormDescription>
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
                          <CurrencyInput disabled={submitting} placeholder="$ 0" value={field.value} onChange={field.onChange} />
                        </FormControl>
                        <FormDescription>Vacío = sin mínimo.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dateRange"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel isRequired>Vigencia</FormLabel>
                        <FormControl>
                          <DateRangePicker customDates={getDatePresets} name={field.name} control={form.control} />
                        </FormControl>
                        <FormDescription>Días completos en hora de Colombia.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex flex-col gap-2 rounded-lg bg-muted/40 px-3.5 py-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Así se verán (ejemplos)</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {sampleCodes.map((code) => (
                      <span key={code} className="inline-flex h-7 items-center rounded-md border bg-white px-2.5 font-mono text-[13px] font-semibold">
                        {code}
                      </span>
                    ))}
                    {Number(quantity) > 3 && <span className="text-xs text-muted-foreground">… y {Number(quantity) - 3} más</span>}
                  </div>
                  <p className="text-[13px]">{summary}</p>
                </div>
                <DialogFooter className="gap-2">
                  <Button type="button" variant="outline" onClick={() => void requestClose()} disabled={submitting}>
                    Cancelar
                  </Button>
                  <Button type="submit" isLoading={submitting} loadingText="Creando…">
                    Crear {plural(Number(quantity) || 0)}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
