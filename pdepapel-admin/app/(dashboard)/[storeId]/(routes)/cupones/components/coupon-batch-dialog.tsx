"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { DiscountType } from "@prisma/client";
import axios from "axios";
import { Copy, Download, Layers } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PercentageInput } from "@/components/ui/percentage-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { discountOptions } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { MAX_BATCH_SIZE } from "@/lib/coupons";
import { getDatePresets } from "@/lib/date-presets";
import { localDateToPromotionDay } from "@/lib/promotion-window";

const schema = z
  .object({
    prefix: z.string().trim().toUpperCase().max(12, "Hasta 12 caracteres").regex(/^[A-Z0-9]*$/, "Solo letras y números"),
    quantity: z.coerce.number().int("Debe ser un número entero").min(1, "Crea al menos un cupón").max(MAX_BATCH_SIZE, `Hasta ${MAX_BATCH_SIZE} cupones por lote`),
    type: z.nativeEnum(DiscountType, { errorMap: () => ({ message: "Elige el tipo de descuento" }) }),
    amount: z.coerce.number({ invalid_type_error: "Escribe el descuento" }).positive("El descuento debe ser mayor a 0"),
    maxUses: z.coerce.number().int("Debe ser un número entero").min(1, "Al menos 1 uso por cupón"),
    minOrderValue: z.coerce.number().min(0).optional(),
    dateRange: z.object({
      from: z.date({ required_error: "Elige la vigencia", invalid_type_error: "Elige la vigencia" }),
      to: z.date({ required_error: "Elige la vigencia", invalid_type_error: "Elige la vigencia" }),
    }),
  })
  .refine((value) => value.type !== DiscountType.PERCENTAGE || value.amount <= 100, { path: ["amount"], message: "El porcentaje no puede ser mayor a 100" });

type BatchValues = z.infer<typeof schema>;

interface CreatedCoupon {
  code: string;
}

/** Crea un lote de cupones con las mismas condiciones y entrega la lista de códigos. */
export function CouponBatchDialog() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const storeId = String(params.storeId);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedCoupon[]>([]);

  const form = useForm<BatchValues>({
    resolver: zodResolver(schema),
    defaultValues: { prefix: "", quantity: 20, type: DiscountType.PERCENTAGE, amount: undefined, maxUses: 1, minOrderValue: undefined, dateRange: { from: undefined, to: undefined } },
  });

  const reset = () => {
    form.reset();
    setCreated([]);
  };

  const onSubmit = async ({ dateRange, ...values }: BatchValues) => {
    try {
      setSubmitting(true);
      const response = await axios.post<{ createdCount: number; coupons: CreatedCoupon[] }>(`/api/${storeId}/coupons/batch`, {
        ...values,
        startDate: localDateToPromotionDay(dateRange.from),
        endDate: localDateToPromotionDay(dateRange.to),
      });
      setCreated(response.data.coupons);
      router.refresh();
      toast({ description: `Se crearon ${response.data.createdCount} cupones`, variant: "success" });
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const codesText = created.map((coupon) => coupon.code).join("\n");

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

  const quantity = form.watch("quantity");
  const isPercentage = form.watch("type") === DiscountType.PERCENTAGE;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Layers className="mr-2 h-4 w-4" aria-hidden="true" />
          Crear lote de cupones
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Crear lote de cupones</DialogTitle>
          <DialogDescription>Se crean de una vez con las mismas condiciones. Los códigos se garantizan únicos al guardar.</DialogDescription>
        </DialogHeader>

        {created.length > 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm" role="status">
              <span className="font-semibold">{created.length} cupones creados.</span> Ya aparecen en la lista; copia o descarga los códigos para repartirlos.
            </p>
            <textarea readOnly value={codesText} rows={Math.min(created.length, 8)} className="w-full rounded-md border border-input bg-muted/40 p-3 font-mono text-sm" aria-label="Códigos creados" />
            <DialogFooter className="gap-2 sm:justify-between">
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void copyCodes()}>
                  <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                  Copiar
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={downloadCodes}>
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  Descargar CSV
                </Button>
              </div>
              <Button type="button" size="sm" onClick={() => setOpen(false)}>
                Listo
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
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
                      <FormDescription>Ej. VUELVE-7K3Q2: cinco caracteres aleatorios sin O, 0, I ni 1.</FormDescription>
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
                        <Input {...field} type="number" inputMode="numeric" min={1} max={MAX_BATCH_SIZE} disabled={submitting} />
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
                      <Select onValueChange={field.onChange} value={field.value} disabled={submitting}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.values(DiscountType).map((type) => (
                            <SelectItem key={type} value={type}>
                              {discountOptions[type]}
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
                      <FormLabel isRequired>Descuento</FormLabel>
                      <FormControl>
                        {isPercentage ? (
                          <PercentageInput disabled={submitting} placeholder="10" value={field.value} onChange={field.onChange} />
                        ) : (
                          <CurrencyInput disabled={submitting} placeholder="$ 10.000" value={field.value} onChange={field.onChange} />
                        )}
                      </FormControl>
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
                        <Input {...field} type="number" inputMode="numeric" min={1} disabled={submitting} />
                      </FormControl>
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
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                  Cancelar
                </Button>
                <Button type="submit" isLoading={submitting} loadingText="Creando…">
                  Crear {Number(quantity) > 0 ? quantity : ""} cupones
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
