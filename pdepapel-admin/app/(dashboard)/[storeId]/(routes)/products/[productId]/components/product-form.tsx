"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Eraser,
  Info,
  Loader2,
  PackageCheckIcon,
  Percent,
  Plus,
  Trash,
} from "lucide-react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import z from "zod";

import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { AlertModal } from "@/components/modals/alert-modal";
import { IntakeModal } from "@/components/modals/intake-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
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
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  INITIAL_MISC_COST,
  INITIAL_PERCENTAGE_INCREASE,
  INITIAL_TRANSPORTATION_COST,
  Models,
} from "@/constants";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
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
  productGroupId: z.string().optional(),
});

type ProductFormValues = z.infer<typeof formSchema>;

type Categories = Awaited<ReturnType<typeof getProduct>>["categories"][number];

type InitialData = Awaited<ReturnType<typeof getProduct>>["product"];

type ProductGroup = Awaited<ReturnType<typeof getProduct>>["productGroup"];
type ProductGroups = Awaited<ReturnType<typeof getProduct>>["productGroups"];

interface ProductFormProps {
  initialData: InitialData | null;
  categories: Categories[];
  sizes: Size[];
  colors: Color[];
  designs: Design[];
  reviews?: ReviewColumn[];
  suppliers: Supplier[];
  productGroup: ProductGroup;
  productGroups: ProductGroups;
}

export const ProductForm: React.FC<ProductFormProps> = ({
  initialData,
  categories,
  sizes,
  colors,
  designs,
  reviews,
  suppliers,
  productGroup,
  productGroups,
}) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const unavailableImages = useMemo(() => {
    if (!productGroup) return new Set();
    const set = new Set<string>();
    productGroup.products.forEach((p: any) => {
      // Skip current product
      if (p.id === initialData?.id) return;
      p.images.forEach((img: any) => set.add(img.url));
    });
    return set;
  }, [productGroup, initialData]);

  const onAssignImage = (url: string) => {
    form.setValue("images", [{ url, isMain: true }]);
  };

  const { title, description, toastMessage, action, pendingText } = useMemo(
    () => ({
      title: initialData ? "Editar producto" : "Crear producto",
      description: initialData
        ? "Editar un producto"
        : "Crear un nuevo producto",
      toastMessage: initialData ? "Producto actualizado" : "Producto creado",
      action: initialData ? "Guardar cambios" : "Crear",
      pendingText: initialData ? "Actualizando..." : "Creando...",
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
            productGroupId: initialData.productGroupId || "",
            stock: initialData.stock,
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
            productGroupId: productGroup?.id || "",
          },
    [initialData, productGroup],
  );

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const { clearStorage } = useFormPersist({
    form,
    key: `product-form-${params.storeId}-${initialData?.id ?? "new"}`,
  });

  useFormValidationToast({ form });

  const onClear = async () => {
    const currentImages = form.getValues("images") || [];
    const currentUrls = currentImages
      .map((img: any) => img.url)
      .filter(Boolean);

    const initialUrls = new Set<string>();
    if (initialData && initialData.images) {
      initialData.images.forEach((img: any) => initialUrls.add(img.url));
    }

    const imagesToDelete = currentUrls.filter(
      (url: string) => !initialUrls.has(url),
    );

    if (imagesToDelete.length > 0) {
      const { cleanupImages } = await import("@/actions/cleanup-images");
      await cleanupImages(imagesToDelete);
    }

    form.reset(defaultValues);
    clearStorage();
    toast({
      title: "Formulario limpiado",
      description: "Los datos han sido restablecidos.",
    });
  };

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

  const watchedGroupId = form.watch("productGroupId");
  const watchedColorId = form.watch("colorId");
  const watchedSizeId = form.watch("sizeId");
  const watchedDesignId = form.watch("designId");

  useEffect(() => {
    if (watchedGroupId) {
      const selectedGroup = productGroups?.find((g) => g.id === watchedGroupId);
      if (selectedGroup && selectedGroup.products.length > 0) {
        // 1. Auto-Inherit Category from the first product in the group
        const groupCategory = selectedGroup.products[0].categoryId;
        const currentCategory = form.getValues("categoryId");
        if (groupCategory && groupCategory !== currentCategory) {
          form.setValue("categoryId", groupCategory);
          toast({
            title: "Categoría Actualizada",
            description: `La categoría se ha ajustado a "${categories.find((c) => c.id === groupCategory)?.name}" para coincidir con el grupo.`,
          });
        }
      }
    }
  }, [watchedGroupId, productGroups, form, categories, toast]);

  // Collision Detection
  const collisionError = useMemo(() => {
    if (
      !watchedGroupId ||
      !watchedColorId ||
      !watchedSizeId ||
      !watchedDesignId
    )
      return null;

    const selectedGroup = productGroups?.find((g) => g.id === watchedGroupId);
    if (!selectedGroup) return null;

    const existingVariant = selectedGroup.products.find(
      (p) =>
        p.colorId === watchedColorId &&
        p.sizeId === watchedSizeId &&
        p.designId === watchedDesignId &&
        p.id !== initialData?.id, // Exclude self if editing
    );

    if (existingVariant) {
      return "Esta combinación (Color + Tamaño + Diseño) ya existe en este grupo.";
    }
    return null;
  }, [
    watchedGroupId,
    watchedColorId,
    watchedSizeId,
    watchedDesignId,
    productGroups,
    initialData,
  ]);

  const onSubmit = useCallback(
    async (data: ProductFormValues) => {
      if (collisionError) {
        toast({
          title: "Error de validación",
          description: collisionError,
          variant: "destructive",
        });
        return;
      }
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
        clearStorage();
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
      collisionError,
      clearStorage,
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClear} type="button">
            <Eraser className="mr-2 h-4 w-4" />
            Limpiar Formulario
          </Button>
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
      </div>
      <Separator />
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="w-full space-y-8"
        >
          {productGroup && (
            <div className="mb-8 space-y-4 rounded-md border p-4">
              <div className="flex items-center justify-between">
                <Heading
                  title="Galería del Grupo"
                  description="Selecciona una imagen del grupo para asignarla a este producto (Imágenes únicas por variante)"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
                {productGroup.images?.map((img) => {
                  const isUnavailable = unavailableImages.has(img.url);
                  const isSelected = form.watch("images")?.[0]?.url === img.url;

                  return (
                    <div
                      key={img.url}
                      className={`relative aspect-square cursor-pointer overflow-hidden rounded-md border-2 ${isSelected ? "border-black" : "border-transparent"} ${isUnavailable ? "cursor-not-allowed opacity-40" : "hover:opacity-80"}`}
                      onClick={() => !isUnavailable && onAssignImage(img.url)}
                    >
                      <Image
                        src={img.url}
                        alt="Group Image"
                        className="h-full w-full object-cover"
                        width={200}
                        height={200}
                        unoptimized
                      />
                      {isUnavailable && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                          <span className="rounded bg-black/50 px-2 py-1 text-xs text-white">
                            Asignada
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <FormField
            control={form.control}
            name="images"
            render={({ field }) => (
              <FormItem>
                <FormLabel isRequired>Imágenes del Producto</FormLabel>
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
                  <FormLabel isRequired>Nombre</FormLabel>
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
                  <FormLabel isRequired>Precio de compra</FormLabel>
                  <FormControl>
                    <CurrencyInput
                      placeholder="$ 1.000"
                      disabled={loading}
                      value={field.value}
                      onChange={field.onChange}
                    />
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
                  <FormLabel isRequired>Porcentaje de incremento</FormLabel>
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
                  <FormLabel isRequired>Costo de transporte</FormLabel>
                  <FormControl>
                    <CurrencyInput
                      placeholder="$ 0"
                      disabled={loading}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="productGroupId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Asignar a Grupo</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un grupo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">-- Ninguno --</SelectItem>
                      {productGroups?.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    El producto heredará la categoría del grupo.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="miscCost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Costos misceláneos</FormLabel>
                  <FormControl>
                    <CurrencyInput
                      placeholder="$ 0"
                      disabled={loading}
                      value={field.value}
                      onChange={field.onChange}
                    />
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
                  <FormLabel isRequired>Precio de venta (calculado)</FormLabel>
                  <FormControl>
                    <CurrencyInput
                      placeholder="$ 1.000"
                      disabled={loading}
                      value={field.value}
                      onChange={field.onChange}
                    />
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
                  <FormLabel isRequired className="flex items-center gap-2">
                    Cantidad
                    {!initialData && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 cursor-pointer text-muted-foreground transition-colors hover:text-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-[200px] text-xs">
                              Esta cantidad generará un nuevo movimiento en el
                              inventario para este producto una vez creado.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </FormLabel>
                  {initialData ? (
                    // EDIT MODE: Show read-only display with IntakeModal button
                    <>
                      <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="rounded-full bg-primary/10 p-1">
                            <PackageCheckIcon className="h-4 w-4 text-primary" />
                          </div>
                          <span className="text-sm font-semibold">
                            {field.value ?? 0}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="mr-1 rounded border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            Inventario
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setIntakeOpen(true)}
                            title="Agregar Stock"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <FormControl>
                        <Input type="hidden" {...field} />
                      </FormControl>
                    </>
                  ) : (
                    // CREATE MODE: Show editable stock input
                    <FormControl>
                      <StockQuantityInput
                        disabled={loading}
                        value={field.value}
                        onChange={field.onChange}
                        min={0}
                      />
                    </FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {initialData && (
              <IntakeModal
                isOpen={intakeOpen}
                onClose={() => setIntakeOpen(false)}
                productId={initialData.id}
                productName={initialData.name}
                defaultCost={form.watch("acqPrice") || 0}
                defaultSupplierId={initialData.supplierId || ""}
                suppliers={suppliers}
              />
            )}
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Categoría</FormLabel>
                  <Select
                    key={field.value}
                    disabled={
                      loading || (!!watchedGroupId && watchedGroupId !== "none")
                    }
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una categoría" />
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
                  <FormLabel isRequired>Tamaño</FormLabel>
                  <Select
                    key={field.value}
                    disabled={
                      loading || (!!watchedGroupId && watchedGroupId !== "none")
                    }
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un tamaño" />
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
                  {!!watchedGroupId && watchedGroupId !== "none" && (
                    <FormDescription>
                      Gestionado por el Grupo de Productos
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="colorId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Color</FormLabel>
                  <Select
                    key={field.value}
                    disabled={
                      loading || (!!watchedGroupId && watchedGroupId !== "none")
                    }
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un color" />
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

                  {!!watchedGroupId && watchedGroupId !== "none" && (
                    <FormDescription>
                      Gestionado por el Grupo de Productos
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="designId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Diseño</FormLabel>
                  <Select
                    key={field.value}
                    disabled={
                      loading || (!!watchedGroupId && watchedGroupId !== "none")
                    }
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un diseño" />
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

                  {!!watchedGroupId && watchedGroupId !== "none" && (
                    <FormDescription>
                      Gestionado por el Grupo de Productos
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {collisionError && (
              <div className="col-span-3 rounded-md bg-destructive/15 p-4 text-sm text-destructive">
                <div className="flex items-center font-medium">
                  <span className="mr-2">⚠️</span>
                  Conflicto de Variantes Detectado
                </div>
                <div className="mt-1">{collisionError}</div>
              </div>
            )}

            <FormField
              control={form.control}
              name="supplierId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Proveedor</FormLabel>
                  <Select
                    key={field.value}
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
                    <FormLabel isRequired>Destacado</FormLabel>
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
                <FormItem className="mt-auto flex h-fit items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel isRequired>Archivado</FormLabel>
                    <FormDescription>
                      Este producto no se mostrará en ninguna sección de la
                      tienda
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="col-span-3">
                  <FormLabel isRequired>Descripción</FormLabel>
                  <FormControl>
                    <RichTextEditor
                      placeholder="Describe las características y beneficios del producto 🚀..."
                      value={field.value || ""}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormDescription>
                    Utiliza el editor para dar formato al texto con negritas,
                    cursivas, listas y más.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Button disabled={loading} className="ml-auto" type="submit">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {pendingText}
              </>
            ) : (
              action
            )}
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
