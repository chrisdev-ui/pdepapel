"use client";

import { AdminCartItem } from "@/components/ui/admin-cart-item";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { EnhancedProductSelector } from "@/components/ui/enhanced-product-selector";
import { FormControl, FormField, FormItem } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuantitySelector } from "@/components/ui/quantity-selector";
import { useToast } from "@/hooks/use-toast";
import { currencyFormatter } from "@/lib/utils";
import { Lock, Package, Plus, Trash, Wand2 } from "lucide-react";
import Image from "next/image";
import { useFormContext, type UseFieldArrayReturn } from "react-hook-form";

import type { OrderFormValues } from "./schema";
import { SectionCard } from "./section-card";

interface ItemsSectionProps {
  fieldArray: UseFieldArrayReturn<OrderFormValues, "orderItems", "id">;
  watchedItems: OrderFormValues["orderItems"] | undefined;
  /** Pedido pagado: los productos son un registro histórico. */
  locked: boolean;
  allowManualItems: boolean;
  loading: boolean;
  onConvert: (index: number) => void;
}

export function ItemsSection({ fieldArray, watchedItems, locked, allowManualItems, loading, onConvert }: ItemsSectionProps) {
  const form = useFormContext<OrderFormValues>();
  const { toast } = useToast();
  const { fields, append, remove, update } = fieldArray;
  const itemsErrors = form.formState.errors.orderItems as { message?: string; root?: { message?: string } } | undefined;
  const itemsError = itemsErrors?.root?.message ?? itemsErrors?.message;

  if (locked) {
    return (
      <SectionCard
        id="productos"
        title="Productos"
        description="Pagado: estos productos y precios son el registro histórico de la venta. Para cambiarlos, cancela el pedido y crea uno nuevo."
        action={<Lock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
      >
        <ul className="divide-y rounded-lg border">
          {fields.map((field) => (
            <li key={field.id} className="flex items-center gap-3 p-3">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-muted">
                <Image src={field.imageUrl || "/images/placeholder_1.png"} alt="" fill className="object-cover" sizes="48px" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-primary">{field.name}</span>
                <span className="text-xs text-muted-foreground">
                  {field.sku ? `${field.sku} · ` : ""}
                  {field.quantity} × {currencyFormatter(Number(field.price))}
                </span>
              </div>
              <span className="text-sm font-semibold text-primary">{currencyFormatter(Number(field.price) * Number(field.quantity))}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
    );
  }

  return (
    <SectionCard id="productos" title="Productos" description="Cada línea se descuenta del inventario al marcar el pedido como pagado.">
      <FormField
        control={form.control}
        name="orderItems"
        render={() => (
          <FormItem>
            <FormControl>
              <div className="flex w-full flex-col gap-4">
                <EnhancedProductSelector
                  selectedItems={fields.reduce(
                    (acc: Record<string, number>, item) => {
                      if (item.productId) acc[item.productId] = item.quantity;
                      return acc;
                    },
                    {} as Record<string, number>,
                  )}
                  selectedProductsList={fields
                    .filter((f) => f.productId)
                    .map((f) => ({
                      id: f.productId as string,
                      name: f.name,
                      price: f.price,
                      stock: f.stock || 9999,
                      images: f.imageUrl ? [{ url: f.imageUrl }] : [],
                      category: { name: "Seleccionado" },
                      hasDiscount: false,
                      productGroup: f.productGroup ?? undefined,
                    }))}
                  onClearSelection={() => {
                    const realProductIndices = fields
                      .map((field, index) => (field.productId ? index : -1))
                      .filter((index) => index !== -1)
                      .sort((a, b) => b - a);
                    realProductIndices.forEach((index) => remove(index));
                  }}
                  onUpdate={(productId, quantity, product) => {
                    const existingIndex = fields.findIndex((field) => field.productId === productId);
                    if (quantity > 0) {
                      const availableStock = product?.stock ?? fields[existingIndex]?.stock ?? 9999;
                      if (availableStock <= 0) {
                        toast({ variant: "destructive", title: "Producto sin stock", description: `«${product?.name || "El producto"}» está agotado.` });
                        return;
                      }
                      const validQuantity = Math.min(quantity, availableStock);
                      if (existingIndex !== -1) {
                        update(existingIndex, { ...fields[existingIndex], quantity: validQuantity });
                      } else if (product) {
                        append({
                          productId,
                          quantity: validQuantity,
                          name: product.name,
                          price: product.originalPrice || product.price,
                          discountedPrice: product.discountedPrice,
                          sku: product.sku || "",
                          imageUrl: product.images?.[0]?.url || "",
                          isCustom: false,
                          stock: product.stock,
                          productGroup: product.productGroup,
                        });
                      }
                    } else if (existingIndex !== -1) {
                      remove(existingIndex);
                    }
                  }}
                />

                <div className="flex flex-col gap-3">
                  {fields.map((field, index) => {
                    if (!field.productId) {
                      const itemValues = watchedItems?.[index] || field;
                      return (
                        <div key={field.id} className="relative rounded-lg border border-dashed bg-muted/20 p-4">
                          <div className="absolute right-2 top-2 flex gap-1">
                            <Button type="button" variant="ghost" size="icon-sm" onClick={() => onConvert(index)} title="Convertir en producto del catálogo" aria-label="Convertir en producto del catálogo">
                              <Wand2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(index)} aria-label="Quitar ítem manual" className="text-muted-foreground hover:text-destructive">
                              <Trash className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                          <div className="grid gap-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                              <Package className="h-4 w-4" aria-hidden="true" /> Ítem manual
                            </div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <div className="space-y-1">
                                <Label htmlFor={`item-${field.id}-name`} className="text-xs">Nombre</Label>
                                <Input id={`item-${field.id}-name`} {...form.register(`orderItems.${index}.name`)} placeholder="Nombre del ítem" className="h-9" />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor={`item-${field.id}-price`} className="text-xs">Precio unitario</Label>
                                <CurrencyInput id={`item-${field.id}-price`} value={itemValues.price} onChange={(val) => form.setValue(`orderItems.${index}.price`, Number(val), { shouldValidate: true, shouldDirty: true })} className="h-9" />
                              </div>
                            </div>
                            <div className="grid grid-cols-[1fr_auto] items-end gap-4">
                              <div className="space-y-1">
                                <Label htmlFor={`item-${field.id}-image`} className="text-xs">URL de imagen</Label>
                                <div className="flex gap-2">
                                  <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded border">
                                    <Image src={itemValues.imageUrl || "/images/placeholder_1.png"} fill alt="" className="object-cover" sizes="36px" />
                                  </div>
                                  <Input id={`item-${field.id}-image`} {...form.register(`orderItems.${index}.imageUrl`)} placeholder="https://…" className="h-9" />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Cantidad</Label>
                                <QuantitySelector value={Number(itemValues.quantity)} onChange={(val) => form.setValue(`orderItems.${index}.quantity`, Number(val), { shouldValidate: true, shouldDirty: true })} min={1} />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <AdminCartItem
                        key={field.id}
                        hideStockWarning={false}
                        item={{
                          id: field.productId || field.id,
                          name: field.name,
                          price: field.price,
                          discountedPrice: field.discountedPrice,
                          stock: field.stock || 9999,
                          images: field.imageUrl ? [{ url: field.imageUrl }] : [],
                          quantity: field.quantity,
                          productGroup: field.productGroup ?? undefined,
                        }}
                        onUpdateQuantity={(quantity) => {
                          if (quantity > 0) update(index, { ...field, quantity });
                          else remove(index);
                        }}
                        onRemove={() => remove(index)}
                      />
                    );
                  })}
                </div>

                {allowManualItems && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    className="w-full border-2 border-dashed hover:bg-accent/50 hover:text-accent-foreground"
                    onClick={() => append({ productId: null, quantity: 1, name: "Ítem manual", price: 0, isCustom: true, imageUrl: "", stock: 9999, productGroup: undefined })}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Agregar ítem manual
                  </Button>
                )}
              </div>
            </FormControl>
            {/* Los errores de la lista completa (vacía, ítems manuales) llegan en `root`; FormMessage solo lee `message`. */}
            {itemsError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {itemsError}
              </p>
            )}
          </FormItem>
        )}
      />
    </SectionCard>
  );
}
