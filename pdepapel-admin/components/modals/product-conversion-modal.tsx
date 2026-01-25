"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Category, Product } from "@prisma/client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { createProductFromManualItem } from "@/actions/create-product-from-manual-item";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useToast } from "@/hooks/use-toast";
import { useParams } from "next/navigation";

const formSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  price: z.coerce.number().min(0, "El precio debe ser mayor o igual a 0"),
  cost: z.coerce.number().min(0, "El costo debe ser mayor o igual a 0"),
  categoryId: z.string().min(1, "La categoría es requerida"),
  stock: z.coerce
    .number()
    .min(0, "El stock inicial debe ser mayor o igual a 0"),
  description: z.string().optional(),
  isPublic: z.boolean().default(false),
});

type ProductConversionFormValues = z.infer<typeof formSchema>;

interface ProductConversionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (product: Product) => void;
  loading: boolean;
  initialData: {
    name: string;
    price: number;
    quantity: number;
    orderId?: string;
    orderItemId?: string;
  } | null;
  categories: Category[];
}

export const ProductConversionModal: React.FC<ProductConversionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  loading: parentLoading,
  initialData,
  categories,
}) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const params = useParams();

  const form = useForm<ProductConversionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      price: 0,
      cost: 0,
      categoryId: "",
      stock: 0,
      description: "",
      isPublic: false,
    },
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name,
        price: initialData.price,
        cost: 0,
        categoryId: "",
        stock: initialData.quantity,
        description: "",
        isPublic: false,
      });
    }
  }, [initialData, form]);

  const onSubmit = async (values: ProductConversionFormValues) => {
    try {
      setLoading(true);

      const product = await createProductFromManualItem({
        ...values,
        storeId: params.storeId as string,
        isArchived: !values.isPublic,
        orderId: initialData?.orderId,
        orderItemId: initialData?.orderItemId,
      });

      toast({
        title: "Producto creado",
        description: "El item manual ha sido convertido exitosamente.",
      });

      onConfirm(product);
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: "Hubo un error al convertir el producto.",
        variant: "destructive",
      });
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Convertir a Producto Real"
      description="Este item se guardará en el inventario y podrá ser trackeado."
      isOpen={isOpen}
      onClose={onClose}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel isRequired>Nombre del Producto</FormLabel>
                <FormControl>
                  <Input disabled={loading} placeholder="Nombre" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Precio de Venta</FormLabel>
                  <FormControl>
                    <CurrencyInput
                      value={field.value}
                      onChange={field.onChange}
                      disabled={loading}
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
                  <FormLabel isRequired>Costo Unitario</FormLabel>
                  <FormControl>
                    <CurrencyInput
                      value={field.value}
                      onChange={field.onChange}
                      disabled={loading}
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
              name="stock"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Stock Inicial</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      disabled={loading}
                      placeholder="0"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Categoría</FormLabel>
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
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="isPublic"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel isRequired>Publicar inmediatamente</FormLabel>
                  <FormDescription>
                    Si se marca, el producto será visible en la tienda. De lo
                    contrario, quedará archivado.
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          <div className="flex w-full items-center justify-end space-x-2 pt-6">
            <Button disabled={loading} variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={loading} type="submit">
              Crear y Reemplazar
            </Button>
          </div>
        </form>
      </Form>
    </Modal>
  );
};
