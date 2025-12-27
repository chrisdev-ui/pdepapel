"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Supplier } from "@prisma/client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import Image from "next/image";

const variantSchema = z.object({
  id: z.string().optional(),
  sku: z.string().optional(),
  name: z.string().optional(),
  size: z.any().optional(),
  color: z.any().optional(),
  design: z.any().optional(),
  price: z.coerce.number().optional(),
  acqPrice: z.coerce.number().optional(), // Costo
  stock: z.coerce.number().optional(),
  supplierId: z.string().optional(),
  isArchived: z.boolean().default(false).optional(),
  isFeatured: z.boolean().default(false).optional(), // Add isFeatured
  description: z.string().optional(),
  images: z.array(z.string()).optional(),
});

type VariantFormValues = z.infer<typeof variantSchema>;

interface VariantEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: VariantFormValues) => void;
  initialData: VariantFormValues | null;
  suppliers: Supplier[];
  groupImages: { url: string }[];
}

export const VariantEditModal: React.FC<VariantEditModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialData,
  suppliers,
  groupImages,
}) => {
  const [loading, setLoading] = useState(false);

  const form = useForm<VariantFormValues>({
    resolver: zodResolver(variantSchema),
    defaultValues: initialData || {
      isArchived: false,
      stock: 0,
      price: 0,
      acqPrice: 0,
      description: "",
      images: [],
    },
  });

  useEffect(() => {
    if (initialData) {
      form.reset(initialData);
    }
  }, [initialData, form]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    form.handleSubmit(onSubmit)(e);
  };

  const onSubmit = async (data: VariantFormValues) => {
    try {
      setLoading(true);
      // Strip virtual fields before confirming? Or let parent handle it?
      // Parent expects VariantFormValues, which now includes them.
      // But parent likely just puts them in the variants array.
      // Since they are optional, it shouldn't break anything if they are present but ignored by backend.
      onConfirm(data);
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const title = `Editar Variante: ${initialData?.name || "Variante"}`;
  const description =
    "Modifica los detalles, descripción e imágenes de esta variante.";

  return (
    <Modal
      title={title}
      description={description}
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-3xl"
    >
      <Form {...form}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <ScrollArea className="h-[60vh] px-1 pr-4">
            <div className="space-y-4 p-1">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>SKU</FormLabel>
                      <FormControl>
                        <Input
                          disabled={loading}
                          placeholder="SKU de la variante"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Nombre</FormLabel>
                      <FormControl>
                        <Input
                          disabled={loading}
                          placeholder="Nombre de la variante"
                          {...field}
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
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Precio</FormLabel>
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
                  name="acqPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Costo (Adquisición)</FormLabel>
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
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="stock"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Stock</FormLabel>
                      <FormControl>
                        <StockQuantityInput
                          disabled={loading}
                          value={Number(field.value)}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Proveedor</FormLabel>
                      <Select
                        disabled={loading}
                        onValueChange={field.onChange}
                        value={field.value}
                        defaultValue={field.value}
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
              </div>

              <FormField
                control={form.control}
                name="images"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Imágenes Específicas</FormLabel>
                    <FormDescription>
                      Selecciona las imágenes que corresponden a esta variante.
                      Si no seleccionas ninguna, se usarán las reglas
                      automáticas.
                    </FormDescription>
                    <div className="grid grid-cols-4 gap-4 pt-2">
                      {groupImages.map((image) => (
                        <div
                          key={image.url}
                          className={cn(
                            "relative aspect-square cursor-pointer overflow-hidden rounded-md border-2",
                            field.value?.includes(image.url)
                              ? "border-primary"
                              : "border-transparent",
                          )}
                          onClick={() => {
                            const currentImages = field.value || [];
                            if (currentImages.includes(image.url)) {
                              field.onChange(
                                currentImages.filter(
                                  (url) => url !== image.url,
                                ),
                              );
                            } else {
                              field.onChange([...currentImages, image.url]);
                            }
                          }}
                        >
                          <Image
                            src={image.url}
                            alt="Product Image"
                            fill
                            className="object-cover"
                          />
                          {field.value?.includes(image.url) && (
                            <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="h-3 w-3" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isArchived"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Archivado</FormLabel>
                      <FormDescription>
                        Esta variante no aparecerá en la tienda pero no será
                        eliminada.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isFeatured"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Destacado</FormLabel>
                      <FormDescription>
                        Esta variante aparecerá en la página principal.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <div className="mb-2">
                      <FormLabel>Descripción</FormLabel>
                      <FormDescription>
                        Información detallada sobre esta variante.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <RichTextEditor
                        placeholder="Descripción específica de esta variante"
                        value={field.value || ""}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </ScrollArea>

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
              Guardar Cambios
            </Button>
          </div>
        </form>
      </Form>
    </Modal>
  );
};
