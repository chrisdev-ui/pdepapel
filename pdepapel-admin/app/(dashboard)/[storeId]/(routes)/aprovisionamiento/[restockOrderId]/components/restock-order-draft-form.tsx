"use client";

import { AsyncProductSelect } from "@/components/ui/async-product-select";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { SectionCard } from "@/components/ui/section-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { Textarea } from "@/components/ui/textarea";
import { TintBadge } from "@/components/ui/tint-badge";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { getErrorMessage } from "@/lib/api-errors";
import { lineSubtotal, RESTOCK_STATUS_LABELS, summarizeLines } from "@/lib/restock-orders";
import type { RestockOrderWithRelations } from "@/lib/restock-orders-db";
import { currencyFormatter } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { RestockOrderStatus } from "@prisma/client";
import axios from "axios";
import { Plus, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

const formSchema = z.object({
  supplierId: z.string().min(1, "Elige un proveedor."),
  notes: z.string().max(2000, "Las notas no pueden superar 2000 caracteres.").optional(),
  shippingCost: z.coerce.number().min(0, "El costo de envío no puede ser negativo."),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "Elige un producto."),
        quantity: z.coerce.number().int("La cantidad debe ser un número entero.").min(1, "La cantidad mínima es 1."),
        cost: z.coerce.number().min(0, "El costo no puede ser negativo."),
      }),
    )
    .min(1, "Agrega al menos un producto."),
});

type DraftValues = z.infer<typeof formSchema>;

interface RestockOrderDraftFormProps {
  initialData: RestockOrderWithRelations | null;
  suppliers: { id: string; name: string; leadTimeDays: number | null }[];
}

/** Borrador de un pedido a proveedor: aquí sí se editan líneas, proveedor y envío. */
export function RestockOrderDraftForm({ initialData, suppliers }: RestockOrderDraftFormProps) {
  const params = useParams();
  const router = useRouter();
  const storeId = String(params.storeId);
  const { toast } = useToast();
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const [loading, setLoading] = useState(false);

  const defaultValues = useMemo<DraftValues>(
    () =>
      initialData
        ? {
            supplierId: initialData.supplierId,
            notes: initialData.notes ?? "",
            shippingCost: initialData.shippingCost,
            items: initialData.items.map((item) => ({ productId: item.productId, quantity: item.quantity, cost: item.cost })),
          }
        : { supplierId: "", notes: "", shippingCost: 0, items: [] },
    [initialData],
  );

  const form = useForm<DraftValues>({ resolver: zodResolver(formSchema), defaultValues });
  const { clearStorage } = useFormPersist({ form, key: `restock-order-form-${storeId}-nuevo`, enabled: !initialData });
  useFormValidationToast({ form });
  const { confirmLeave, confirmationDialog: leaveDialog } = useUnsavedChangesGuard(form, { enabled: !loading });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const items = form.watch("items");
  const shippingCost = form.watch("shippingCost") || 0;
  const totals = summarizeLines(items.map((item) => ({ quantity: Number(item.quantity) || 0, cost: Number(item.cost) || 0 })));
  const total = Math.round((totals.totalAmount + shippingCost) * 100) / 100;

  const save = async (data: DraftValues, status: RestockOrderStatus) => {
    try {
      setLoading(true);
      const payload = { ...data, status };
      const response = initialData
        ? await axios.patch(`/api/${storeId}/restock-orders/${initialData.id}`, payload)
        : await axios.post(`/api/${storeId}/restock-orders`, payload);
      clearStorage();
      form.reset(data);
      toast({
        title: status === RestockOrderStatus.ORDERED ? `Pedido ${response.data.orderNumber} hecho al proveedor.` : initialData ? "Borrador guardado." : `Borrador ${response.data.orderNumber} creado.`,
        variant: "success",
      });
      router.push(`/${storeId}/aprovisionamiento/${response.data.id}`);
      router.refresh();
    } catch (error) {
      toast({ title: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const placeOrder = form.handleSubmit(async (data) => {
    const confirmed = await requestConfirmation({
      title: "Pedir al proveedor",
      description: `${totals.units} ${totals.units === 1 ? "unidad" : "unidades"} en ${data.items.length} ${data.items.length === 1 ? "línea" : "líneas"} por ${currencyFormatter(total)}. Las líneas, los costos y el envío quedan fijos; después solo cambian las notas y se recibe la mercancía.`,
      confirmLabel: "Confirmar pedido",
      cancelLabel: "Volver",
    });
    if (confirmed) await save(data, RestockOrderStatus.ORDERED);
  });

  const onDelete = async () => {
    if (!initialData) return;
    const confirmed = await requestConfirmation({
      title: `Eliminar el borrador ${initialData.orderNumber}`,
      description: "No afectó inventario ni proveedores. Se borra definitivamente; su número no se reutiliza.",
      confirmLabel: "Eliminar",
      cancelLabel: "Volver",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      setLoading(true);
      await axios.delete(`/api/${storeId}/restock-orders/${initialData.id}`);
      clearStorage();
      toast({ title: "Borrador eliminado.", variant: "success" });
      router.push(`/${storeId}/aprovisionamiento`);
      router.refresh();
    } catch (error) {
      toast({ title: getErrorMessage(error), variant: "destructive" });
      setLoading(false);
    }
  };

  const goBack = async () => {
    if (await confirmLeave()) router.push(`/${storeId}/aprovisionamiento`);
  };

  return (
    <>
      {confirmationDialog}
      {leaveDialog}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-primary">{initialData ? `Pedido ${initialData.orderNumber}` : "Nuevo pedido a proveedor"}</h1>
            <TintBadge label={RESTOCK_STATUS_LABELS.DRAFT} tone="slate" />
          </div>
          <p className="text-sm text-muted-foreground">
            {initialData ? "Sigue siendo un borrador: nada afecta al inventario hasta pedirlo y recibirlo." : "Registra lo que vas a pedir; el número se asigna al guardar."}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={goBack} disabled={loading}>
          Volver a aprovisionamiento
        </Button>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => save(data, RestockOrderStatus.DRAFT))} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              <SectionCard id="proveedor" title="Proveedor y envío" description="El costo de envío se reparte entre las líneas al recibir (costo puesto en bodega).">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="supplierId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel isRequired>Proveedor</FormLabel>
                        <Select disabled={loading} onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger aria-label="Proveedor">
                              <SelectValue placeholder="Elige un proveedor" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {suppliers.map((supplier) => (
                              <SelectItem key={supplier.id} value={supplier.id}>
                                {supplier.name}
                                {supplier.leadTimeDays ? ` · ${supplier.leadTimeDays} días` : ""}
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
                    name="shippingCost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Envío / logística</FormLabel>
                        <FormControl>
                          <CurrencyInput disabled={loading} value={field.value} onChange={(value) => field.onChange(value ?? 0)} aria-label="Costo de envío" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </SectionCard>

              <SectionCard
                id="lineas"
                title="Líneas del pedido"
                description="Producto, cantidad y costo unitario acordado con el proveedor."
                action={
                  <Button type="button" variant="soft" size="sm" onClick={() => append({ productId: "", quantity: 1, cost: 0 })} disabled={loading}>
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Agregar producto
                  </Button>
                }
              >
                {fields.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Todavía no hay productos en este pedido.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {fields.map((field, index) => {
                      const line = items[index];
                      const subtotal = lineSubtotal(Number(line?.quantity) || 0, Number(line?.cost) || 0);
                      return (
                        <div key={field.id} className="grid grid-cols-1 items-end gap-3 rounded-lg border p-3 sm:grid-cols-12">
                          <div className="sm:col-span-5">
                            <FormField
                              control={form.control}
                              name={`items.${index}.productId`}
                              render={({ field: productField }) => (
                                <FormItem>
                                  <FormLabel isRequired>Producto</FormLabel>
                                  <AsyncProductSelect
                                    disabled={loading}
                                    value={productField.value ?? ""}
                                    ariaLabel={`Producto de la línea ${index + 1}`}
                                    onChange={(value, product) => {
                                      productField.onChange(value);
                                      if (product && !form.getValues(`items.${index}.cost`)) {
                                        form.setValue(`items.${index}.cost`, product.acqPrice || 0, { shouldDirty: true });
                                      }
                                    }}
                                  />
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <FormField
                              control={form.control}
                              name={`items.${index}.quantity`}
                              render={({ field: quantityField }) => (
                                <FormItem>
                                  <FormLabel isRequired>Cantidad</FormLabel>
                                  <FormControl>
                                    <StockQuantityInput disabled={loading} min={1} value={quantityField.value} onChange={quantityField.onChange} ariaLabel={`Cantidad de la línea ${index + 1}`} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <FormField
                              control={form.control}
                              name={`items.${index}.cost`}
                              render={({ field: costField }) => (
                                <FormItem>
                                  <FormLabel isRequired>Costo unitario</FormLabel>
                                  <FormControl>
                                    <CurrencyInput disabled={loading} value={costField.value} onChange={(value) => costField.onChange(value ?? 0)} aria-label={`Costo unitario de la línea ${index + 1}`} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2 sm:col-span-2 sm:justify-end">
                            <span className="text-sm font-medium text-primary sm:text-right">{currencyFormatter(subtotal)}</span>
                            <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(index)} disabled={loading} aria-label={`Quitar la línea ${index + 1}`} className="text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Mercancía</dt>
                  <dd className="text-right">{currencyFormatter(totals.totalAmount)}</dd>
                  <dt className="text-muted-foreground">Envío / logística</dt>
                  <dd className="text-right">{currencyFormatter(shippingCost)}</dd>
                  <dt className="font-semibold text-primary">Total</dt>
                  <dd className="text-right font-semibold text-primary">{currencyFormatter(total)}</dd>
                </dl>
              </SectionCard>
            </div>

            <div className="flex flex-col gap-4">
              <SectionCard id="notas" title="Notas" description="Referencia interna o instrucciones para el proveedor.">
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea rows={4} maxLength={2000} disabled={loading} placeholder="Ej: pedir con factura; llega en dos entregas." {...field} value={field.value ?? ""} aria-label="Notas del pedido" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </SectionCard>
              {initialData && (
                <SectionCard id="zona-de-cuidado" title="Zona de cuidado" tone="care" description="Un borrador se puede eliminar sin consecuencias: nunca tocó el inventario.">
                  <Button type="button" variant="outline" size="sm" className="self-start border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onDelete} disabled={loading}>
                    Eliminar borrador
                  </Button>
                </SectionCard>
              )}
            </div>
          </div>

          <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-xl border bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">Guardar como borrador no afecta nada. «Pedir al proveedor» fija las líneas y habilita la recepción.</p>
            <div className="flex items-center gap-2">
              <Button type="submit" variant="outline" disabled={loading}>
                Guardar borrador
              </Button>
              <Button type="button" onClick={placeOrder} disabled={loading} isLoading={loading} loadingText="Guardando…">
                Pedir al proveedor
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </>
  );
}
