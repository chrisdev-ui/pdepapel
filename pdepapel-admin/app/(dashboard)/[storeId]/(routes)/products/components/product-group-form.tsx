"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  DollarSign,
  Eraser,
  Loader2,
  PackageCheckIcon,
  Settings2,
  Trash,
} from "lucide-react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import z from "zod";

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
import { Heading } from "@/components/ui/heading";
import { ImageUpload } from "@/components/ui/image-upload";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { Category, Color, Design, Size, Supplier } from "@prisma/client";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getProduct } from "../[productId]/server/get-product";
import { VariantGrid } from "./variant-grid";
import { VariantMatrix } from "./variant-matrix";

const formSchema = z.object({
  name: z.string().min(1, "El nombre del grupo es requerido"),
  description: z.string().optional(),
  images: z
    .object({ url: z.string(), isMain: z.boolean().optional() })
    .array()
    .min(1, "Se requiere al menos una imagen"),
  categoryId: z.string().min(1, "La categoría es requerida"),
  sizeIds: z.array(z.string()).min(1, "Se requiere al menos un tamaño"),
  colorIds: z.array(z.string()).min(1, "Se requiere al menos un color"),
  designIds: z.array(z.string()).min(1, "Se requiere al menos un diseño"),
  defaultPrice: z.coerce.number().min(1, "El precio debe ser mayor a 0"),
  defaultCost: z.coerce
    .number()
    .min(0, "El costo no puede ser negativo")
    .optional(),
  defaultStock: z.coerce.number().min(0, "El stock no puede ser negativo"),
  defaultSupplier: z.string().optional(),
  // New: Variants Array for editing
  variants: z
    .array(
      z.object({
        id: z.string().optional(),
        sku: z.string().optional(),
        name: z.string().optional(),
        size: z.any().optional(), // Object
        color: z.any().optional(),
        design: z.any().optional(),
        price: z.coerce.number().optional(),
        acqPrice: z.coerce.number().optional(),
        stock: z.coerce.number().optional(),
        supplierId: z.string().optional(),
        isFeatured: z.boolean().default(false).optional(),
        isArchived: z.boolean().optional(),
        description: z.string().optional(),
        images: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  imageMapping: z
    .array(
      z.object({
        url: z.string(),
        scope: z.string(), // 'all', or specific attribute ID
      }),
    )
    .optional(),
  isFeatured: z.boolean().default(false).optional(),
  isArchived: z.boolean().default(false).optional(),
});

export type ProductGroupFormValues = z.infer<typeof formSchema>;

type Categories = Awaited<ReturnType<typeof getProduct>>["categories"][number];

interface ProductGroupFormProps {
  categories: Category[];
  sizes: Size[];
  colors: Color[];
  designs: Design[];
  suppliers: Supplier[];
  initialData?: any; // Allow passing the raw included data
}

export const ProductGroupForm: React.FC<ProductGroupFormProps> = ({
  categories,
  sizes,
  colors,
  designs,
  suppliers,
  initialData,
}) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  // Removed local imageScopes state in favor of form state for persistence
  const [open, setOpen] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);

  // Determine if we are in "Edit" mode
  const isEdit = !!initialData;

  // We only support Creation for now in this form
  const title = isEdit ? "Editar Grupo" : "Crear Grupo de Productos";
  const description = isEdit
    ? "Edita los detalles del grupo"
    : "Crea un nuevo grupo de productos con variantes";
  const toastMessage = isEdit
    ? "Grupo actualizado"
    : "Grupo de productos creado";
  const action = isEdit ? "Guardar Cambios" : "Crear Grupo";
  const pendingText = isEdit ? "Guardando..." : "Creando...";

  // Helper to reconstruct image mapping from existing variants
  const reconstructMapping = () => {
    if (!initialData || !initialData.products || !initialData.images) return [];

    const products = initialData.products as any[];
    const groupImages = initialData.images as { url: string }[];
    const mapping: { url: string; scope: string }[] = [];

    groupImages.forEach((img) => {
      // Find all variants that have this image
      const variantsWithImage = products.filter((p) =>
        p.images.some((pi: any) => pi.url === img.url),
      );

      if (variantsWithImage.length === 0) {
        mapping.push({ url: img.url, scope: "all" }); // Default
        return;
      }

      // 1. Check if ALL variants have it
      if (variantsWithImage.length === products.length) {
        mapping.push({ url: img.url, scope: "all" });
        return;
      }

      // 2. Check Combos (Strict) - Prioritize specific combinations over broad attributes
      let foundScope = false;
      const validCombos = new Set<string>();
      products.forEach((p) => {
        if (p.colorId && p.designId) {
          validCombos.add(`${p.colorId}|${p.designId}`);
        }
      });

      for (const combo of Array.from(validCombos)) {
        const [cId, dId] = combo.split("|");
        const variantsOfCombo = products.filter(
          (p) => p.colorId === cId && p.designId === dId,
        );
        const isExactMatch =
          variantsWithImage.length === variantsOfCombo.length &&
          variantsWithImage.every(
            (p) => p.colorId === cId && p.designId === dId,
          );

        if (isExactMatch) {
          mapping.push({ url: img.url, scope: `COMBO|${cId}|${dId}` });
          foundScope = true;
          break;
        }
      }
      if (foundScope) return;

      // 3. Check Colors
      const distinctColorIds = new Set(
        products.map((p) => p.colorId).filter(Boolean),
      );

      for (const colorId of Array.from(distinctColorIds)) {
        // Variants with this color
        const variantsOfColor = products.filter((p) => p.colorId === colorId);
        // Do they all have the image?
        const allHaveIt = variantsOfColor.every((p) =>
          p.images.some((pi: any) => pi.url === img.url),
        );
        // And is the number of variants with image equal to variants of this color?
        // (Meaning no other variants have it? simpler: check if variantsWithImage are exactly variantsOfColor)
        const isExactMatch =
          variantsWithImage.length === variantsOfColor.length &&
          variantsWithImage.every((p) => p.colorId === colorId);

        if (allHaveIt && isExactMatch) {
          mapping.push({ url: img.url, scope: colorId });
          foundScope = true;
          break;
        }
      }
      if (foundScope) return;

      // 4. Check Designs
      const distinctDesignIds = new Set(
        products.map((p) => p.designId).filter(Boolean),
      );
      for (const designId of Array.from(distinctDesignIds)) {
        const variantsOfDesign = products.filter(
          (p) => p.designId === designId,
        );
        const isExactMatch =
          variantsWithImage.length === variantsOfDesign.length &&
          variantsWithImage.every((p) => p.designId === designId);

        if (isExactMatch) {
          mapping.push({ url: img.url, scope: designId });
          foundScope = true;
          break;
        }
      }
      if (foundScope) return;

      // 4. Check Combos (Strict)
      // Moved to Step 2

      // Fallback
      mapping.push({ url: img.url, scope: "all" });
    });

    return mapping;
  };

  const defaultValues = isEdit
    ? {
        name: initialData.name,
        description: initialData.description,
        images: initialData.images || [],
        categoryId: initialData.products?.[0]?.categoryId || "",
        sizeIds: Array.from(
          new Set(initialData.products?.map((p: any) => p.sizeId) || []),
        ) as string[],
        colorIds: Array.from(
          new Set(initialData.products?.map((p: any) => p.colorId) || []),
        ) as string[],
        designIds: Array.from(
          new Set(initialData.products?.map((p: any) => p.designId) || []),
        ) as string[],
        defaultPrice: initialData.products?.[0]?.price || 0,
        defaultCost: initialData.products?.[0]?.acqPrice || 0,
        defaultStock: initialData.products?.[0]?.stock || 0,
        defaultSupplier: initialData.products?.[0]?.supplierId || "",
        imageMapping: initialData.imageMapping || reconstructMapping(),
        isFeatured: initialData.products?.[0]?.isFeatured || false,
        isArchived: initialData.products?.[0]?.isArchived || false,
        variants:
          initialData.products?.map((p: any) => ({
            id: p.id,
            sku: p.sku,
            name: p.name,
            size: p.size,
            color: p.color,
            design: p.design,
            price: p.price,
            acqPrice: p.acqPrice,
            stock: p.stock,
            supplierId: p.supplierId,
            isFeatured: p.isFeatured,
            isArchived: p.isArchived,
          })) || [],
      }
    : {
        name: "",
        description: "",
        images: [],
        categoryId: "",
        sizeIds: [],
        colorIds: [],
        designIds: [],
        defaultPrice: 0,
        defaultCost: 0,
        defaultStock: 0,
        defaultSupplier: "",
        imageMapping: [],
        isFeatured: false,
        isArchived: false,
        variants: [],
      };

  const form = useForm<ProductGroupFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  // Explicitly register imageMapping since it's a virtual field
  // This ensures getValues() returns it correctly in useFormPersist
  useEffect(() => {
    form.register("imageMapping");
  }, [form]);

  // Form Persistence
  const { clearStorage } = useFormPersist({
    form,
    key: `product-group-form-${params.storeId}-${initialData?.id ?? "new"}`,
  });

  const onClear = () => {
    form.reset(defaultValues);
    clearStorage();
    toast({
      title: "Formulario limpiado",
      description: "Los datos han sido restablecidos.",
    });
  };

  const onSubmit = async (data: ProductGroupFormValues) => {
    try {
      setLoading(true);

      // Merge scopes from form data directly (already synced)
      const mapping = data.imageMapping || [];

      if (isEdit) {
        await axios.patch(
          `/api/${params.storeId}/product-groups/${initialData.id}`,
          {
            ...data,
            imageMapping: mapping,
          },
        );
      } else {
        await axios.post(`/api/${params.storeId}/product-groups`, {
          ...data,
          imageMapping: mapping,
        });
      }

      clearStorage(); // Clear storage on success
      router.refresh();
      router.push(`/${params.storeId}/products`);
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
  };

  const onDelete = async (strict: boolean) => {
    try {
      setLoading(true);
      await axios.delete(
        `/api/${params.storeId}/product-groups/${initialData.id}?deleteVariants=${strict}`,
      );
      router.refresh();
      router.push(`/${params.storeId}/products`);
      toast({
        description: "Grupo eliminado correctamente",
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
  };

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
        style: {
          badgeColor: color.value,
        },
      })),
      designs: designs.map((design) => ({
        value: design.id,
        label: design.name,
      })),
    }),
    [categories, sizes, colors, designs],
  );

  // Helper to get selected attributes for scoping
  const selectedColorIds = form.watch("colorIds");
  const selectedDesignIds = form.watch("designIds");
  const selectedSizeIds = form.watch("sizeIds");
  const selectedCategoryId = form.watch("categoryId");
  const currentImages = form.watch("images");
  const currentVariants = form.watch("variants"); // Watch existing variants to preserve edits

  // LOGGING
  const currentMapping = form.watch("imageMapping") || [];

  const defaultPrice = form.watch("defaultPrice");
  const defaultCost = form.watch("defaultCost");
  const defaultStock = form.watch("defaultStock");
  const defaultSupplier = form.watch("defaultSupplier");

  // Smart Variant Generation Handler
  const handleMatrixConfirm = async (
    combinations: { colorId: string; designId: string }[],
  ) => {
    const { generateVariants } = await import("@/lib/variant-generator");

    const catObj = categories.find((x) => x.id === selectedCategoryId);
    const sizesObj = sizes.filter((x) => selectedSizeIds.includes(x.id));

    // We iterate combinations to ensure strict adherence
    let allGenerated: any[] = [];

    if (!catObj) return;

    for (const combo of combinations) {
      const colorObj = colors.find((x) => x.id === combo.colorId);
      const designObj = designs.find((x) => x.id === combo.designId);

      if (!colorObj || !designObj) continue;

      // Generate for all sizes for this style.
      // Note: variant-generator usually multiplies Sizes * Colors * Designs
      // Here we invoke it per single (Color, Design) pair.
      const result = generateVariants({
        category: { id: catObj.id, name: catObj.name },
        sizes: sizesObj.map((x) => ({
          id: x.id,
          name: x.name,
          value: x.value,
        })),
        colors: [
          {
            id: colorObj.id,
            name: colorObj.name,
            value: colorObj.value,
          },
        ],
        designs: [
          {
            id: designObj.id,
            name: designObj.name,
            value: designObj.name,
          },
        ],
      });
      allGenerated = [...allGenerated, ...result];
    }

    // Merge with existing
    const mergedVariants = allGenerated.map((gen: any) => {
      const existing = form
        .getValues("variants")
        ?.find(
          (v: any) =>
            v.size?.id === gen.sizeId &&
            v.color?.id === gen.colorId &&
            v.design?.id === gen.designId,
        );

      if (existing) {
        return existing;
      }

      return {
        sku: gen.sku,
        name: gen.name,
        price: defaultPrice || 0,
        acqPrice: defaultCost || 0,
        stock: defaultStock || 0,
        supplierId: defaultSupplier || "",
        isFeatured: false,
        isArchived: false,
        size: sizesObj.find((x) => x.id === gen.sizeId) || { name: "?" },
        color: colors.find((x) => x.id === gen.colorId) || { name: "?" },
        design: designs.find((x) => x.id === gen.designId) || { name: "?" },
      };
    });

    form.setValue("variants", mergedVariants);
    toast({
      description: `Se han generado ${mergedVariants.length} variantes.`,
      variant: "success",
    });
  };

  const availableScopes = useMemo(() => {
    const scopes: { label: string; value: string; disabled?: boolean }[] = [
      { label: "Todas las variantes", value: "all" },
    ];

    // Reactively extract available attributes from current variants
    const usedColorIds = new Set(currentVariants?.map((v) => v.color?.id));
    const usedDesignIds = new Set(currentVariants?.map((v) => v.design?.id));

    const activeColors = colors.filter((c) => usedColorIds.has(c.id));
    const activeDesigns = designs.filter((d) => usedDesignIds.has(d.id));

    if (activeColors.length > 0) {
      scopes.push({
        label: "--- Colores ---",
        value: "header-colors",
        disabled: true,
      });
      activeColors.forEach((c) => {
        scopes.push({ label: `Color: ${c.name}`, value: c.id });
      });
    }

    if (activeDesigns.length > 0) {
      scopes.push({
        label: "--- Diseños ---",
        value: "header-designs",
        disabled: true,
      });
      activeDesigns.forEach((d) => {
        scopes.push({ label: `Diseño: ${d.name}`, value: d.id });
      });
    }

    // Combinations
    const validPairs = new Set();
    currentVariants?.forEach((v) => {
      if (v.color?.id && v.design?.id) {
        validPairs.add(`${v.color.id}|${v.design.id}`);
      }
    });

    if (validPairs.size > 0) {
      scopes.push({
        label: "--- Combinaciones ---",
        value: "header-combinations",
        disabled: true,
      });

      colors.forEach((c) => {
        designs.forEach((d) => {
          if (validPairs.has(`${c.id}|${d.id}`)) {
            scopes.push({
              label: `${c.name} + ${d.name}`,
              value: `COMBO|${c.id}|${d.id}`,
            });
          }
        });
      });
    }

    return scopes;
  }, [currentVariants, colors, designs]);

  return (
    <>
      <div className="flex items-center justify-between">
        <Heading title={title} description={description} />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClear} type="button">
            <Eraser className="mr-2 h-4 w-4" />
            Limpiar Formulario
          </Button>
          {isEdit && (
            <Button
              disabled={loading}
              variant="destructive"
              size="icon"
              onClick={() => setOpen(true)}
            >
              <Trash className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <Separator />

      <Modal
        title="Eliminar Grupo"
        description="¿Cómo deseas eliminar este grupo?"
        isOpen={open}
        onClose={() => setOpen(false)}
      >
        <div className="flex flex-col gap-4 py-4">
          <p className="text-sm text-gray-500">
            Puedes desvincular los productos (se mantendrán como individuales) o
            eliminar todo el grupo y sus variantes (siempre que no tengan
            ventas).
          </p>
          <div className="flex w-full justify-end gap-2">
            <Button
              disabled={loading}
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              disabled={loading}
              variant="secondary"
              onClick={() => onDelete(false)}
            >
              Solo Desvincular
            </Button>
            <Button
              disabled={loading}
              variant="destructive"
              onClick={() => onDelete(true)}
            >
              Eliminar Todo
            </Button>
          </div>
        </div>
      </Modal>

      <VariantMatrix
        isOpen={matrixOpen}
        onClose={() => setMatrixOpen(false)}
        onConfirm={handleMatrixConfirm}
        colors={colors.filter((c) => selectedColorIds?.includes(c.id))}
        designs={designs.filter((d) => selectedDesignIds?.includes(d.id))}
      />

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
                <FormLabel isRequired>Imágenes del grupo</FormLabel>
                <FormControl>
                  <ImageUpload
                    value={field.value.map((v) => ({
                      ...v,
                      isMain: v.isMain ?? false,
                    }))}
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

          {currentImages?.length > 0 &&
            (selectedColorIds?.length > 0 || selectedDesignIds?.length > 0) && (
              <div className="space-y-4 rounded-md border p-4">
                <div className="space-y-1">
                  <Heading
                    title="Asignación de Imágenes"
                    description="Asigna imágenes a variantes específicas (Colores/Diseños)"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
                  {currentImages.map((img) => (
                    <div
                      key={img.url}
                      className="group relative space-y-2 rounded-md border p-2"
                    >
                      <div className="relative aspect-square overflow-hidden rounded-md border text-center">
                        <Image
                          src={img.url}
                          alt="Product Image"
                          fill
                          className="object-cover"
                        />
                      </div>
                      <Select
                        key={`${img.url}-${currentMapping.find((m) => m.url === img.url)?.scope || "all"}-${availableScopes.length}`}
                        disabled={loading}
                        value={
                          currentMapping.find((m) => m.url === img.url)
                            ?.scope || "all"
                        }
                        defaultValue={
                          currentMapping.find((m) => m.url === img.url)
                            ?.scope || "all"
                        }
                        onValueChange={(val) => {
                          const existingIndex = currentMapping.findIndex(
                            (m) => m.url === img.url,
                          );

                          let newMapping = [...currentMapping];
                          if (existingIndex >= 0) {
                            newMapping[existingIndex] = {
                              ...newMapping[existingIndex],
                              scope: val,
                            };
                          } else {
                            newMapping.push({ url: img.url, scope: val });
                          }

                          console.log(
                            "ProductGroupForm - Explicitly Setting Image Mapping:",
                            newMapping,
                          );
                          form.setValue("imageMapping", newMapping, {
                            shouldDirty: true,
                            shouldTouch: true,
                            shouldValidate: true,
                          });
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Alcance" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableScopes.map((scope) => (
                            <SelectItem
                              key={scope.value}
                              value={scope.value}
                              disabled={scope.disabled}
                              className={
                                scope.disabled
                                  ? "font-semibold opacity-100"
                                  : ""
                              }
                            >
                              {scope.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

          <div className="grid grid-cols-3 gap-8">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Nombre del Grupo</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Ej. Colección de Camisetas Verano"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="defaultPrice"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel isRequired>Precio por defecto</FormLabel>
                    <div
                      className="cursor-pointer text-xs text-primary underline hover:text-primary/80"
                      onClick={() => {
                        const val = form.getValues("defaultPrice");
                        const current = form.getValues("variants");
                        if (val && current) {
                          form.setValue(
                            "variants",
                            current.map((v: any) => ({ ...v, price: val })),
                          );
                          toast({
                            description:
                              "Precio aplicado a todas las variantes",
                          });
                        }
                      }}
                    >
                      Aplicar a todo
                    </div>
                  </div>
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
              name="defaultCost"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel isRequired>Costo por defecto</FormLabel>
                    <div
                      className="cursor-pointer text-xs text-primary underline hover:text-primary/80"
                      onClick={() => {
                        const val = form.getValues("defaultCost");
                        const current = form.getValues("variants");
                        if (val !== undefined && current) {
                          form.setValue(
                            "variants",
                            current.map((v: any) => ({ ...v, acqPrice: val })),
                          );
                          toast({
                            description: "Costo aplicado a todas las variantes",
                          });
                        }
                      }}
                    >
                      Aplicar a todo
                    </div>
                  </div>
                  <FormControl>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-3 h-4 w-4" />
                      <Input
                        type="number"
                        disabled={loading}
                        placeholder="800"
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
              name="defaultStock"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel isRequired>
                      Stock por defecto (por variante)
                    </FormLabel>
                    <div
                      className="cursor-pointer text-xs text-primary underline hover:text-primary/80"
                      onClick={() => {
                        const val = form.getValues("defaultStock");
                        const current = form.getValues("variants");
                        if (val && current) {
                          form.setValue(
                            "variants",
                            current.map((v: any) => ({ ...v, stock: val })),
                          );
                          toast({
                            description: "Stock aplicado a todas las variantes",
                          });
                        }
                      }}
                    >
                      Aplicar a todo
                    </div>
                  </div>
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
              name="defaultSupplier"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel isRequired>Proveedor por defecto</FormLabel>
                    <div
                      className="cursor-pointer text-xs text-primary underline hover:text-primary/80"
                      onClick={() => {
                        const val = form.getValues("defaultSupplier");
                        const current = form.getValues("variants");
                        if (val && current) {
                          form.setValue(
                            "variants",
                            current.map((v: any) => ({
                              ...v,
                              supplierId: val,
                            })),
                          );
                          toast({
                            description:
                              "Proveedor aplicado a todas las variantes",
                          });
                        }
                      }}
                    >
                      Aplicar a todo
                    </div>
                  </div>
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
                      Este grupo aparecerá en la pagina principal
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
                      Ocultar este grupo de la tienda
                    </FormDescription>
                  </div>
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
                    key={field.value}
                    disabled={loading}
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
              name="sizeIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Tamaños</FormLabel>
                  <FormControl>
                    <MultiSelect
                      options={selectOptions.sizes}
                      defaultValue={field.value}
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Selecciona tamaños..."
                      variant="secondary"
                      responsive
                    />
                  </FormControl>
                  <FormDescription>
                    Seleccione los tamaños disponibles para este grupo
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="colorIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Colores</FormLabel>
                  <FormControl>
                    <MultiSelect
                      options={selectOptions.colors}
                      defaultValue={field.value}
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Selecciona colores..."
                      variant="secondary"
                      responsive
                    />
                  </FormControl>
                  <FormDescription>
                    Seleccione los colores disponibles para este grupo
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="designIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Diseños</FormLabel>
                  <FormControl>
                    <MultiSelect
                      options={selectOptions.designs}
                      defaultValue={field.value}
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Selecciona diseños..."
                      variant="secondary"
                      responsive
                    />
                  </FormControl>
                  <FormDescription>
                    Seleccione los diseños disponibles para este grupo
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="col-span-3 flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMatrixOpen(true)}
                disabled={
                  !selectedColorIds?.length || !selectedDesignIds?.length
                }
              >
                <Settings2 className="mr-2 h-4 w-4" />
                Configurar Variantes
              </Button>
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="col-span-3">
                  <FormLabel isRequired>Descripción</FormLabel>
                  <FormControl>
                    <RichTextEditor
                      placeholder="Describe el grupo de productos..."
                      value={field.value || ""}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <VariantGrid
            form={form}
            loading={loading}
            images={currentImages}
            imageScopes={currentMapping.reduce(
              (acc, curr) => ({ ...acc, [curr.url]: curr.scope }),
              {},
            )}
            suppliers={suppliers}
          />

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
    </>
  );
};
