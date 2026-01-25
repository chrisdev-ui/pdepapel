"use client";

import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { addDays, differenceInDays } from "date-fns";
import { ArrowLeft, Info, Plus, Trash } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import * as z from "zod";

import { AlertModal } from "@/components/modals/alert-modal";
import { AdminCartItem } from "@/components/ui/admin-cart-item";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  EnhancedProductSelector,
  ProductForItem,
} from "@/components/ui/enhanced-product-selector";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { QuantitySelector } from "@/components/ui/quantity-selector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { QUOTATION_TYPE_LABELS } from "@/lib/quotation-types";
import { currencyFormatter, datePresets } from "@/lib/utils";
import { Quotation, QuotationItem } from "@prisma/client";

const itemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "El nombre del producto es requerido"),
  description: z.string().optional(),
  quantity: z.coerce.number().min(1, "Mínimo 1"),
  unitPrice: z.coerce.number().min(0, "Precio inválido"),
  productId: z.string().optional().nullable(),
  isOptional: z.boolean().default(false),
});

const formSchema = z.object({
  name: z.string().min(1, "Nombre de la cotización/plantilla requerido"),
  description: z.string().optional(),
  type: z.string().min(1),
  isTemplate: z.boolean().default(false),
  isActive: z.boolean().default(true),
  validityDays: z.coerce.number().min(1).default(7),
  dateRange: z.object({
    from: z.date(),
    to: z.date(),
  }),
  termsConditions: z.string().optional(),
  defaultDiscount: z.coerce.number().min(0).default(0),
  defaultDiscountType: z.enum(["PERCENTAGE", "FIXED"]).optional(),
  items: z.array(itemSchema).min(1, "Debe agregar al menos un ítem"),
});

type QuotationFormValues = z.infer<typeof formSchema>;

interface QuotationFormProps {
  initialData: (Quotation & { items: QuotationItem[] }) | null;
  products: ProductForItem[];
}

export const QuotationForm: React.FC<QuotationFormProps> = ({
  initialData,
  products,
}) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const title = initialData
    ? "Editar Cotización / Plantilla"
    : "Nueva Cotización / Plantilla";
  const description = initialData
    ? `Editar ${initialData.name}`
    : "Crear una nueva plantilla de lista o cotización base";
  const action = initialData ? "Guardar cambios" : "Crear";

  const defaultValues: QuotationFormValues = initialData
    ? {
        ...initialData,
        description: initialData.description || "",
        termsConditions: initialData.termsConditions || "",
        defaultDiscount: initialData.defaultDiscount || 0,
        // Map nullable enum to undefined if null, or keep as is if valid
        defaultDiscountType: initialData.defaultDiscountType || undefined,
        dateRange: {
          from: new Date(),
          to: addDays(new Date(), initialData.validityDays || 7),
        },
        items: initialData.items.map((item) => ({
          ...item,
          productId: item.productId || undefined,
          description: item.description || "",
        })),
      }
    : {
        name: "",
        description: "",
        type: "GENERAL",
        isTemplate: true, // Default to template as that's the main use case
        isActive: true,
        validityDays: 15,
        dateRange: {
          from: new Date(),
          to: addDays(new Date(), 15),
        },
        termsConditions: "",
        defaultDiscount: 0,
        defaultDiscountType: "FIXED",
        items: [{ name: "", quantity: 1, unitPrice: 0, isOptional: false }],
      };

  const form = useForm<QuotationFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  // Watch dateRange to update validityDays
  const dateRange = form.watch("dateRange");

  useEffect(() => {
    if (dateRange?.from && dateRange?.to) {
      const days = differenceInDays(dateRange.to, dateRange.from);
      if (days > 0) {
        form.setValue("validityDays", days);
      }
    }
  }, [dateRange, form]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  // Calculate rough totals for preview
  const watchedItems = form.watch("items");
  const subtotal = watchedItems.reduce(
    (acc, item) =>
      acc + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0,
  );

  const onSubmit = async (data: QuotationFormValues) => {
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(
          `/api/${params.storeId}/quotations/${initialData.id}`,
          data,
        );
      } else {
        await axios.post(`/api/${params.storeId}/quotations`, data);
      }
      router.refresh();
      router.refresh();
      router.push(`/${params.storeId}/quotations`);
      toast({
        description: initialData ? "Actualizado." : "Creado.",
        variant: "success",
      });
    } catch (error) {
      toast({
        description: "Algo salió mal.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(
        `/api/${params.storeId}/quotations/${initialData?.id}`,
      );
      router.refresh();
      router.push(`/${params.storeId}/quotations`);
      toast({
        description: "Eliminado.",
        variant: "success",
      });
    } catch (error) {
      toast({
        description: "Error al eliminar.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <>
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onDelete}
        loading={loading}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Heading title={title} description={description} />
        </div>
        {initialData && (
          <Button
            disabled={loading}
            variant="destructive"
            size="sm"
            onClick={() => setOpen(true)}
          >
            <Trash className="h-4 w-4" />
          </Button>
        )}
      </div>
      <Separator />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Header Info */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Nombre (Interno/Público)</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Lista Escolar Grado 1..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Tipo</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(QUOTATION_TYPE_LABELS).map(
                        ([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dateRange"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>
                    Vigencia (Días calculados: {form.watch("validityDays")})
                  </FormLabel>
                  <FormControl>
                    <DateRangePicker
                      customDates={datePresets}
                      name={field.name}
                      control={form.control}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Hidden field to actually submit validityDays if needed by backend validation, 
                though we usually submit the whole object. The backend expects 'validityDays'. */}
            <FormField
              control={form.control}
              name="validityDays"
              render={({ field }) => <input type="hidden" {...field} />}
            />
            <FormField
              control={form.control}
              name="isTemplate"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel isRequired>Es Plantilla</FormLabel>
                    <FormDescription>
                      Si se marca, aparecerá en la biblioteca de plantillas para
                      reusar.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel isRequired>Activo</FormLabel>
                    <FormDescription>
                      Disponible para selección pública o interna.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descripción</FormLabel>
                <FormControl>
                  <Textarea
                    disabled={loading}
                    placeholder="Detalles visibles..."
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Separator />

          {/* Items Section */}
          <div>
            <div className="mb-4 space-y-4">
              <h3 className="text-lg font-medium">Ítems de la plantilla</h3>
              <div className="rounded-lg border bg-slate-50 p-4">
                <div className="mb-4 space-y-3">
                  <FormLabel isRequired>Agregar Producto al Carrito</FormLabel>
                  <EnhancedProductSelector
                    selectedItems={fields.reduce(
                      (acc, field) => {
                        if (field.productId) {
                          acc[field.productId] = Number(field.quantity) || 0;
                        }
                        return acc;
                      },
                      {} as Record<string, number>,
                    )}
                    onUpdate={(productId, quantity, productData) => {
                      const existingIndex = fields.findIndex(
                        (f) => f.productId === productId,
                      );

                      if (quantity > 0) {
                        if (existingIndex >= 0) {
                          // Update existing
                          form.setValue(
                            `items.${existingIndex}.quantity`,
                            quantity,
                          );
                        } else if (productData) {
                          // Add new
                          append({
                            productId: productData.id,
                            name: productData.name,
                            quantity: quantity,
                            unitPrice:
                              productData.discountedPrice || productData.price,
                            isOptional: false,
                            description: "",
                          });
                        }
                      } else {
                        // Remove if quantity is 0
                        if (existingIndex >= 0) {
                          remove(existingIndex);
                        }
                      }
                    }}
                  />
                </div>
                <div className="flex justify-center border-b border-t py-2 text-xs text-muted-foreground">
                  O
                </div>
                <div className="mt-2 text-center">
                  <Button
                    type="button"
                    onClick={() =>
                      append({
                        name: "Ítem Personalizado",
                        quantity: 1,
                        unitPrice: 0,
                        isOptional: false,
                      })
                    }
                    variant="link"
                    size="sm"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Agregar Ítem Manual (Sin
                    stock)
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-0 divide-y border">
              {fields.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  El carrito está vacío. Agrega productos arriba.
                </div>
              )}
              {fields.map((field, index) => {
                // Encuentra el producto real si existe para mostrar metadata (imagen, stock)
                const productData = products.find(
                  (p) => p.id === form.getValues(`items.${index}.productId`),
                );
                const item = {
                  id: field.id, // FieldArray ID
                  ...productData,
                  // Fallback for custom items
                  name: form.getValues(`items.${index}.name`),
                  price: form.getValues(`items.${index}.unitPrice`),
                  images: productData?.images || [],
                  category: productData?.category,
                  stock: productData?.stock || 9999,
                  quantity: form.watch(`items.${index}.quantity`),
                  discountedPrice: undefined, // Already applied in unitPrice if added from selector
                } as any; // Cast for AdminCartItem compatibility

                return (
                  <div key={field.id} className="relative bg-white p-4">
                    {/* Hidden fields to persist data */}
                    <input
                      type="hidden"
                      {...form.register(`items.${index}.productId`)}
                    />
                    {/* We allow editing name/price even for products? For quotations, maybe yes. But Cart usually locks them. 
                            Let's keep them editable via the standard fields or just read-only? 
                            The user wants "Storefront Cart". Storefront doesn't allow editing price/name. 
                            But this is Admin. Let's show AdminCartItem and maybe allow inline edit if custom?
                        */}
                    {productData ? (
                      <AdminCartItem
                        item={item}
                        onRemove={() => remove(index)}
                        onUpdateQuantity={(q) =>
                          form.setValue(`items.${index}.quantity`, q)
                        }
                      />
                    ) : (
                      // Fallback layout for manual items
                      <Card className="relative p-4">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-2 top-2 text-red-500 hover:text-red-700"
                          onClick={() => remove(index)}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                        <div className="grid items-start gap-4 md:grid-cols-5">
                          <FormField
                            control={form.control}
                            name={`items.${index}.name`}
                            render={({ field }) => (
                              <FormItem className="col-span-2">
                                <FormLabel
                                  isRequired
                                  className={index !== 0 ? "sr-only" : ""}
                                >
                                  Nombre
                                </FormLabel>
                                <FormControl>
                                  <Input disabled={loading} {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`items.${index}.quantity`}
                            render={({ field }) => (
                              <FormItem className="flex flex-col gap-2">
                                <FormLabel
                                  isRequired
                                  className={index !== 0 ? "sr-only" : ""}
                                >
                                  Cant.
                                </FormLabel>
                                <FormControl>
                                  <QuantitySelector
                                    value={Number(field.value)}
                                    onChange={(val) => field.onChange(val)}
                                    disabled={loading}
                                    className="w-36"
                                    min={1}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`items.${index}.unitPrice`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel
                                  isRequired
                                  className={index !== 0 ? "sr-only" : ""}
                                >
                                  Precio
                                </FormLabel>
                                <FormControl>
                                  <CurrencyInput
                                    disabled={loading}
                                    value={field.value}
                                    onChange={field.onChange}
                                    placeholder="$ 0"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`items.${index}.isOptional`}
                            render={({ field }) => (
                              <FormItem
                                className={`flex h-10 flex-row items-center space-x-2 space-y-0 ${
                                  index === 0 ? "mt-8" : ""
                                }`}
                              >
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="flex items-center gap-2">
                                  <FormLabel
                                    isRequired
                                    className="font-normal text-muted-foreground"
                                  >
                                    Opcional
                                  </FormLabel>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Info className="h-4 w-4 text-muted-foreground" />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>
                                          Si se marca, este ítem no se suma al
                                          total de la cotización, pero el
                                          cliente puede elegir agregarlo.
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              </FormItem>
                            )}
                          />
                        </div>
                      </Card>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <Separator />

          <div className="grid gap-8 md:grid-cols-2">
            <FormField
              control={form.control}
              name="termsConditions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Términos y Condiciones / Notas por defecto
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      disabled={loading}
                      className="h-32"
                      placeholder="Estos términos se copiarán a la orden..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-4 rounded-lg bg-slate-50 p-6">
              <div className="flex items-center justify-between text-lg font-medium">
                <span>Total estimado (Base)</span>
                <span>{currencyFormatter(subtotal)}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Este total es referencial basado en los precios actuales
                definidos aquí. Al crear una orden, los precios pueden variar.
              </p>

              <div className="border-t pt-4">
                <h4 className="mb-2 font-medium">Descuento sugerido</h4>
                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    control={form.control}
                    name="defaultDiscountType"
                    render={({ field }) => (
                      <FormItem>
                        <Select
                          disabled={loading}
                          onValueChange={field.onChange}
                          value={field.value}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Tipo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="FIXED">Fijo ($)</SelectItem>
                            <SelectItem value="PERCENTAGE">%</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="defaultDiscount"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            type="number"
                            disabled={loading}
                            min={0}
                            {...field}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>
          </div>

          <Button
            disabled={loading}
            className="ml-auto w-full md:w-auto"
            type="submit"
          >
            {action}
          </Button>
        </form>
      </Form>
    </>
  );
};
