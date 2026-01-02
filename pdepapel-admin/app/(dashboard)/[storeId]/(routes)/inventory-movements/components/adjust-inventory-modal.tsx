"use client";

import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { Textarea } from "@/components/ui/textarea";

import { AsyncProductSelect } from "@/components/ui/async-product-select";
import { MANUAL_ADJUSTMENT_OPTIONS } from "@/lib/inventory";

const formSchema = z.object({
  productId: z.string().min(1, "Producto es requerido"),
  type: z.enum(
    MANUAL_ADJUSTMENT_OPTIONS.map((opt) => opt.value) as [string, ...string[]],
  ),
  quantity: z.coerce.number().min(1, "Cantidad debe ser al menos 1"),
  reason: z.string().min(3, "Razón es requerida (min 3 caracteres)"),
  description: z.string().optional(),
});

interface AdjustInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  products: { id: string; name: string; stock: number }[];
}

export const AdjustInventoryModal: React.FC<AdjustInventoryModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  products,
}) => {
  const [loading, setLoading] = useState(false);
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      productId: "",
      type: "MANUAL_ADJUSTMENT",
      quantity: 1,
      reason: "",
      description: "",
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset();
    }
  }, [isOpen, form]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setLoading(true);
      await axios.post(`/api/${params.storeId}/inventory`, values);
      toast({
        title: "Inventario ajustado correctamente.",
        variant: "success",
      });
      onConfirm();
    } catch (error) {
      toast({ title: "Error al ajustar inventario.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Ajustar Inventario"
      description="Registra daños, pérdidas, usos internos o correcciones."
      isOpen={isOpen}
      onClose={onClose}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="productId"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel isRequired>Producto</FormLabel>
                <FormControl>
                  <AsyncProductSelect
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Buscar producto..."
                    className="w-full"
                    modal={true}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Tipo de Ajuste</FormLabel>
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
                      {MANUAL_ADJUSTMENT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
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
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Cantidad</FormLabel>
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

          <FormField
            control={form.control}
            name="reason"
            render={({ field }) => (
              <FormItem>
                <FormLabel isRequired>Razón del ajuste</FormLabel>
                <FormControl>
                  <Textarea
                    disabled={loading}
                    placeholder="Ej: Caja rota, conteo mensual..."
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
                <FormLabel>Detalles Adicionales</FormLabel>
                <FormControl>
                  <Textarea
                    disabled={loading}
                    placeholder="Describe los detalles..."
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex w-full items-center justify-end space-x-2 pt-6">
            <Button
              disabled={loading}
              variant="outline"
              onClick={onClose}
              type="button"
            >
              Cancelar
            </Button>
            <Button disabled={loading} type="submit">
              Confirmar Ajuste
            </Button>
          </div>
        </form>
      </Form>
    </Modal>
  );
};
