"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { DollarSign, PackageCheckIcon, Percent, Trash } from "lucide-react";
import { useForm } from "react-hook-form";
import z from "zod";

import { AlertModal } from "@/components/modals/alert-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
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
import { ImageUpload } from "@/components/ui/image-upload";
import { Input } from "@/components/ui/input";
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
  INITIAL_MISC_COST,
  INITIAL_PERCENTAGE_INCREASE,
  INITIAL_TRANSPORTATION_COST,
  Models,
} from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { Color, Design, Size, Supplier } from "@prisma/client";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getProduct } from "../server/get-product";
import { ReviewColumn, columns } from "./columns";

const formSchema = z.object({
  name: z.string().min(1, "El nombre del producto no puede estar vacío"),
  description: z.string().optional(),
  stock: z.coerce.number().min(0, "El stock no puede ser menor a 0"),
  images: z
    .object({ url: z.string(), isMain: z.boolean() })
    .array()
    .refine((images) => images.filter((img) => img.isMain).length === 1, {
      message: "Debe haber exactamente una imagen principal",
    }),
  acqPrice: z.coerce.number().min(1, "El precio de compra debe ser mayor a 0"),
  percentageIncrease: z.coerce
    .number()
    .min(0, "El porcentaje de incremento no puede ser negativo"),
  transportationCost: z.coerce
    .number()
    .min(0, "El costo de transporte no puede ser negativo"),
  miscCost: z.coerce
    .number()
    .min(0, "El costo de misceláneo no puede ser negativo"),
  price: z.coerce.number().min(1, "El precio de venta debe ser mayor a 0"),
  categoryId: z.string().min(1),
  colorId: z.string().min(1),
  sizeId: z.string().min(1),
  designId: z.string().min(1),
  supplierId: z.string().optional(),
  isFeatured: z.boolean().default(false).optional(),
  isArchived: z.boolean().default(false).optional(),
});

type ProductFormValues = z.infer<typeof formSchema>;

type Categories = Awaited<ReturnType<typeof getProduct>>["categories"][number];

type InitialData = Awaited<ReturnType<typeof getProduct>>["product"];

interface ProductFormProps {
  initialData: InitialData | null;
  categories: Categories[];
  sizes: Size[];
  colors: Color[];
  designs: Design[];
  reviews?: ReviewColumn[];
  suppliers: Supplier[];
}

export const ProductForm: React.FC<ProductFormProps> = ({
  initialData,
  categories,
  sizes,
  colors,
  designs,
  reviews,
  suppliers,
}) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const { title, description, toastMessage, action } = useMemo(
    () => ({
      title: initialData ? "Editar producto" : "Crear producto",
      description: initialData
        ? "Editar un producto"
        : "Crear un nuevo producto",
      toastMessage: initialData ? "Producto actualizado" : "Producto creado",
      action: initialData ? "Guardar cambios" : "Crear",
    }),
    [initialData],
  );

  const defaultValues = useMemo(
    () =>
      initialData
        ? {
            ...initialData,
            acqPrice: initialData.acqPrice || 0,
            supplierId: initialData.supplierId || "",
            images: initialData.images.map((image, idx) => ({
              ...image,
              isMain: idx === 0,
            })),
            percentageIncrease: INITIAL_PERCENTAGE_INCREASE,
            transportationCost: INITIAL_TRANSPORTATION_COST,
            miscCost: INITIAL_MISC_COST,
          }
        : {
            name: "",
            description: "",
            stock: 0,
            images: [],
            price: 0,
            categoryId: "",
            colorId: "",
            sizeId: "",
            designId: "",
            supplierId: "",
            isFeatured: false,
            isArchived: false,
            percentageIncrease: INITIAL_PERCENTAGE_INCREASE,
            transportationCost: INITIAL_TRANSPORTATION_COST,
            miscCost: INITIAL_MISC_COST,
          },
    [initialData],
  );

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const calculatePrice = useCallback((values: Partial<ProductFormValues>) => {
    const acqPrice = Number(values.acqPrice) || 0;
    const percentageIncrease = Number(values.percentageIncrease) || 0;
    const transportationCost = Number(values.transportationCost) || 0;
    const miscCost = Number(values.miscCost) || 0;

    if (acqPrice > 0) {
      return Number(
        (
          acqPrice * (1 + percentageIncrease / 100) +
          transportationCost +
          miscCost
        ).toFixed(2),
      );
    }
    return 0;
  }, []);

  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      const watchedFields = [
        "acqPrice",
        "percentageIncrease",
        "transportationCost",
        "miscCost",
      ];

      if (name && watchedFields.includes(name)) {
        const values = form.getValues();
        const newPrice = calculatePrice({
          acqPrice: values.acqPrice ?? 0,
          percentageIncrease: values.percentageIncrease ?? 0,
          transportationCost: values.transportationCost ?? 0,
          miscCost: values.miscCost ?? 0,
        });

        if (newPrice > 0) {
          form.setValue("price", newPrice);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [form, calculatePrice]);

  const onSubmit = useCallback(
    async (data: ProductFormValues) => {
      try {
        setLoading(true);
        if (initialData) {
          await axios.patch(
            `/api/${params.storeId}/${Models.Products}/${params.productId}`,
            data,
          );
        } else {
          await axios.post(`/api/${params.storeId}/${Models.Products}`, data);
        }
        router.refresh();
        router.push(`/${params.storeId}/${Models.Products}`);
        toast({
          description: toastMessage,
          variant: "success",
        });
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [
      params.storeId,
      params.productId,
      router,
      toast,
      initialData,
      toastMessage,
    ],
  );
  const onDelete = useCallback(async () => {
    try {
      setLoading(true);
      await axios.delete(
        `/api/${params.storeId}/${Models.Products}/${params.productId}`,
      );
      router.refresh();
      router.push(`/${params.storeId}/${Models.Products}`);
      toast({
        description: "Producto eliminado",
        variant: "success",
      });
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }, [params.storeId, params.productId, router, toast]);

  const selectOptions = useMemo(
    () => ({
      categories: categories.map((category) => ({
        value: category.id,
        label: category.name,
      })),
      sizes: sizes.map((size) => ({
        value: size.id,
        label: size.name,
      })),
      colors: colors.map((color) => ({
        value: color.id,
        label: color.name,
        color: color.value,
      })),
      designs: designs.map((design) => ({
        value: design.id,
        label: design.name,
      })),
      suppliers: suppliers.map((supplier) => ({
        value: supplier.id,
        label: supplier.name,
      })),
    }),
    [categories, sizes, colors, designs, suppliers],
  );

  return (
    <>
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onDelete}
        loading={loading}
      />
      <div className="flex items-center justify-between">
        <Heading title={title} description={description} />
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
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="w-full space-y-8"
        >
          <FormField
            control={form.control}
            name="images"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Imágenes</FormLabel>
                <FormControl>
                  <ImageUpload
                    value={field.value}
                    disabled={loading}
                    onChange={(images) => field.onChange(images)}
                    onRemove={(url) =>
                      field.onChange([
                        ...field.value.filter((current) => current.url !== url),
                      ])
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-3 gap-8">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Nombre del producto"
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
                  <FormLabel>Precio de compra</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-3 h-4 w-4" />
                      <Input
                        type="number"
                        disabled={loading}
                        placeholder="1000"
                        className="pl-8"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="percentageIncrease"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Porcentaje de incremento</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Percent className="absolute left-3 top-3 h-4 w-4" />
                      <Input
                        type="number"
                        disabled={loading}
                        placeholder="30"
                        className="pl-8"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="transportationCost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Costo de transporte</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-3 h-4 w-4" />
                      <Input
                        type="number"
                        disabled={loading}
                        placeholder="0"
                        className="pl-8"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="miscCost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Costos misceláneos</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-3 h-4 w-4" />
                      <Input
                        type="number"
                        disabled={loading}
                        placeholder="0"
                        className="pl-8"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Precio de venta (calculado)</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-3 h-4 w-4" />
                      <Input
                        type="number"
                        disabled={loading}
                        placeholder="1000"
                        className="pl-8"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="stock"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <PackageCheckIcon className="absolute left-3 top-3 h-4 w-4" />
                      <Input
                        type="number"
                        disabled={loading}
                        placeholder="10"
                        className="pl-8"
                        min="0"
                        {...field}
                      />
                    </div>
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
                  <FormLabel>Categoría</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          defaultValue={field.value}
                          placeholder="Selecciona una categoría"
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories?.length === 0 && (
                        <button
                          disabled
                          className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                        >
                          No hay resultados
                        </button>
                      )}
                      {selectOptions.categories?.length > 0 &&
                        categories.map((category) => (
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
            <FormField
              control={form.control}
              name="sizeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tamaño</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          defaultValue={field.value}
                          placeholder="Selecciona un tamaño"
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {selectOptions.sizes?.length === 0 && (
                        <button
                          disabled
                          className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                        >
                          No hay resultados
                        </button>
                      )}
                      {sizes?.length > 0 &&
                        sizes.map((size) => (
                          <SelectItem key={size.id} value={size.id}>
                            {size.name}
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
              name="colorId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          defaultValue={field.value}
                          placeholder="Selecciona un color"
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {selectOptions.colors?.length === 0 && (
                        <button
                          disabled
                          className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                        >
                          No hay resultados
                        </button>
                      )}
                      {colors?.length > 0 &&
                        colors.map((color) => (
                          <SelectItem key={color.id} value={color.id}>
                            <div className="flex items-start gap-2">
                              <span
                                className="h-5 w-5 rounded-full border"
                                style={{ backgroundColor: color.value }}
                              ></span>
                              {color.name}
                            </div>
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
              name="designId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Diseño</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          defaultValue={field.value}
                          placeholder="Selecciona un diseño"
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {selectOptions.designs?.length === 0 && (
                        <button
                          disabled
                          className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                        >
                          No hay resultados
                        </button>
                      )}
                      {designs?.length > 0 &&
                        designs.map((design) => (
                          <SelectItem key={design.id} value={design.id}>
                            {design.name}
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
                        <SelectValue
                          defaultValue={field.value}
                          placeholder="Selecciona un proveedor"
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {selectOptions.suppliers?.length === 0 && (
                        <button
                          disabled
                          className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                        >
                          No hay resultados
                        </button>
                      )}
                      {suppliers?.length > 0 &&
                        suppliers.map((design) => (
                          <SelectItem key={design.id} value={design.id}>
                            {design.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Este campo es opcional</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Agrega una descripción para el producto"
                      disabled={loading}
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isFeatured"
              render={({ field }) => (
                <FormItem className="mt-auto flex h-fit items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Destacado</FormLabel>
                    <FormDescription>
                      Este producto aparecerá en la pagina principal
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isArchived"
              render={({ field }) => (
                <FormItem className="flex h-fit items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Archivado</FormLabel>
                    <FormDescription>
                      Este producto no se mostrará en ninguna sección de la
                      tienda
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </div>
          <Button disabled={loading} className="ml-auto" type="submit">
            {action}
          </Button>
        </form>
      </Form>
      <Separator />
      <Heading title="Reseñas" description="Reseñas de este producto" />
      <Separator />
      <DataTable
        tableKey={Models.Reviews}
        searchKey="name"
        columns={columns}
        data={reviews ?? []}
      />
    </>
  );
};
