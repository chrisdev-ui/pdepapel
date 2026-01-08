"use client";

import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { Package } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Form,
  FormControl,
  FormDescription,
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
  quantity: z.coerce.number().min(1, "La cantidad debe ser mayor a 0"),
  cost: z.coerce.number().min(0, "El costo no puede ser negativo").optional(),
  reason: z.string().min(1, "La razón es requerida"),
  description: z.string().optional(),
  supplierId: z.string().optional(),
});

export interface BatchIntakeVariant {
  id: string;
  name: string;
  currentStock: number;
}

interface BatchIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  variants: BatchIntakeVariant[];
  defaultCost?: number;
  defaultSupplierId?: string;
  suppliers?: Supplier[];
  onSuccess?: () => void;
}

export const BatchIntakeModal: React.FC<BatchIntakeModalProps> = ({
  isOpen,
  onClose,
  variants,
  defaultCost = 0,
  defaultSupplierId = "",
  suppliers = [],
  onSuccess,
}) => {
  const params = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      quantity: 1,
      cost: defaultCost,
      reason: "Ingreso Inicial de Inventario",
      description: "",
      supplierId: defaultSupplierId,
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setLoading(true);

      // Build movements array for batch API
      const movements = variants.map((v) => ({
        productId: v.id,
        quantity: values.quantity,
        cost: values.cost,
      }));

      await axios.post(`/api/${params.storeId}/inventory/batch`, {
        movements,
        type: "INITIAL_INTAKE",
        reason: values.reason,
        description: values.description,
        supplierId: values.supplierId,
      });

      toast({
        title: "Stock actualizado",
        description: `Se agregaron ${values.quantity} unidades a ${variants.length} variantes.`,
        variant: "success",
      });

      onClose();
      onSuccess?.();
      router.refresh();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error al actualizar stock",
        description: "Ocurrió un error al procesar el ingreso masivo.",
      });
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Ingreso de Stock Masivo"
      description={`Agregar stock a ${variants.length} variantes seleccionadas.`}
      isOpen={isOpen}
      onClose={onClose}
    >
      <div className="space-y-4 py-2 pb-4">
        {/* Preview of selected variants */}
        <div className="rounded-md border bg-muted/50 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Package className="h-4 w-4" />
            Variantes seleccionadas:
          </div>
          <div className="max-h-24 space-y-1 overflow-y-auto">
            {variants.slice(0, 5).map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between text-xs"
              >
                <span className="truncate">{v.name}</span>
                <span className="text-muted-foreground">
                  Stock actual: {v.currentStock}
                </span>
              </div>
            ))}
            {variants.length > 5 && (
              <div className="text-xs text-muted-foreground">
                ... y {variants.length - 5} más
              </div>
            )}
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cantidad a agregar</FormLabel>
                    <FormDescription>
                      Se aplicará a todas las variantes
                    </FormDescription>
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

              <FormField
                control={form.control}
                name="cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Costo Unitario (Opcional)</FormLabel>
                    <FormDescription>&nbsp;</FormDescription>
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
            </div>

            <FormField
              control={form.control}
              name="supplierId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Proveedor (Opcional)</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar proveedor" />
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
                {loading
                  ? "Procesando..."
                  : `Ingresar Stock (${variants.length})`}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </Modal>
  );
};
