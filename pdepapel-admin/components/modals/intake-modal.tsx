"use client";

import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { Supplier } from "@prisma/client";

const formSchema = z.object({
  type: z.enum(["PURCHASE", "ADJUSTMENT"]),
  action: z.enum(["add", "subtract"]),
  quantity: z.coerce.number().min(1, "La cantidad debe ser mayor a 0"),
  cost: z.coerce.number().min(0, "El costo no puede ser negativo").optional(),
  reason: z.string().min(1, "La razón es requerida"),
  description: z.string().optional(),
  supplierId: z.string().optional(),
});

interface IntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId?: string;
  variantId?: string;
  productName: string;
  defaultCost?: number;
  defaultSupplierId?: string;
  suppliers?: Supplier[];
}

export const IntakeModal: React.FC<IntakeModalProps> = ({
  isOpen,
  onClose,
  productId,
  variantId,
  productName,
  defaultCost = 0,
  defaultSupplierId = "",
  suppliers = [],
}) => {
  const params = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Initialize form with defaultCost
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: "PURCHASE",
      action: "add",
      quantity: 1,
      cost: defaultCost,
      reason: "Initial Intake",
      description: "",
      supplierId: defaultSupplierId,
    },
  });

  // Reset form when defaultCost changes or modal opens
  useEffect(() => {
    if (isOpen) {
      form.reset({
        type: "PURCHASE",
        action: "add",
        quantity: 1,
        cost: defaultCost,
        reason: "Initial Intake",
        description: "",
        supplierId: defaultSupplierId,
      });
    }
  }, [isOpen, defaultCost, defaultSupplierId, form]);

  const { toast } = useToast();

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setLoading(true);
      // Determine sign based on action
      const signedQuantity =
        values.action === "subtract" ? -values.quantity : values.quantity;

      const payload = {
        productId,
        variantId,
        ...values,
        type: values.type === "ADJUSTMENT" ? "MANUAL_ADJUSTMENT" : values.type,
        quantity: signedQuantity,
      };

      await axios.post(`/api/${params.storeId}/inventory`, payload);
      toast({
        title: "Stock actualizado correctamente",
      });
      onClose();
      router.refresh();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error al actualizar stock",
      });
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={`Gestionar Stock: ${productName}`}
      description="Registrar entrada de mercancía, salidas o ajustes de inventario."
      isOpen={isOpen}
      onClose={onClose}
    >
      <div className="space-y-4 py-2 pb-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Movimiento</FormLabel>
                    <Select
                      disabled={loading}
                      onValueChange={(val) => {
                        field.onChange(val);
                        // Auto-select action based on type for better UX
                        if (val === "PURCHASE") {
                          form.setValue("action", "add");
                        }
                      }}
                      value={field.value}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue defaultValue={field.value} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="PURCHASE">
                          Compra / Entrada
                        </SelectItem>
                        <SelectItem value="ADJUSTMENT">
                          Ajuste Manual
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch("type") === "ADJUSTMENT" ? (
                <FormField
                  control={form.control}
                  name="action"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Acción</FormLabel>
                      <Select
                        disabled={loading}
                        onValueChange={field.onChange}
                        value={field.value}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue defaultValue={field.value} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="add">Agregar (+)</SelectItem>
                          <SelectItem value="subtract">
                            Restar / Quitar (-)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormItem>
                  <FormLabel>Acción Implicita</FormLabel>
                  <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 py-2 text-sm font-semibold text-green-600 ring-offset-background disabled:cursor-not-allowed disabled:opacity-50">
                    Sumar Stock (+)
                  </div>
                </FormItem>
              )}

              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cantidad</FormLabel>
                    <FormControl>
                      <StockQuantityInput
                        disabled={loading}
                        value={field.value}
                        onChange={field.onChange}
                        min={1}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Costo Unitario (Opcional)</FormLabel>
                    <p className="text-[0.8rem] text-muted-foreground">
                      Si se deja en 0, se usará el costo actual del producto.
                    </p>
                    <FormControl>
                      <CurrencyInput
                        disabled={loading}
                        placeholder="0"
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch("type") === "PURCHASE" && (
                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Proveedor (Opcional)</FormLabel>
                      <p className="text-[0.8rem] text-muted-foreground">
                        &nbsp;
                      </p>
                      <Select
                        disabled={loading}
                        onValueChange={field.onChange}
                        value={field.value}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar" />
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
              )}
            </div>

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Razón / Motivo</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Ej: Inventario inicial, Compra #123"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas Adicionales</FormLabel>
                  <FormControl>
                    <Input disabled={loading} placeholder="..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex w-full items-center justify-end space-x-2 pt-4">
              <Button
                disabled={loading}
                variant="outline"
                onClick={onClose}
                type="button"
              >
                Cancelar
              </Button>
              <Button disabled={loading} type="submit">
                Guardar Stock
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </Modal>
  );
};
