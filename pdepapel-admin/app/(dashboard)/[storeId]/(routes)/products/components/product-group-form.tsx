"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Eraser,
  Loader2,
  PackageCheckIcon,
  Percent,
  Settings2,
  Trash,
} from "lucide-react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import z from "zod";

import { RichTextEditor } from "@/components/editor/rich-text-editor";
import {
  BatchIntakeModal,
  BatchIntakeVariant,
} from "@/components/modals/batch-intake-modal";
import { ProductImportModal } from "@/components/modals/product-import-modal";
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
import {
  INITIAL_MISC_COST,
  INITIAL_PERCENTAGE_INCREASE,
  INITIAL_TRANSPORTATION_COST,
} from "@/constants";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import {
  Category,
  Color,
  Design,
  Image as PrismaImage,
  Product,
  ProductGroup,
  Size,
  Supplier,
} from "@prisma/client";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
  // Pricing Fields (Replaces defaultPrice/defaultCost)
  acqPrice: z.coerce
    .number()
    .min(0, "El precio de compra debe ser mayor o igual a 0"),
  percentageIncrease: z.coerce.number().min(0),
  transportationCost: z.coerce.number().min(0),
  miscCost: z.coerce.number().min(0),
  price: z.coerce.number().min(1, "El precio de venta debe ser mayor a 0"),
  defaultStock: z.coerce.number().min(0, "El stock no puede ser negativo"),
  defaultSupplier: z.string().optional(),
  // New: Variants Array for editing
  variants: z
    .array(
      z.object({
        id: z.string().optional(),
        sku: z.string().optional(),
        name: z.string().optional(),
        size: z
          .object({
            id: z.string(),
            name: z.string(),
            value: z.string().optional(),
          })
          .optional(),
        color: z
          .object({
            id: z.string(),
            name: z.string(),
            value: z.string().optional(),
          })
          .optional(),
        design: z.object({ id: z.string(), name: z.string() }).optional(),
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

// Shared Variant Interface to use across logic
export interface FormVariant {
  id?: string;
  sku?: string;
  name?: string;
  size?: { id: string; name: string; value?: string };
  color?: { id: string; name: string; value?: string };
  design?: { id: string; name: string; value?: string }; // Added value optional to match generic usage
  price?: number;
  acqPrice?: number;
  stock?: number;
  supplierId?: string;
  isFeatured?: boolean;
  isArchived?: boolean;
  description?: string;
  images?: string[];
}

export type ProductGroupWithIncludes = ProductGroup & {
  images: PrismaImage[];
  products: (Product & {
    images: PrismaImage[];
    size: Size | null;
    color: Color | null;
    design: Design | null;
  })[];
  imageMapping?: { url: string; scope: string }[];
};

interface ProductGroupFormProps {
  categories: Category[];
  sizes: Size[];
  colors: Color[];
  designs: Design[];
  suppliers: Supplier[];
  initialData?: ProductGroupWithIncludes | null;
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
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const [open, setOpen] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [batchIntakeOpen, setBatchIntakeOpen] = useState(false);
  const [batchIntakeVariants, setBatchIntakeVariants] = useState<
    BatchIntakeVariant[]
  >([]);

  // Determine if we are in "Edit" mode
  const isEdit = !!initialData;

  // We only support Creation for now in this form
  const title = isEdit ? "Editar Grupo" : "Crear Grupo";
  const description = isEdit
    ? "Editar grupo de productos"
    : "Agregar un nuevo grupo de productos con variantes";
  const toastMessage = isEdit
    ? "Grupo actualizado"
    : "Grupo de productos creado";
  const action = isEdit ? "Guardar Cambios" : "Crear Grupo";
  const pendingText = isEdit ? "Guardando..." : "Creando...";

  const reconstructMapping = (
    imagesOverride?: { url: string }[],
    productsOverride?: (
      | FormVariant
      | ProductGroupWithIncludes["products"][number]
    )[],
  ) => {
    // If we have overrides, we don't need initialData checks
    if (
      !imagesOverride &&
      !productsOverride &&
      (!initialData || !initialData.products)
    )
      return [];

    const products =
      productsOverride ||
      (initialData?.products as ProductGroupWithIncludes["products"][number][]) ||
      [];
    const groupImages =
      imagesOverride || (initialData?.images as { url: string }[]) || [];
    const mapping: { url: string; scope: string }[] = [];

    // Valid item types for mapping
    type MappingItem =
      | FormVariant
      | ProductGroupWithIncludes["products"][number];

    // Helper to get ID regardless of shape
    const getId = (item: MappingItem, key: "color" | "size" | "design") => {
      // Check for nested object (FormVariant) first if it exists
      if (key === "color" && item.color && typeof item.color === "object")
        return item.color.id;
      if (key === "size" && item.size && typeof item.size === "object")
        return item.size.id;
      if (key === "design" && item.design && typeof item.design === "object")
        return item.design.id;

      // Fallback to flat properties if they exist (Prisma Product)
      // We need to cast as 'any' safely or use 'in' check to access flat props if they aren't on FormVariant
      const flatKey = `${key}Id` as keyof MappingItem;
      if (flatKey in item) {
        return (item as Record<string, any>)[flatKey];
      }
      return undefined;
    };

    const getImages = (item: MappingItem): string[] => {
      if (!item.images) return [];
      if (Array.isArray(item.images)) {
        if (item.images.length === 0) return [];
        // Check first item
        const first = item.images[0];
        if (typeof first === "string") return item.images as string[];
        // Otherwise it's PrismaImage[]
        return (item.images as { url: string }[]).map((img) => img.url);
      }
      return [];
    };

    groupImages.forEach((img) => {
      // Find all variants that have this image
      const variantsWithImage = products.filter((p) =>
        getImages(p).some((url: string) => url === img.url),
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
        const cId = getId(p, "color");
        const dId = getId(p, "design");
        if (cId && dId) {
          validCombos.add(`${cId}|${dId}`);
        }
      });

      for (const combo of Array.from(validCombos)) {
        const [cId, dId] = combo.split("|");
        const variantsOfCombo = products.filter(
          (p) => getId(p, "color") === cId && getId(p, "design") === dId,
        );
        const isExactMatch =
          variantsWithImage.length === variantsOfCombo.length &&
          variantsWithImage.every(
            (p) => getId(p, "color") === cId && getId(p, "design") === dId,
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
        products.map((p) => getId(p, "color")).filter(Boolean),
      );

      for (const colorId of Array.from(distinctColorIds)) {
        // Variants with this color
        const variantsOfColor = products.filter(
          (p) => getId(p, "color") === colorId,
        );
        // Do they all have the image?
        const allHaveIt = variantsOfColor.every((p) =>
          getImages(p).some((url: string) => url === img.url),
        );
        // And is the number of variants with image equal to variants of this color?
        const isExactMatch =
          variantsWithImage.length === variantsOfColor.length &&
          variantsWithImage.every((p) => getId(p, "color") === colorId);

        if (allHaveIt && isExactMatch) {
          mapping.push({ url: img.url, scope: colorId });
          foundScope = true;
          break;
        }
      }
      if (foundScope) return;

      // 4. Check Designs
      const distinctDesignIds = new Set(
        products.map((p) => getId(p, "design")).filter(Boolean),
      );
      for (const designId of Array.from(distinctDesignIds)) {
        const variantsOfDesign = products.filter(
          (p) => getId(p, "design") === designId,
        );
        const isExactMatch =
          variantsWithImage.length === variantsOfDesign.length &&
          variantsWithImage.every((p) => getId(p, "design") === designId);

        if (isExactMatch) {
          mapping.push({ url: img.url, scope: designId });
          foundScope = true;
          break;
        }
      }
      if (foundScope) return;

      // Fallback
      mapping.push({ url: img.url, scope: "all" });
    });

    return mapping;
  };

  const getAllImages = () => {
    if (!initialData) return [];
    const groupImages = initialData.images || [];
    const variantImages =
      initialData.products?.flatMap((p) => p.images || []) || [];

    const map = new Map<string, { url: string; isMain: boolean }>();
    // Group images have isMain flag - preserve it
    groupImages.forEach((img) =>
      map.set(img.url, { url: img.url, isMain: img.isMain ?? false }),
    );
    variantImages.forEach((img) => {
      if (!map.has(img.url)) {
        // Variant-only images are not main by default
        map.set(img.url, { url: img.url, isMain: false });
      }
    });
    return Array.from(map.values());
  };

  const defaultValues: ProductGroupFormValues = initialData
    ? {
        name: initialData.name,
        description: initialData.description || "",
        images: getAllImages(),
        categoryId: initialData.products?.[0]?.categoryId || "",
        sizeIds: Array.from(
          new Set(initialData.products?.map((p) => p.sizeId) || []),
        ),
        colorIds: Array.from(
          new Set(initialData.products?.map((p) => p.colorId) || []),
        ).filter(Boolean) as string[],
        designIds: Array.from(
          new Set(initialData.products?.map((p) => p.designId) || []),
        ).filter(Boolean) as string[],
        // Mapping old fields to new fields
        acqPrice: initialData.products?.[0]?.acqPrice || 0,
        percentageIncrease: INITIAL_PERCENTAGE_INCREASE,
        transportationCost: INITIAL_TRANSPORTATION_COST,
        miscCost: INITIAL_MISC_COST,
        price: initialData.products?.[0]?.price || 0,
        defaultStock: initialData.products?.[0]?.stock || 0,
        defaultSupplier: initialData.products?.[0]?.supplierId || "",
        imageMapping:
          initialData.imageMapping ||
          reconstructMapping(getAllImages(), initialData.products),
        isFeatured: initialData.products?.[0]?.isFeatured || false,
        isArchived: initialData.products?.[0]?.isArchived || false,
        variants:
          initialData.products?.map((p) => ({
            id: p.id,
            sku: p.sku,
            name: p.name,
            size: p.size
              ? { id: p.size.id, name: p.size.name, value: p.size.value }
              : undefined,
            color: p.color
              ? { id: p.color.id, name: p.color.name, value: p.color.value }
              : undefined,
            design: p.design
              ? { id: p.design.id, name: p.design.name }
              : undefined,
            price: p.price,
            acqPrice: p.acqPrice || 0,
            stock: p.stock,
            supplierId: p.supplierId || "",
            isFeatured: p.isFeatured,
            isArchived: p.isArchived,
            images: p.images.map((img) => img.url),
            description: p.description || "",
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
        acqPrice: 0,
        percentageIncrease: INITIAL_PERCENTAGE_INCREASE,
        transportationCost: INITIAL_TRANSPORTATION_COST,
        miscCost: INITIAL_MISC_COST,
        price: 0,
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
  useEffect(() => {
    form.register("imageMapping");
  }, [form]);

  // Price Calculation Logic
  const calculatePrice = (values: Partial<ProductGroupFormValues>) => {
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
  };

  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      const watchedFields = [
        "acqPrice",
        "percentageIncrease",
        "transportationCost",
        "miscCost",
        "defaultSupplier",
        "defaultStock",
      ];

      if (name && watchedFields.includes(name)) {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
          const values = form.getValues();
          const newPrice = calculatePrice({
            acqPrice: values.acqPrice ?? 0,
            percentageIncrease: values.percentageIncrease ?? 0,
            transportationCost: values.transportationCost ?? 0,
            miscCost: values.miscCost ?? 0,
          });

          if (newPrice > 0) {
            form.setValue("price", newPrice);

            // Sync variants - REACTIVE UPDATE
            const currentVariants = form.getValues("variants") || [];
            const updatedVariants = currentVariants.map((v) => ({
              ...v,
              price: newPrice,
              acqPrice: values.acqPrice ?? 0,
              supplierId: values.defaultSupplier || v.supplierId,
              stock: values.defaultStock || 0,
            }));

            if (updatedVariants.length > 0) {
              form.setValue("variants", updatedVariants);
            }
          }
        }, 500);
      }
    });
    return () => {
      subscription.unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [form]);

  const watchedColorIds = form.watch("colorIds");
  const watchedSizeIds = form.watch("sizeIds");
  const watchedDesignIds = form.watch("designIds");
  const watchedCategoryId = form.watch("categoryId");

  // AUTO-SYNC VARIANTS HOOK
  useEffect(() => {
    // We only trigger if explicit attributes are selected.
    const timer = setTimeout(async () => {
      if (
        !watchedCategoryId ||
        (watchedColorIds.length === 0 &&
          watchedSizeIds.length === 0 &&
          watchedDesignIds.length === 0)
      ) {
        return;
      }

      const { generateVariants } = await import("@/lib/variant-generator");
      const catObj = categories.find((x) => x.id === watchedCategoryId);
      const sizesObj = sizes.filter((x) => watchedSizeIds.includes(x.id));
      const colorsObj = colors.filter((x) => watchedColorIds.includes(x.id));
      const designsObj = designs.filter((x) => watchedDesignIds.includes(x.id));

      if (!catObj) return;

      // 1. Generate Matrix
      const sList = sizesObj.length > 0 ? sizesObj : [];
      const cList = colorsObj.length > 0 ? colorsObj : [];
      const dList = designsObj.length > 0 ? designsObj : [];

      if (sList.length === 0 || cList.length === 0 || dList.length === 0) {
        return;
      }

      // POSITIVE LOGIC CHANGE:
      // If we have BOTH Colors and Designs, we REQUIRE the user to use the Matrix.
      // We do NOT auto-generate here to avoid pollution.
      if (cList.length > 0 && dList.length > 0) {
        return;
      }

      const result = generateVariants({
        category: { id: catObj.id, name: catObj.name },
        sizes: sList.map((x) => ({
          id: x.id,
          name: x.name,
          value: x.value ?? "",
        })),
        colors: cList.map((x) => ({ id: x.id, name: x.name, value: x.value })),
        designs: dList.map((x) => ({ id: x.id, name: x.name, value: x.name })),
      });

      const generatedVariants = result;

      // 2. Diff and Merge
      const currentVars = form.getValues("variants") || [];
      const mergedVariants: FormVariant[] = [];
      const usedCurrentIndices = new Set<number>();

      for (const gen of generatedVariants) {
        // 1. Find EXACT match in current (by Attributes)
        let matchIndex = currentVars.findIndex(
          (v, idx) =>
            !usedCurrentIndices.has(idx) &&
            v.size?.id === gen.sizeId &&
            v.color?.id === gen.colorId &&
            v.design?.id === gen.designId,
        );

        if (matchIndex !== -1) {
          // PRESERVE EXACT
          usedCurrentIndices.add(matchIndex);
          mergedVariants.push(currentVars[matchIndex]);
        } else {
          // 2. Fallback: Find SOFT match (Adoption)
          matchIndex = currentVars.findIndex((v, idx) => {
            if (usedCurrentIndices.has(idx)) return false;

            // Check attributes: If v has it, it must match. If v doesn't have it, we consider it a match (allow adoption).
            const sizeMatch = !v.size?.id || v.size.id === gen.sizeId;
            const colorMatch = !v.color?.id || v.color.id === gen.colorId;
            const designMatch = !v.design?.id || v.design.id === gen.designId;

            // We require at least one attribute to be present and matching to avoid adopting completely blank/random items
            return sizeMatch && colorMatch && designMatch;
          });

          if (matchIndex !== -1) {
            // ADOPT & UPDATE
            usedCurrentIndices.add(matchIndex);
            const existing = currentVars[matchIndex];
            mergedVariants.push({
              ...existing,
              // Update missing attributes so they stick to this slot
              size: existing.size?.id
                ? existing.size
                : sizesObj.find((x) => x.id === gen.sizeId)?.id
                  ? {
                      id: sizesObj.find((x) => x.id === gen.sizeId)!.id,
                      name: sizesObj.find((x) => x.id === gen.sizeId)!.name,
                      value: sizesObj.find((x) => x.id === gen.sizeId)!.value,
                    }
                  : { id: "unknown", name: "?" },
              color: existing.color?.id
                ? existing.color
                : colorsObj.find((x) => x.id === gen.colorId)?.id
                  ? {
                      id: colorsObj.find((x) => x.id === gen.colorId)!.id,
                      name: colorsObj.find((x) => x.id === gen.colorId)!.name,
                      value: colorsObj.find((x) => x.id === gen.colorId)!.value,
                    }
                  : { id: "unknown", name: "?" },
              design: existing.design?.id
                ? existing.design
                : designsObj.find((x) => x.id === gen.designId)?.id
                  ? {
                      id: designsObj.find((x) => x.id === gen.designId)!.id,
                      name: designsObj.find((x) => x.id === gen.designId)!.name,
                    }
                  : { id: "unknown", name: "?" },
            });
          } else {
            // 3. ADD NEW
            mergedVariants.push({
              sku: gen.sku,
              name: gen.name,
              price: form.getValues("price") || 0,
              acqPrice: form.getValues("acqPrice") || 0,
              stock: form.getValues("defaultStock") || 0,
              supplierId: form.getValues("defaultSupplier") || "",
              isFeatured: false,
              isArchived: false,
              size: sizesObj.find((x) => x.id === gen.sizeId)
                ? {
                    id: sizesObj.find((x) => x.id === gen.sizeId)!.id,
                    name: sizesObj.find((x) => x.id === gen.sizeId)!.name,
                    value: sizesObj.find((x) => x.id === gen.sizeId)!.value,
                  }
                : { id: "unknown", name: "?" },
              color: colorsObj.find((x) => x.id === gen.colorId)
                ? {
                    id: colorsObj.find((x) => x.id === gen.colorId)!.id,
                    name: colorsObj.find((x) => x.id === gen.colorId)!.name,
                    value: colorsObj.find((x) => x.id === gen.colorId)!.value,
                  }
                : { id: "unknown", name: "?" },
              design: designsObj.find((x) => x.id === gen.designId)
                ? {
                    id: designsObj.find((x) => x.id === gen.designId)!.id,
                    name: designsObj.find((x) => x.id === gen.designId)!.name,
                  }
                : { id: "unknown", name: "?" },
            });
          }
        }
      }

      // Update State
      if (JSON.stringify(mergedVariants) !== JSON.stringify(currentVars)) {
        form.setValue("variants", mergedVariants, { shouldDirty: true });
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [
    watchedColorIds,
    watchedSizeIds,
    watchedDesignIds,
    watchedCategoryId,
    categories,
    sizes,
    colors,
    designs,
    form,
  ]);

  // Form Persistence
  const { clearStorage } = useFormPersist({
    form,
    key: `product-group-form-${params.storeId}-${initialData?.id ?? "new"}`,
  });

  useFormValidationToast({ form });

  const onClear = async () => {
    // Diff Logic to clean up orphan images
    const currentGroupImages = form.getValues("images") || [];
    const currentVariants = form.getValues("variants") || [];

    const currentUrls = new Set<string>();
    currentGroupImages.forEach((img) => img.url && currentUrls.add(img.url));
    currentVariants.forEach((v) => {
      if (v.images && Array.isArray(v.images)) {
        v.images.forEach((url) => url && currentUrls.add(url));
      }
    });

    const initialUrls = new Set<string>();
    if (initialData) {
      if (initialData.images && Array.isArray(initialData.images)) {
        initialData.images.forEach(
          (img) => img.url && initialUrls.add(img.url),
        );
      }
      if (initialData.products && Array.isArray(initialData.products)) {
        initialData.products.forEach((p) => {
          if (p.images && Array.isArray(p.images)) {
            p.images.forEach((img) => img.url && initialUrls.add(img.url));
          }
        });
      }
    }

    const imagesToDelete = Array.from(currentUrls).filter(
      (url) => !initialUrls.has(url),
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

  const onSubmit = async (data: ProductGroupFormValues) => {
    try {
      setLoading(true);

      // Merge scopes from form data directly (already synced)
      const mapping = data.imageMapping || [];

      if (initialData) {
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
      if (!initialData) return;
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

  const currentPrice = form.watch("price");
  const currentAcqPrice = form.watch("acqPrice");
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
    type GenVariant = {
      sizeId: string;
      colorId: string;
      designId: string;
      sku: string;
      name: string;
    };
    let allGenerated: GenVariant[] = [];

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
          value: x.value ?? "",
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

    // STRICT POSITIVE LOGIC:
    // We only keep variants that are in 'allGenerated'.
    // Anything else is implicitly deleted (unless we want to preserve partial matches, but the user asked for strictness).

    const currentVars = form.getValues("variants") || [];
    const usedIndices = new Set<number>();
    const finalVariants: FormVariant[] = [];

    for (const gen of allGenerated) {
      // 1. Exact Match Check
      const matchIndex = currentVars.findIndex(
        (v) =>
          v.size?.id === gen.sizeId &&
          v.color?.id === gen.colorId &&
          v.design?.id === gen.designId,
      );

      if (matchIndex !== -1) {
        // KEEP EXISTING (Update metadata if needed, but keep ID and Stock)
        usedIndices.add(matchIndex);
        finalVariants.push(currentVars[matchIndex]);
      } else {
        // CREATE NEW
        finalVariants.push({
          sku: gen.sku,
          name: gen.name,
          price: currentPrice || 0,
          acqPrice: currentAcqPrice || 0,
          stock: defaultStock || 0,
          supplierId: defaultSupplier || "",
          isFeatured: false,
          isArchived: false,
          size: sizesObj.find((x) => x.id === gen.sizeId)
            ? {
                id: sizesObj.find((x) => x.id === gen.sizeId)!.id,
                name: sizesObj.find((x) => x.id === gen.sizeId)!.name,
                value: sizesObj.find((x) => x.id === gen.sizeId)!.value,
              }
            : { id: "unknown", name: "?" },
          color: colors.find((x) => x.id === gen.colorId)
            ? {
                id: colors.find((x) => x.id === gen.colorId)!.id,
                name: colors.find((x) => x.id === gen.colorId)!.name,
                value: colors.find((x) => x.id === gen.colorId)!.value,
              }
            : { id: "unknown", name: "?" },
          design: designs.find((x) => x.id === gen.designId)
            ? {
                id: designs.find((x) => x.id === gen.designId)!.id,
                name: designs.find((x) => x.id === gen.designId)!.name,
              }
            : { id: "unknown", name: "?" },
        });
      }
    }

    // We do NOT add back remaining `currentVars`. This enforces the "Selected Only" rule.

    form.setValue("variants", finalVariants, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    toast({
      description: `Se han generado ${allGenerated.length} variantes.`,
      variant: "success",
    });
  };

  interface ImportedProduct {
    id: string;
    name: string;
    category: { id: string; name: string };
    size?: { id: string; name: string; value: string };
    color?: { id: string; name: string; value: string };
    design?: { id: string; name: string };
    images: { url: string }[];
    price: number;
    // Optional fields (might not be typed in Modal but present in API response)
    acqPrice?: number;
    stock?: number;
    supplierId?: string;
    isFeatured?: boolean;
    isArchived?: boolean;
    sku?: string;
  }

  // Handle Import from Standalone Products
  const handleImport = (products: ImportedProduct[]) => {
    if (!products.length) return;

    // 1. Determine Category (Verify consistency)
    // The modal enforces filtering, so we take the first one's category if form blank
    const firstCat = products[0].category.id;
    const currentCat = form.getValues("categoryId");

    if (!currentCat) {
      form.setValue("categoryId", firstCat);
    } else if (
      currentCat !== firstCat &&
      products.some((p) => p.category.id !== currentCat)
    ) {
      toast({
        title: "Advertencia de Categoría",
        description:
          "Algunos productos importados no coinciden con la categoría actual. Verifica la consistencia.",
        variant: "destructive",
      });
      // We allow proceed but warn? Or strictly enforce?
      // Modal enforces, so this is just a safety check.
    }

    // 2. Merge Attributes (Sizes, Colors, Designs)
    const currentSizes = new Set(form.getValues("sizeIds"));
    const currentColors = new Set(form.getValues("colorIds"));
    const currentDesigns = new Set(form.getValues("designIds"));

    products.forEach((p) => {
      if (p.size?.id) currentSizes.add(p.size.id);
      if (p.color?.id) currentColors.add(p.color.id);
      if (p.design?.id) currentDesigns.add(p.design.id);
    });

    form.setValue("sizeIds", Array.from(currentSizes));
    form.setValue("colorIds", Array.from(currentColors));
    form.setValue("designIds", Array.from(currentDesigns));

    // 3. Smart Image Aggregation
    const existingImages = form.getValues("images") || [];
    const existingUrls = new Set(existingImages.map((img) => img.url));
    const newImages: { url: string; isMain: boolean }[] = [];

    products.forEach((p) => {
      if (p.images && p.images.length > 0) {
        p.images.forEach((img) => {
          if (!existingUrls.has(img.url)) {
            existingUrls.add(img.url);
            newImages.push({ url: img.url, isMain: false });
          }
        });
      }
    });

    if (newImages.length > 0) {
      form.setValue("images", [...existingImages, ...newImages]);
      toast({
        description: `${newImages.length} nuevas imágenes agregadas de los productos importados.`,
      });
    }

    // 4. Map to Variants
    // IMPORTANT: When importing standalone products, preserve their actual stock values.
    // Do NOT override with defaultStock - the imported products already have real inventory.
    const newVariants: FormVariant[] = products.map((p) => ({
      id: p.id, // KEEP ID so backend knows to update/adopt
      sku: p.sku || "",
      name: p.name,
      price: form.getValues("price") || p.price,
      acqPrice: form.getValues("acqPrice") || p.acqPrice || 0,
      stock: p.stock ?? 0, // Preserve actual product stock, don't override with defaultStock
      supplierId: form.getValues("defaultSupplier") || p.supplierId,
      isFeatured: p.isFeatured || false,
      isArchived: p.isArchived || false,
      size: p.size,
      color: p.color,
      design: p.design,
      images: p.images?.map((i) => i.url) || [],
    }));

    // Merge variants avoiding ID duplication
    const currentVars = form.getValues("variants") || [];
    const currentIds = new Set(currentVars.map((v) => v.id).filter(Boolean));

    const toAdd = newVariants.filter((v) => !v.id || !currentIds.has(v.id));

    if (toAdd.length > 0) {
      const finalVariants = [...currentVars, ...toAdd];
      const finalImages = [...existingImages, ...newImages];

      form.setValue("variants", finalVariants);

      // Recalculate Image Mapping for the new set of variants and images
      form.setValue(
        "imageMapping",
        reconstructMapping(finalImages, finalVariants),
      );

      toast({
        title: "Importación Exitosa",
        description: `${toAdd.length} productos agregados como variantes.`,
        variant: "success",
      });
    } else {
      toast({
        description: "Los productos seleccionados ya están en el grupo.",
      });
    }
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
        colors={colors.filter((c) => form.watch("colorIds").includes(c.id))}
        designs={designs.filter((d) => form.watch("designIds").includes(d.id))}
        onConfirm={handleMatrixConfirm}
      />

      <ProductImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onConfirm={handleImport}
        currentCategoryId={form.watch("categoryId")}
        categories={categories}
      />

      <div className="flex items-center justify-between">
        <Heading title={title} description={description} />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClear} type="button">
            <Eraser className="mr-2 h-4 w-4" />
            Limpiar Formulario
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            type="button"
          >
            <PackageCheckIcon className="mr-2 h-4 w-4" />
            Importar Productos
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
              name="defaultStock"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Stock Predeterminado</FormLabel>
                  <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="rounded-full bg-slate-200/50 p-1">
                        <PackageCheckIcon className="h-4 w-4 text-slate-500" />
                      </div>
                      <span className="text-sm font-semibold">
                        Gestionado por variante
                      </span>
                    </div>
                    <span className="rounded border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      Ver Variantes
                    </span>
                  </div>
                  <FormControl>
                    <Input
                      type="hidden"
                      disabled={true}
                      placeholder="0"
                      {...field}
                      value={0}
                    />
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
                            current.map((v) => ({
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
                    disabled={loading || currentVariants?.some((v) => v.id)}
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
                  {currentVariants?.some((v) => v.id) && (
                    <FormDescription className="text-yellow-600">
                      La categoría está bloqueada porque hay productos
                      existentes vinculados. Para cambiarla, primero desvincula
                      o elimina los productos.
                    </FormDescription>
                  )}
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

            <div className="col-span-3 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setImportOpen(true)}
                disabled={loading}
              >
                Importar Productos
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const cat = form.getValues("categoryId");
                  if (!cat) {
                    form.trigger("categoryId");
                    toast({
                      title: "Falta Categoría",
                      description:
                        "Debes seleccionar una categoría antes de configurar variantes.",
                      variant: "destructive",
                    });
                    return;
                  }
                  setMatrixOpen(true);
                }}
                disabled={
                  loading ||
                  !selectedColorIds?.length ||
                  !selectedDesignIds?.length
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
            isEditMode={isEdit}
            onBatchIntake={(variantIds) => {
              const variants = form.getValues("variants") || [];
              const selected: BatchIntakeVariant[] = variantIds
                .map((id) => {
                  const v = variants.find((v) => v.id === id);
                  if (!v) return null;
                  return {
                    id: v.id!,
                    name: v.name || "Variante",
                    currentStock: v.stock || 0,
                  };
                })
                .filter((v): v is BatchIntakeVariant => v !== null);
              if (selected.length > 0) {
                setBatchIntakeVariants(selected);
                setBatchIntakeOpen(true);
              }
            }}
          />

          {/* Batch Intake Modal for product group update mode */}
          <BatchIntakeModal
            isOpen={batchIntakeOpen}
            onClose={() => {
              setBatchIntakeOpen(false);
              setBatchIntakeVariants([]);
            }}
            variants={batchIntakeVariants}
            defaultCost={form.getValues("acqPrice") || 0}
            defaultSupplierId={form.getValues("defaultSupplier") || ""}
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
