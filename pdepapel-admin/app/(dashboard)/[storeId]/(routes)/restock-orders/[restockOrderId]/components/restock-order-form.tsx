"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Product,
  RestockOrder,
  RestockOrderItem,
  RestockOrderStatus,
  Supplier,
} from "@prisma/client";
import axios from "axios";
import {
  AlertTriangle,
  ArrowLeft,
  DollarSign,
  Eraser,
  Plus,
  Trash,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import * as z from "zod";

import { AlertModal } from "@/components/modals/alert-modal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AsyncProductSelect } from "@/components/ui/async-product-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Heading } from "@/components/ui/heading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { Textarea } from "@/components/ui/textarea";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useToast } from "@/hooks/use-toast";
import { cn, currencyFormatter } from "@/lib/utils";
import { ReceiveItemsModal } from "./receive-items-modal";

// Schema definition
const formSchema = z.object({
  supplierId: z.string().min(1, "Proveedor es requerido"),
  notes: z.string().optional(),
  status: z.nativeEnum(RestockOrderStatus),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "Producto es requerido"),
        quantity: z.coerce.number().min(1, "Cantidad mínima es 1"),
        cost: z.coerce.number().min(0, "Costo no puede ser negativo"),
      }),
    )
    .min(1, "Agrega al menos un producto"),
  shippingCost: z.coerce
    .number()
    .min(0, "Costo de envío no puede ser negativo")
    .default(0),
});

type RestockOrderFormValues = z.infer<typeof formSchema>;

interface RestockOrderFormProps {
  initialData:
    | (RestockOrder & {
        items: (RestockOrderItem & {
          product: Product;
        })[];
      })
    | null;
  suppliers: Supplier[];
  products: {
    id: string;
    name: string;
    sku: string;
    acqPrice: number | null;
    stock: number;
  }[];
}

export const RestockOrderForm: React.FC<RestockOrderFormProps> = ({
  initialData,
  suppliers,
  products,
}) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false); // For delete alert
  const [receiveOpen, setReceiveOpen] = useState(false); // For receive modal
  const [loading, setLoading] = useState(false);

  const title = initialData
    ? `Pedido ${initialData.orderNumber}`
    : "Crear Pedido de Aprovisionamiento";
  const description = initialData
    ? "Gestiona los detalles del pedido."
    : "Registra una nueva orden de compra.";
  const toastMessage = initialData ? "Pedido actualizado." : "Pedido creado.";
  const action = initialData ? "Guardar cambios" : "Crear pedido";

  const isDraft =
    !initialData || initialData.status === RestockOrderStatus.DRAFT;
  const isCancelled = initialData?.status === RestockOrderStatus.CANCELLED;
  const isActive = !isDraft && !isCancelled;

  const defaultValues: RestockOrderFormValues = initialData
    ? {
        supplierId: initialData.supplierId,
        notes: initialData.notes || "",
        status: initialData.status,
        items: initialData.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          cost: item.cost,
        })),
        shippingCost: initialData.shippingCost || 0,
      }
    : {
        supplierId: "",
        notes: "",
        status: RestockOrderStatus.DRAFT,
        items: [], // Start empty
        shippingCost: 0,
      };

  const form = useForm<RestockOrderFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  // Persistence Hook
  const { clearStorage } = useFormPersist({
    form,
    key: `restock-order-form-${params.storeId}-${params.restockOrderId ?? "new"}`,
    exclude: ["status"], // Don't persist status changes via draft if meaningful
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const onSubmit = async (data: RestockOrderFormValues) => {
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(
          `/api/${params.storeId}/restock-orders/${params.restockOrderId}`,
          data,
        );
      } else {
        await axios.post(`/api/${params.storeId}/restock-orders`, data);
      }
      clearStorage(); // Clear draft on success
      router.refresh();
      router.push(`/${params.storeId}/restock-orders`);
      toast({ title: toastMessage, variant: "success" });
    } catch (error: any) {
      const msg = error.response?.data || "Algo salió mal.";
      toast({
        title: typeof msg === "string" ? msg : "Error al guardar",
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
        `/api/${params.storeId}/restock-orders/${params.restockOrderId}`,
      );
      clearStorage();
      router.refresh();
      router.push(`/${params.storeId}/restock-orders`);
      toast({ title: "Pedido eliminado.", variant: "success" });
    } catch (error) {
      toast({ title: "Error al eliminar.", variant: "destructive" });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  const onPlaceOrder = async () => {
    // Shortcut to update status to ORDERED
    form.setValue("status", RestockOrderStatus.ORDERED);
    await form.handleSubmit(onSubmit)();
  };

  // Calculate Total
  const watchedItems = form.watch("items");
  const totalAmount = watchedItems.reduce(
    (sum, item) => sum + (item.quantity || 0) * (item.cost || 0),
    0,
  );

  return (
    <>
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onDelete}
        loading={loading}
      />

      {/* Receive Modal - Only active if initialData exists */}
      {initialData && (
        <ReceiveItemsModal
          isOpen={receiveOpen}
          onClose={() => setReceiveOpen(false)}
          orderId={initialData.id}
          items={initialData.items}
        />
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Button>
          <Heading title={title} description={description} />
        </div>
        <div className="flex items-center gap-2">
          {!initialData && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                form.reset(defaultValues);
                clearStorage();
                toast({ title: "Formulario limpiado" });
              }}
            >
              <Eraser className="mr-2 h-4 w-4" />
              Limpiar
            </Button>
          )}
          {initialData && isDraft && (
            <Button
              disabled={loading}
              variant="destructive"
              size="sm"
              onClick={() => setOpen(true)}
            >
              <Trash className="mr-2 h-4 w-4" />
              Eliminar
            </Button>
          )}
        </div>
      </div>
      <Separator />

      {/* Status Banner */}
      {initialData && (
        <div className="my-4">
          <Alert
            variant={
              {
                DRAFT: "default",
                ORDERED: "info",
                PARTIALLY_RECEIVED: "warning",
                COMPLETED: "success",
                CANCELLED: "destructive",
              }[initialData.status] as
                | "default"
                | "info"
                | "warning"
                | "success"
                | "destructive"
            }
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              Estado:{" "}
              {{
                DRAFT: "Borrador",
                ORDERED: "Pedido Realizado",
                PARTIALLY_RECEIVED: "Recibido Parcialmente",
                COMPLETED: "Completado",
                CANCELLED: "Cancelado",
              }[initialData.status] || initialData.status}
            </AlertTitle>
            <AlertDescription>
              {
                {
                  DRAFT:
                    "Este pedido es un borrador. Aún no afecta inventario.",
                  ORDERED:
                    "Este pedido está activo. Recibe los items para actualizar el stock.",
                  PARTIALLY_RECEIVED:
                    "Este pedido está parcialmente recibido. Continúa recibiendo items.",
                  COMPLETED:
                    "Pedido completado. Todo el stock ha sido recibido.",
                  CANCELLED: "Este pedido ha sido cancelado.",
                }[initialData.status]
              }
            </AlertDescription>
          </Alert>
        </div>
      )}

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="w-full space-y-8"
        >
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <FormField
              control={form.control}
              name="supplierId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Proveedor</FormLabel>
                  <Select
                    disabled={loading || !isDraft}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                    key={field.value} // Force re-render when value changes (e.g. from persistence)
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un proveedor" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.name}
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
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea
                      disabled={loading || (!isDraft && !isActive)}
                      placeholder="Instrucciones especiales o referencia interna"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Separator />
          <div className="flex items-center justify-between">
            <Heading
              title="Items del Pedido"
              description="Productos a solicitar"
            />
            {isDraft && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => append({ productId: "", quantity: 1, cost: 0 })}
              >
                <Plus className="mr-2 h-4 w-4" />
                Agregar Producto
              </Button>
            )}
          </div>

          <div className="space-y-4">
            {fields.map((field, index) => (
              <Card key={field.id}>
                <CardContent className="grid grid-cols-1 items-end gap-4 p-4 md:grid-cols-12">
                  <div className="md:col-span-4">
                    <FormField
                      control={form.control}
                      name={`items.${index}.productId`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel isRequired>Producto</FormLabel>
                          <AsyncProductSelect
                            disabled={loading || !isDraft}
                            value={field.value}
                            onChange={(value, product) => {
                              field.onChange(value);
                              if (product) {
                                form.setValue(
                                  `items.${index}.cost`,
                                  product.acqPrice || 0,
                                );
                              }
                            }}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <FormField
                      control={form.control}
                      name={`items.${index}.quantity`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel isRequired>Cantidad</FormLabel>
                          <FormControl>
                            <StockQuantityInput
                              disabled={loading || !isDraft}
                              value={field.value}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Status / Received Column */}
                  <div className="md:col-span-3">
                    <FormItem>
                      <FormLabel isRequired>Estado Recepción</FormLabel>
                      <div className="flex h-10 flex-col justify-center gap-1.5 px-1">
                        {isActive && initialData ? (
                          <>
                            {(() => {
                              const received =
                                initialData.items[index]?.quantityReceived || 0;
                              const target =
                                form.getValues(`items.${index}.quantity`) || 1;
                              const rawPercent = Math.round(
                                (received / target) * 100,
                              );
                              const percent = Math.min(100, rawPercent);

                              let colorClass = "bg-slate-300";
                              let pingClass = "bg-slate-400";
                              let statusText = "Pendiente";
                              let textClass = "text-muted-foreground";

                              if (rawPercent > 100) {
                                colorClass = "bg-indigo-500";
                                pingClass = "bg-indigo-500";
                                statusText = "Excedido";
                                textClass = "text-indigo-600";
                              } else if (rawPercent === 100) {
                                colorClass = "bg-green-500";
                                pingClass = "bg-green-500";
                                statusText = "Completado";
                                textClass = "text-green-600";
                              } else if (rawPercent > 0) {
                                colorClass = "bg-yellow-500";
                                pingClass = "bg-yellow-500";
                                statusText = "Parcial";
                                textClass = "text-yellow-600";
                              } else {
                                colorClass = "bg-red-500";
                                pingClass = "bg-red-500";
                                statusText = "Pendiente";
                                textClass = "text-red-600";
                              }

                              return (
                                <>
                                  <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                      <span className="relative flex h-2 w-2">
                                        <span
                                          className={cn(
                                            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                                            pingClass,
                                          )}
                                        ></span>
                                        <span
                                          className={cn(
                                            "relative inline-flex h-2 w-2 rounded-full",
                                            colorClass,
                                          )}
                                        ></span>
                                      </span>
                                      <span
                                        className={cn("font-medium", textClass)}
                                      >
                                        {statusText}
                                      </span>
                                    </div>
                                    <span className="font-mono text-muted-foreground">
                                      {received} / {target}
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                    <div
                                      className={cn(
                                        "h-full transition-all duration-500 ease-out",
                                        colorClass,
                                      )}
                                      style={{ width: `${percent}%` }}
                                    />
                                  </div>
                                </>
                              );
                            })()}
                          </>
                        ) : (
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            <div className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                            En Borrador
                          </span>
                        )}
                      </div>
                    </FormItem>
                  </div>

                  <div className="md:col-span-2">
                    <FormField
                      control={form.control}
                      name={`items.${index}.cost`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel isRequired>Costo Unit.</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                              <CurrencyInput
                                disabled={loading || !isDraft}
                                className="pl-8"
                                value={field.value}
                                onChange={field.onChange}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="flex justify-end md:col-span-1">
                    {isDraft && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => remove(index)}
                      >
                        <Trash className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {fields.length === 0 && (
              <div className="py-10 text-center text-muted-foreground">
                No hay items en este pedido.
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-2 rounded-lg bg-gray-50 p-4">
            <div className="w-full max-w-xs">
              <FormField
                control={form.control}
                name="shippingCost"
                render={({ field }) => (
                  <FormItem className="mr-4 flex flex-row items-center justify-between gap-2 space-y-0">
                    <FormLabel isRequired className="whitespace-nowrap">
                      Costo de Envío / Logística:
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <CurrencyInput
                          disabled={loading || !isDraft}
                          className="w-32 pl-8 text-right"
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <div className="text-lg font-bold">
              Total Estimado:{" "}
              {currencyFormatter(
                totalAmount + (form.watch("shippingCost") || 0),
              )}
            </div>
          </div>

          <div className="flex justify-end gap-4">
            {/* Draft Actions */}
            {isDraft && (
              <>
                <Button disabled={loading} type="submit" variant="outline">
                  Guardar Borrador
                </Button>
                <Button disabled={loading} type="button" onClick={onPlaceOrder}>
                  Confirmar Pedido (Place Order)
                </Button>
              </>
            )}

            {/* Active Actions */}
            {isActive && initialData?.status !== "COMPLETED" && (
              <Button
                disabled={loading}
                type="button"
                onClick={() => setReceiveOpen(true)}
                className="bg-green-600 text-white hover:bg-green-700"
              >
                Recibir Mercancía
              </Button>
            )}

            {/* If we allow updating notes for active orders, show Save button */}
            {isActive &&
              initialData?.status !== RestockOrderStatus.COMPLETED && (
                <Button disabled={loading} type="submit">
                  Guardar Cambios (Notas)
                </Button>
              )}
          </div>
        </form>
      </Form>
    </>
  );
};
