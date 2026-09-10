"use client";

import { cn, currencyFormatter } from "@/lib/utils";
import { ProductNameAssistant } from "@/components/products/product-name-assistant";
import {
  CatalogAttributesEditor,
  type CatalogOptionSuggestion,
} from "@/components/products/catalog-attributes-editor";
import {
  ReviewProductVariantsModal,
  type ProductVariantReviewPayload,
} from "@/components/modals/review-product-variants-modal";
import { ProductTintBadge } from "../../components/product-badges";
import { ProductShapePicker } from "./product-shape-picker";
import { PRODUCT_NAME_MAX_LENGTH } from "@/lib/product-naming";
import { type ProductImageAnalysis } from "@/lib/product-image-analysis";
import { mergeProductCatalogAttributes } from "@/lib/product-catalog-attributes";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Eraser,
  Info,
  Loader2,
  Package,
  PackageCheckIcon,
  Plus,
  Trash,
} from "lucide-react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import z from "zod";

import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { PRODUCT_DESCRIPTION_TEMPLATES } from "@/lib/product-description-templates";
import { AlertModal } from "@/components/modals/alert-modal";
import { ConvertProductToVariantsModal } from "@/components/modals/convert-product-to-variants-modal";
import { IntakeModal } from "@/components/modals/intake-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { DateField } from "@/components/ui/date-field";
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
import { PercentageInput } from "@/components/ui/percentage-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { SectionCard } from "@/components/ui/section-card";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { SuggestionStrip } from "@/components/ui/suggestion-strip";
import { BarcodeScanner } from "@/components/ui/barcode-scanner";
import { focusFirstInvalidField } from "@/lib/focus-invalid-field";
import { availableAtToInput } from "@/lib/product-availability";
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
import { generateSizeName, generateSizeValue } from "@/constants/sizes";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { Color, Design, Size, Supplier, Type } from "@prisma/client";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getProduct } from "../server/get-product";
import { ReviewColumn, columns } from "./columns";
import { ComponentSelector } from "./component-selector";
import { computeKitStockLimit, sumKitComponentCost } from "@/lib/kit-pricing";
import { KitPriceSuggestion } from "./kit-price-calculator";

const formSchema = z
  .object({
    name: z.string().min(1, "El nombre del producto no puede estar vacío"),
    description: z.string().optional(),
    stock: z.coerce.number().min(0, "El stock no puede ser menor a 0"),
    images: z
      .object({ url: z.string(), isMain: z.boolean() })
      .array()
      .refine((images) => images.filter((img) => img.isMain).length === 1, {
        message: "Debe haber exactamente una imagen principal",
      }),
    acqPrice: z.coerce
      .number()
      .min(0, "El precio de compra no puede ser negativo"),
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
    categoryId: z.string().min(1, "Elige una sub-categoría"),
    colorId: z.string().min(1, "Elige un color"),
    sizeId: z.string().min(1, "Elige un tamaño"),
    designId: z.string().min(1, "Elige un diseño"),
    catalogAttributes: z
      .array(
        z.object({
          key: z.string().min(1).max(60),
          name: z.string().min(1).max(80),
          value: z.string().min(1).max(100),
          evidence: z.string().min(1).max(180),
        }),
      )
      .max(8)
      .superRefine((attributes, context) => {
        const seenKeys = new Set<string>();

        attributes.forEach((attribute, index) => {
          const key = attribute.key
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLocaleLowerCase("es-CO")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
          if (!key || !seenKeys.has(key)) {
            if (key) seenKeys.add(key);
            return;
          }

          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "name"],
            message: "La característica está repetida",
          });
        });
      })
      .default([]),
    supplierId: z.string().optional(),
    brand: z.string().max(120).optional(),
    gtin: z
      .string()
      .refine(
        (value) => !value || /^(\d{8}|\d{12,14})$/.test(value),
        "El GTIN debe tener 8, 12, 13 o 14 dígitos",
      )
      .optional(),
    mpn: z.string().max(70).optional(),
    hasNoProductIdentifier: z.boolean().default(false).optional(),
    isFeatured: z.boolean().default(false).optional(),
    isArchived: z.boolean().default(false).optional(),
    availableAt: z.string().optional(),
    productGroupId: z.string().optional(),
    isKit: z.boolean().default(false).optional(),
    components: z
      .object({
        componentId: z.string(),
        quantity: z.number().min(1),
        // Optional display fields not sent to backend mostly
        name: z.string().optional(),
        sku: z.string().optional(),
        image: z.string().optional(),
        stock: z.number().optional(),
        price: z.number().optional(), // Added price
        acqPrice: z.number().optional(), // Costo del componente
      })
      .array()
      .optional(),
    /** Descuento con el que se sugiere el precio de un kit. Se guarda en el
     * borrador para que la sugerencia sobreviva a una recarga. */
    kitDiscountPercent: z.coerce.number().min(0).max(100).optional().default(0),
  })
  .superRefine((data, ctx) => {
    // Un kit no lleva costo propio: lo que cuesta es armarlo, y eso sale de
    // sus componentes (ver lib/financial.ts › getProductUnitCost). Exigirle un
    // acqPrice obligaba a escribir un numero ficticio que despues se colaba en
    // el margen del canal en linea.
    if (!data.isKit && !(data.acqPrice > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["acqPrice"],
        message: "El precio de compra debe ser mayor a 0",
      });
    }
    if (data.isKit && (data.components?.length ?? 0) === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["components"],
        message: "Un kit necesita al menos un componente",
      });
    }
  });

type ProductFormValues = z.infer<typeof formSchema>;

type Categories = Awaited<ReturnType<typeof getProduct>>["categories"][number];

type InitialData = Awaited<ReturnType<typeof getProduct>>["product"];

type ProductGroup = Awaited<ReturnType<typeof getProduct>>["productGroup"];
type ProductGroups = Awaited<ReturnType<typeof getProduct>>["productGroups"];
type CatalogColorOption = Pick<Color, "id" | "name" | "value"> & {
  isArchived?: boolean;
};
type CatalogDesignOption = Pick<Design, "id" | "name"> & {
  isArchived?: boolean;
};
type CatalogCategoryOption = Pick<
  Categories,
  "id" | "name" | "typeId" | "type"
> & { isArchived?: boolean };

interface ProductFormProps {
  initialData: InitialData | null;
  categories: Categories[];
  types: Type[];
  sizes: Size[];
  colors: Color[];
  designs: Design[];
  reviews?: ReviewColumn[];
  suppliers: Supplier[];
  productGroup: ProductGroup;
  productGroups: ProductGroups;
  catalogOptions: CatalogOptionSuggestion[];
}

/** Un atributo archivado sigue seleccionable solo si el producto ya lo tenía. */
const archivedLabel = (name: string, isArchived?: boolean) =>
  isArchived ? `${name} · archivado` : name;

export const ProductForm: React.FC<ProductFormProps> = ({
  initialData,
  categories,
  types,
  sizes,
  colors,
  designs,
  reviews,
  suppliers,
  productGroup,
  productGroups,
  catalogOptions,
}) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [convertToVariantsOpen, setConvertToVariantsOpen] = useState(false);
  const [reviewVariantsOpen, setReviewVariantsOpen] = useState(false);
  const [variantReviewAnalysis, setVariantReviewAnalysis] =
    useState<ProductImageAnalysis | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recentCategories, setRecentCategories] = useState<
    CatalogCategoryOption[]
  >([]);
  const [recentSizes, setRecentSizes] = useState<Size[]>([]);
  const [recentColors, setRecentColors] = useState<CatalogColorOption[]>([]);
  const [recentDesigns, setRecentDesigns] = useState<CatalogDesignOption[]>([]);

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
            brand: initialData.brand || "",
            gtin: initialData.gtin || "",
            mpn: initialData.mpn || "",
            hasNoProductIdentifier: initialData.hasNoProductIdentifier || false,
            availableAt: availableAtToInput(initialData.availableAt),
            images: initialData.images.map(
              (image: { url: string }, idx: number) => ({
                ...image,
                isMain: idx === 0,
              }),
            ),
            percentageIncrease: INITIAL_PERCENTAGE_INCREASE,
            transportationCost: INITIAL_TRANSPORTATION_COST + INITIAL_MISC_COST,
            miscCost: 0,
            productGroupId: initialData.productGroupId || "",
            stock: initialData.stock,
            isKit: initialData.isKit || false,
            kitDiscountPercent: 0,
            components:
              initialData.kitComponents?.map((c: any) => ({
                componentId: c.componentId,
                quantity: c.quantity,
                name: c.component?.name || "",
                sku: c.component?.sku || "",
                stock: c.component?.stock || 0,
                price: c.component?.price || 0, // Map price
                acqPrice: Number(c.component?.acqPrice || 0),
                // Map first image if available, else empty
                image:
                  c.component?.images?.find((i: any) => i.isMain)?.url ||
                  c.component?.images?.[0]?.url ||
                  "",
                // UI Details
                categoryName: c.component?.category?.name,
                sizeName: c.component?.size?.name,
                colorName: c.component?.color?.name,
                designName: c.component?.design?.name,
              })) || [],
            catalogAttributes:
              initialData.catalogOptionValues?.map((item) => ({
                key: item.option.key,
                name: item.option.name,
                value: item.optionValue.name,
                evidence: "Característica guardada en el catálogo",
              })) || [],
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
            brand: "",
            gtin: "",
            mpn: "",
            // Los productos nuevos nacen sin identificador; se desmarca al tener un GTIN real.
            hasNoProductIdentifier: true,
            isFeatured: false,
            isArchived: false,
            availableAt: "",
            percentageIncrease: INITIAL_PERCENTAGE_INCREASE,
            transportationCost: INITIAL_TRANSPORTATION_COST + INITIAL_MISC_COST,
            miscCost: 0,
            productGroupId: productGroup?.id || "",
            kitDiscountPercent: 0,
            isKit: false,
            components: [],
            catalogAttributes: [],
          },
    [initialData, productGroup],
  );

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  // Solo el borrador de un producto NUEVO se restaura (ver use-form-persist);
  // dejarlo activo al editar escribia cada tecla en storage sin leerla nunca.
  const { clearStorage } = useFormPersist({
    form,
    key: `product-form-${params.storeId}-${initialData?.id ?? "new"}`,
    enabled: !initialData,
  });

  useFormValidationToast({ form });

  const onClear = async () => {
    const currentImages = form.getValues("images") || [];
    const currentUrls = currentImages
      .map((img: any) => img.url)
      .filter(Boolean);

    const initialUrls = new Set<string>();
    if (initialData && initialData.images) {
      initialData.images.forEach((img: { url: string }) =>
        initialUrls.add(img.url),
      );
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

  const watchedGroupId = form.watch("productGroupId");
  const watchedIsKit = form.watch("isKit");
  const watchedComponents = form.watch("components");
  const watchedAcqPrice = form.watch("acqPrice");
  const watchedPrice = form.watch("price");
  const watchedPercentageIncrease = form.watch("percentageIncrease");
  const watchedTransportationCost = form.watch("transportationCost");
  const watchedMiscCost = form.watch("miscCost");
  const watchedKitDiscount = form.watch("kitDiscountPercent");

  /** Lo que cuesta armar el kit. Un kit no tiene costo propio. */
  const kitComponentCost = useMemo(
    () => sumKitComponentCost(watchedComponents ?? []),
    [watchedComponents],
  );

  /** Cuantos kits se pueden armar y que componente lo limita. */
  const kitStockLimit = useMemo(
    () => computeKitStockLimit(watchedComponents ?? []),
    [watchedComponents],
  );

  /** Margen real sobre el precio de venta. */
  const marginPct = useMemo(() => {
    const price = Number(watchedPrice) || 0;
    if (price <= 0) return null;
    const cost = watchedIsKit ? kitComponentCost : Number(watchedAcqPrice) || 0;
    return ((price - cost) / price) * 100;
  }, [watchedPrice, watchedIsKit, kitComponentCost, watchedAcqPrice]);

  // El precio NO se recalcula solo. Al abrir un producto existente los tres
  // campos de costo se siembran con constantes (no se guardan en la base), asi
  // que cualquier tecla en ellos reescribia en silencio un precio puesto a
  // mano. Ahora se ofrece como sugerencia y solo cambia con el boton.
  const suggestedPrice = useMemo(() => {
    const values = form.getValues();
    return calculatePrice({
      acqPrice: watchedAcqPrice ?? 0,
      percentageIncrease: values.percentageIncrease ?? 0,
      transportationCost: values.transportationCost ?? 0,
      miscCost: values.miscCost ?? 0,
    });
    // Los tres costos se leen con `getValues`, pero son dependencias reales:
    // sin ellas la sugerencia se queda congelada al teclear en esos campos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    calculatePrice,
    form,
    watchedAcqPrice,
    watchedPercentageIncrease,
    watchedTransportationCost,
    watchedMiscCost,
  ]);
  const watchedName = form.watch("name");
  const watchedCategoryId = form.watch("categoryId");
  const watchedColorId = form.watch("colorId");
  const watchedSizeId = form.watch("sizeId");
  const watchedDesignId = form.watch("designId");
  const watchedBrand = form.watch("brand");
  const watchedImages = form.watch("images");
  const watchedStock = form.watch("stock");
  const watchedCatalogAttributes = form.watch("catalogAttributes") || [];

  useEffect(() => {
    if (watchedGroupId) {
      const selectedGroup = productGroups?.find(
        (g: any) => g.id === watchedGroupId,
      );

      if (selectedGroup && selectedGroup.products.length > 0) {
        // 1. Auto-Inherit Category from the first product in the group
        const groupCategory = selectedGroup.products[0].categoryId;
        const currentCategory = form.getValues("categoryId");
        if (groupCategory && groupCategory !== currentCategory) {
          form.setValue("categoryId", groupCategory);
          toast({
            title: "Sub-Categoría Actualizada",
            description: `La sub-categoría se ha ajustado a "${categories.find((c) => c.id === groupCategory)?.name}" para coincidir con el grupo.`,
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

    const selectedGroup = productGroups?.find(
      (g: any) => g.id === watchedGroupId,
    );
    if (!selectedGroup) return null;

    const existingVariant = selectedGroup.products.find(
      (p: any) =>
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

  // El costo de un kit es el de sus componentes: se refleja en el campo para
  // que lo que se guarda y lo que se ve coincidan.
  useEffect(() => {
    if (!watchedIsKit) return;
    if (Number(form.getValues("acqPrice") ?? 0) === kitComponentCost) return;
    form.setValue("acqPrice", kitComponentCost, { shouldDirty: false });
  }, [watchedIsKit, kitComponentCost, form]);

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
            { ...data, preserveSlug: true },
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

  const onConvertToVariants = useCallback(
    async (groupName: string) => {
      if (!initialData) return;

      try {
        setLoading(true);
        const response = await axios.post<{ productGroupId: string }>(
          `/api/${params.storeId}/${Models.Products}/${initialData.id}/convert-to-variants`,
          { name: groupName },
        );

        clearStorage();
        setConvertToVariantsOpen(false);
        toast({
          description:
            "Grupo creado. Ahora agrega las demás opciones con su propio stock.",
          variant: "success",
        });
        router.push(
          `/${params.storeId}/${Models.Products}/grupo/${response.data.productGroupId}`,
        );
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [clearStorage, initialData, params.storeId, router, toast],
  );

  const onCreateReviewedVariants = useCallback(
    async (payload: ProductVariantReviewPayload) => {
      if (!initialData) return;

      try {
        setLoading(true);
        const response = await axios.post<{ productGroupId: string }>(
          `/api/${params.storeId}/${Models.Products}/${initialData.id}/convert-to-variants/review`,
          payload,
        );

        clearStorage();
        setReviewVariantsOpen(false);
        setVariantReviewAnalysis(null);
        toast({
          description:
            "Variantes creadas con el inventario distribuido y registrado.",
          variant: "success",
        });
        router.push(
          `/${params.storeId}/${Models.Products}/grupo/${response.data.productGroupId}`,
        );
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [clearStorage, initialData, params.storeId, router, toast],
  );

  const requestVariantConversion = useCallback(
    (analysis?: ProductImageAnalysis) => {
      if (!initialData) return;

      if (form.formState.isDirty) {
        toast({
          description:
            "Guarda los cambios del producto antes de convertirlo en variantes.",
          variant: "destructive",
        });
        return;
      }

      if (
        analysis?.variantCandidates.length &&
        analysis.variantCandidates.length >= 2
      ) {
        setVariantReviewAnalysis(analysis);
        setReviewVariantsOpen(true);
        return;
      }

      setConvertToVariantsOpen(true);
    },
    [form.formState.isDirty, initialData, toast],
  );

  const availableCategories = useMemo(
    () => [
      ...categories,
      ...recentCategories.filter(
        (recentCategory) =>
          !categories.some((category) => category.id === recentCategory.id),
      ),
    ],
    [categories, recentCategories],
  );
  const availableSizes = useMemo(
    () => [
      ...sizes,
      ...recentSizes.filter(
        (recentSize) => !sizes.some((size) => size.id === recentSize.id),
      ),
    ],
    [recentSizes, sizes],
  );
  const availableColors = useMemo(
    () => [
      ...colors,
      ...recentColors.filter(
        (recentColor) => !colors.some((color) => color.id === recentColor.id),
      ),
    ],
    [colors, recentColors],
  );
  const availableDesigns = useMemo(
    () => [
      ...designs,
      ...recentDesigns.filter(
        (recentDesign) =>
          !designs.some((design) => design.id === recentDesign.id),
      ),
    ],
    [designs, recentDesigns],
  );

  const selectOptions = useMemo(
    () => ({
      categories: [...availableCategories]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((category) => ({
          value: category.id,
          label: archivedLabel(category.name, category.isArchived),
        })),
      sizes: [...availableSizes]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((size) => ({
          value: size.id,
          label: archivedLabel(size.name, size.isArchived),
        })),
      colors: [...availableColors]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((color) => ({
          value: color.id,
          label: archivedLabel(color.name, color.isArchived),
          color: color.value,
        })),
      designs: [...availableDesigns]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((design) => ({
          value: design.id,
          label: archivedLabel(design.name, design.isArchived),
        })),
      suppliers: [...suppliers]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((supplier) => ({
          value: supplier.id,
          label: supplier.name,
        })),
    }),
    [
      availableCategories,
      availableColors,
      availableDesigns,
      availableSizes,
      suppliers,
    ],
  );

  const createSuggestedCategory = useCallback(
    async ({ name, typeId }: { name: string; typeId: string }) => {
      const setValueOptions = {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      };
      const existingCategory = availableCategories.find(
        (category) =>
          category.name.localeCompare(name, "es-CO", {
            sensitivity: "base",
          }) === 0,
      );

      if (existingCategory) {
        form.setValue("categoryId", existingCategory.id, setValueOptions);
        return existingCategory;
      }

      const selectedType = types.find((type) => type.id === typeId);
      if (!selectedType) {
        throw new Error("Selecciona un tipo válido para la subcategoría.");
      }

      const response = await axios
        .post<
          Pick<Categories, "id" | "name">
        >(`/api/${params.storeId}/${Models.Categories}`, { name, typeId })
        .catch((error) => {
          throw new Error(getErrorMessage(error));
        });
      const createdCategory: CatalogCategoryOption = {
        id: response.data.id,
        name: response.data.name,
        typeId,
        type: selectedType,
      };

      setRecentCategories((current) => [...current, createdCategory]);
      form.setValue("categoryId", createdCategory.id, setValueOptions);
      toast({
        description: `Subcategoría “${createdCategory.name}” creada y seleccionada.`,
        variant: "success",
      });
      return createdCategory;
    },
    [availableCategories, form, params.storeId, toast, types],
  );

  const createSuggestedSize = useCallback(
    async ({ dimension, weight }: { dimension: string; weight: string }) => {
      const name = generateSizeName(dimension, weight);
      const value = generateSizeValue(dimension, weight);
      const setValueOptions = {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      };
      const existingSize = availableSizes.find((size) => size.value === value);

      if (existingSize) {
        form.setValue("sizeId", existingSize.id, setValueOptions);
        return existingSize;
      }

      const response = await axios
        .post<Size>(`/api/${params.storeId}/${Models.Sizes}`, { name, value })
        .catch((error) => {
          throw new Error(getErrorMessage(error));
        });
      setRecentSizes((current) => [...current, response.data]);
      form.setValue("sizeId", response.data.id, setValueOptions);
      toast({
        description: `Tamaño interno “${response.data.name}” creado y seleccionado.`,
        variant: "success",
      });
      return response.data;
    },
    [availableSizes, form, params.storeId, toast],
  );

  const createVisualAttribute = useCallback(
    async ({
      type,
      name,
      colorHex,
    }: {
      type: "color" | "design";
      name: string;
      colorHex?: string;
    }) => {
      const setValueOptions = {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      };

      if (type === "color") {
        const existingColor = availableColors.find(
          (color) =>
            color.name.localeCompare(name, "es-CO", {
              sensitivity: "base",
            }) === 0,
        );

        if (existingColor) {
          form.setValue("colorId", existingColor.id, setValueOptions);
          return existingColor;
        }

        if (!colorHex) {
          throw new Error(
            "No se detectó un tono válido para crear este color.",
          );
        }

        const response = await axios.post<CatalogColorOption>(
          `/api/${params.storeId}/${Models.Colors}`,
          { name, value: colorHex },
        );
        setRecentColors((current) => [...current, response.data]);
        form.setValue("colorId", response.data.id, setValueOptions);
        toast({
          description: `Color “${response.data.name}” creado y seleccionado.`,
          variant: "success",
        });
        return response.data;
      }

      const existingDesign = availableDesigns.find(
        (design) =>
          design.name.localeCompare(name, "es-CO", {
            sensitivity: "base",
          }) === 0,
      );

      if (existingDesign) {
        form.setValue("designId", existingDesign.id, setValueOptions);
        return existingDesign;
      }

      const response = await axios.post<CatalogDesignOption>(
        `/api/${params.storeId}/${Models.Designs}`,
        { name },
      );
      setRecentDesigns((current) => [...current, response.data]);
      form.setValue("designId", response.data.id, setValueOptions);
      toast({
        description: `Diseño “${response.data.name}” creado y seleccionado.`,
        variant: "success",
      });
      return response.data;
    },
    [availableColors, availableDesigns, form, params.storeId, toast],
  );

  return (
    <>
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onDelete}
        loading={loading}
      />
      {initialData && (
        <ConvertProductToVariantsModal
          defaultName={initialData.name}
          isOpen={convertToVariantsOpen}
          loading={loading}
          onClose={() => setConvertToVariantsOpen(false)}
          onConfirm={onConvertToVariants}
        />
      )}
      {initialData && (
        <ReviewProductVariantsModal
          analysis={variantReviewAnalysis}
          colors={availableColors}
          defaultName={initialData.name}
          defaultVariant={{
            colorId: watchedColorId,
            designId: watchedDesignId,
            sizeId: watchedSizeId,
            stock: watchedStock,
          }}
          designs={availableDesigns}
          imageUrls={watchedImages?.map((image) => image.url) ?? []}
          isOpen={reviewVariantsOpen}
          loading={loading}
          onClose={() => {
            setReviewVariantsOpen(false);
            setVariantReviewAnalysis(null);
          }}
          onConfirm={onCreateReviewedVariants}
          sizes={availableSizes}
        />
      )}
      {(!initialData || !initialData.productGroupId) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            {initialData && !initialData.productGroupId && (
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => requestVariantConversion()}
                disabled={loading}
              >
                <Package className="mr-2 h-4 w-4" aria-hidden="true" />
                Convertir en variantes
              </Button>
            )}
            {!initialData && (
              <Button
                variant="outline"
                size="sm"
                onClick={onClear}
                type="button"
              >
                <Eraser className="mr-2 h-4 w-4" aria-hidden="true" />
                Limpiar formulario
              </Button>
            )}
          </div>
        </div>
      )}
      {!initialData && (
        <ProductShapePicker
          storeId={params.storeId as string}
          value={watchedIsKit ? "kit" : "individual"}
          disabled={loading}
          onChange={(shape) =>
            form.setValue("isKit", shape === "kit", { shouldDirty: true })
          }
        />
      )}
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit, focusFirstInvalidField)}
          autoComplete="off"
          className="flex w-full flex-col gap-4"
        >
          {productGroup && (
            <div className="space-y-4 rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <Heading
                  title="Galería del Grupo"
                  description="Selecciona una imagen del grupo para asignarla a este producto (Imágenes únicas por variante)"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
                {productGroup.images?.map((img: { url: string }) => {
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

          <SectionCard
            id="imagenes"
            title="Imágenes"
            description="La principal se ve en la tienda y en Google; el asistente las lee para proponer los datos."
          >
            <FormField
              control={form.control}
              name="images"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Imágenes del producto</FormLabel>
                  <FormControl>
                    <ImageUpload
                      value={field.value}
                      disabled={loading}
                      onChange={(images) => field.onChange(images)}
                      onRemove={(url) =>
                        field.onChange([
                          ...field.value.filter(
                            (current) => current.url !== url,
                          ),
                        ])
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </SectionCard>

          <div className="flex flex-col gap-4">
            <SectionCard
              id="asistente"
              title="Asistente de producto"
              description="Lee las fotos y propone nombre, marca, clasificación, descripción y el código de barras impreso. Tú apruebas campo por campo; nada se guarda solo."
            >
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 xl:grid-cols-3">
                <div className="col-span-full">
                  <ProductNameAssistant
                    currentName={watchedName}
                    categoryName={
                      availableCategories.find(
                        (category) => category.id === watchedCategoryId,
                      )?.name
                    }
                    brand={watchedBrand}
                    designName={
                      availableDesigns.find(
                        (design) => design.id === watchedDesignId,
                      )?.name
                    }
                    colorName={
                      availableColors.find(
                        (color) => color.id === watchedColorId,
                      )?.name
                    }
                    sizeName={
                      availableSizes.find((size) => size.id === watchedSizeId)
                        ?.name
                    }
                    sizeValue={
                      availableSizes.find((size) => size.id === watchedSizeId)
                        ?.value
                    }
                    disabled={loading}
                    storeId={params.storeId}
                    imageUrls={watchedImages?.map((image) => image.url)}
                    visualFieldAvailability={{
                      brand: true,
                      category: !watchedGroupId || watchedGroupId === "none",
                      size: !watchedGroupId || watchedGroupId === "none",
                      color: !watchedGroupId || watchedGroupId === "none",
                      design: !watchedGroupId || watchedGroupId === "none",
                      catalogAttributes: true,
                    }}
                    onApply={(name) =>
                      form.setValue("name", name, {
                        shouldDirty: true,
                        shouldTouch: true,
                        shouldValidate: true,
                      })
                    }
                    onApplyVisualAnalysis={(analysis) => {
                      const options = {
                        shouldDirty: true,
                        shouldTouch: true,
                        shouldValidate: true,
                      };

                      if (analysis.brand) {
                        form.setValue("brand", analysis.brand, options);
                      }

                      if (!watchedGroupId || watchedGroupId === "none") {
                        if (analysis.categoryId) {
                          form.setValue(
                            "categoryId",
                            analysis.categoryId,
                            options,
                          );
                        }
                        if (analysis.sizeId) {
                          form.setValue("sizeId", analysis.sizeId, options);
                        }
                        if (analysis.colorId) {
                          form.setValue("colorId", analysis.colorId, options);
                        }
                        if (analysis.designId) {
                          form.setValue("designId", analysis.designId, options);
                        }
                      }

                      if (analysis.catalogAttributes.length > 0) {
                        form.setValue(
                          "catalogAttributes",
                          mergeProductCatalogAttributes(
                            form.getValues("catalogAttributes") || [],
                            analysis.catalogAttributes,
                          ),
                          options,
                        );
                      }
                    }}
                    onApplyDescription={(description) =>
                      form.setValue("description", description, {
                        shouldDirty: true,
                        shouldTouch: true,
                        shouldValidate: true,
                      })
                    }
                    onApplyVerifiedIdentifier={(type, identifier) => {
                      const options = {
                        shouldDirty: true,
                        shouldTouch: true,
                        shouldValidate: true,
                      };
                      form.setValue(type, identifier.value, options);
                      form.setValue("hasNoProductIdentifier", false, options);
                      toast({
                        description: `${type.toUpperCase()} confirmado desde el empaque.`,
                        variant: "success",
                      });
                    }}
                    canReviewVariantRecommendation={Boolean(
                      initialData &&
                      !initialData.productGroupId &&
                      !initialData.isKit &&
                      !initialData.isArchived,
                    )}
                    onReviewVariantRecommendation={requestVariantConversion}
                    onCreateVisualAttribute={
                      !watchedGroupId || watchedGroupId === "none"
                        ? createVisualAttribute
                        : undefined
                    }
                    categoryTypes={types.map((type) => ({
                      id: type.id,
                      name: type.name,
                    }))}
                    onCreateSuggestedCategory={
                      !watchedGroupId || watchedGroupId === "none"
                        ? createSuggestedCategory
                        : undefined
                    }
                    onCreateSuggestedSize={
                      !watchedGroupId || watchedGroupId === "none"
                        ? createSuggestedSize
                        : undefined
                    }
                  />
                </div>
              </div>
            </SectionCard>
            <SectionCard
              id="informacion"
              title="Información básica"
              description="Nombre comercial claro (50–65 caracteres) y marca. La URL se conserva aunque cambies el nombre."
            >
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 xl:grid-cols-3">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
                      <FormLabel isRequired>Nombre</FormLabel>
                      <FormControl>
                        <Input
                          disabled={loading}
                          maxLength={PRODUCT_NAME_MAX_LENGTH}
                          placeholder="Nombre del producto"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="col-span-full">
                  <CatalogAttributesEditor
                    value={watchedCatalogAttributes}
                    options={catalogOptions}
                    categoryId={watchedCategoryId}
                    disabled={loading}
                    onChange={(attributes) =>
                      form.setValue("catalogAttributes", attributes, {
                        shouldDirty: true,
                        shouldTouch: true,
                        shouldValidate: true,
                      })
                    }
                  />
                </div>
                <FormField
                  control={form.control}
                  name="brand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Marca o fabricante</FormLabel>
                      <FormControl>
                        <Input
                          disabled={loading}
                          placeholder="Ej. Sanrio, Stabilo"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Se usa en Google Merchant y datos estructurados.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </SectionCard>
            <SectionCard
              id="precio"
              title="Precio y margen"
              description="El margen sale del costo de compra registrado; el precio de Mercado Libre es independiente."
            >
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 xl:grid-cols-3">
                <FormField
                  control={form.control}
                  name="acqPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired={!watchedIsKit}>
                        Precio de compra
                      </FormLabel>
                      <FormControl>
                        <CurrencyInput
                          placeholder="$ 1.000"
                          disabled={loading || watchedIsKit}
                          value={watchedIsKit ? kitComponentCost : field.value}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      {watchedIsKit && (
                        <FormDescription>
                          Se calcula sumando el costo de los componentes.
                        </FormDescription>
                      )}
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
                        <PercentageInput
                          disabled={loading}
                          placeholder="30"
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormDescription>
                        Se usa solo para calcular el precio de venta actual.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="transportationCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Envío y otros gastos</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          placeholder="$ 0"
                          disabled={loading}
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormDescription>
                        Por unidad. Entra solo en el precio sugerido.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Precio de venta</FormLabel>
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
                <FormItem>
                  <FormLabel>Margen resultante</FormLabel>
                  <div
                    className={cn(
                      "flex h-10 items-center gap-2 rounded-md border px-3 text-sm",
                      marginPct === null
                        ? "bg-muted/40 text-muted-foreground"
                        : marginPct >= 0
                          ? "border-tint-mint bg-tint-mint/40 text-primary"
                          : "border-destructive/40 bg-destructive/10 text-destructive",
                    )}
                  >
                    {marginPct === null ? (
                      <span>Sin precio de venta</span>
                    ) : (
                      <>
                        <strong>{marginPct.toFixed(1)} %</strong>
                        <span className="text-xs">
                          ={" "}
                          {currencyFormatter(
                            (Number(watchedPrice) || 0) -
                              (watchedIsKit
                                ? kitComponentCost
                                : Number(watchedAcqPrice) || 0),
                          )}{" "}
                          por unidad
                        </span>
                      </>
                    )}
                  </div>
                </FormItem>
                {watchedIsKit ? (
                  <>
                    <FormField
                      control={form.control}
                      name="kitDiscountPercent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Descuento de kit</FormLabel>
                          <FormControl>
                            <PercentageInput
                              disabled={loading}
                              placeholder="15"
                              value={field.value}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <FormDescription>
                            Sobre lo que costarían los componentes por separado.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <KitPriceSuggestion
                      components={watchedComponents ?? []}
                      discountPercent={watchedKitDiscount ?? 0}
                      disabled={loading}
                      onApply={(value) =>
                        form.setValue("price", value, { shouldDirty: true })
                      }
                    />
                  </>
                ) : (
                  suggestedPrice > 0 &&
                  suggestedPrice !== Number(watchedPrice) && (
                    <SuggestionStrip
                      className="col-span-full"
                      actionLabel={`Usar ${currencyFormatter(suggestedPrice)}`}
                      disabled={loading}
                      onApply={() =>
                        form.setValue("price", suggestedPrice, {
                          shouldDirty: true,
                        })
                      }
                    >
                      Con el costo, el incremento y los gastos de arriba, el
                      precio sugerido es{" "}
                      <strong className="text-foreground">
                        {currencyFormatter(suggestedPrice)}
                      </strong>
                      . El precio de venta no se recalcula solo.
                    </SuggestionStrip>
                  )
                )}
              </div>
            </SectionCard>
            <SectionCard
              id="composicion"
              title="Composición del kit"
              description="Un kit se arma con productos que ya existen. De aquí salen su costo y su stock."
            >
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 xl:grid-cols-3">
                {watchedIsKit ? (
                  <div className="col-span-full flex flex-col gap-3 rounded-lg border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-sm text-primary">
                      <ProductTintBadge label="Kit" tone="cream" />
                      Al venderse se descuentan sus componentes, no el kit. Su
                      stock se deriva de lo que haya en bodega.
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={loading}
                      onClick={() =>
                        form.setValue("isKit", false, { shouldDirty: true })
                      }
                    >
                      Dejar de ser kit
                    </Button>
                  </div>
                ) : (
                  <div className="col-span-full flex flex-col gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                      Este producto se vende por sí solo. Un kit se arma con
                      productos que ya existen: su costo y su stock salen de los
                      componentes.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={loading}
                      className="shrink-0"
                      onClick={() =>
                        form.setValue("isKit", true, { shouldDirty: true })
                      }
                    >
                      <Package className="h-4 w-4" aria-hidden="true" />
                      Convertir en kit
                    </Button>
                  </div>
                )}
                {watchedIsKit && (
                  <FormField
                    control={form.control}
                    name="components"
                    render={({ field }) => (
                      <FormItem className="col-span-full">
                        <FormControl>
                          <ComponentSelector
                            value={field.value || []}
                            onChange={(val) => field.onChange(val)}
                            disabled={loading}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {watchedIsKit && kitStockLimit && kitStockLimit.binding && (
                  <div className="col-span-full flex items-start gap-3 rounded-lg border border-tint-cream bg-tint-cream/30 p-3">
                    <Info
                      className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <p className="text-xs leading-relaxed text-primary">
                      Con estos componentes se pueden armar{" "}
                      <strong>{kitStockLimit.units}</strong>{" "}
                      {kitStockLimit.units === 1 ? "kit" : "kits"}. Lo limita{" "}
                      <strong>{kitStockLimit.binding.name}</strong> (
                      {kitStockLimit.binding.stock ?? 0} en bodega ÷{" "}
                      {kitStockLimit.binding.quantity || 1} por kit). Armarlo
                      cuesta{" "}
                      <strong>{currencyFormatter(kitComponentCost)}</strong>.
                    </p>
                  </div>
                )}
              </div>
            </SectionCard>
            <SectionCard
              id="inventario"
              title="Inventario"
              description="Cada cambio queda como movimiento auditable."
            >
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 xl:grid-cols-3">
                {watchedIsKit ? (
                  // Un kit no guarda stock propio: se deriva de sus componentes y
                  // `recalculateKitStock` sobreescribe la columna. Ofrecer un campo
                  // aqui solo produce numeros fantasma.
                  <FormItem className="col-span-full sm:col-span-1">
                    <FormLabel>Kits armables</FormLabel>
                    <div className="flex h-10 items-center gap-3 rounded-md border bg-muted/50 px-3">
                      <PackageCheckIcon
                        className="h-4 w-4 text-primary"
                        aria-hidden="true"
                      />
                      <strong className="text-sm">
                        {kitStockLimit?.units ?? 0}
                      </strong>
                      <span className="text-xs text-muted-foreground">
                        derivado de los componentes
                      </span>
                    </div>
                    <FormDescription>
                      {kitStockLimit?.binding
                        ? `Lo limita ${kitStockLimit.binding.name} (${kitStockLimit.binding.stock ?? 0} en bodega ÷ ${kitStockLimit.binding.quantity || 1} por kit).`
                        : "Agrega componentes para saber cuántos kits se pueden armar."}
                    </FormDescription>
                  </FormItem>
                ) : (
                  <FormField
                    control={form.control}
                    name="stock"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel
                          isRequired
                          className="flex items-center gap-2"
                        >
                          Cantidad
                          {!initialData && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-4 w-4 cursor-pointer text-muted-foreground transition-colors hover:text-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-[200px] text-xs">
                                    Esta cantidad generará un nuevo movimiento
                                    en el inventario para este producto una vez
                                    creado.
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
                )}
              </div>
            </SectionCard>
            <SectionCard
              id="identificadores"
              title="Identificadores"
              description="SKU interno, GTIN real del código de barras (nunca inventado) y código del fabricante."
            >
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 xl:grid-cols-3">
                <FormField
                  control={form.control}
                  name="gtin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>GTIN / código de barras</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input
                            disabled={
                              loading || form.watch("hasNoProductIdentifier")
                            }
                            inputMode="numeric"
                            placeholder="8, 12, 13 o 14 dígitos"
                            {...field}
                          />
                        </FormControl>
                        {!form.watch("hasNoProductIdentifier") && (
                          <BarcodeScanner
                            label="Escanear"
                            description="Apunta la cámara al código de barras del empaque."
                            onDetected={(code) =>
                              form.setValue("gtin", code, {
                                shouldDirty: true,
                                shouldTouch: true,
                                shouldValidate: true,
                              })
                            }
                          />
                        )}
                      </div>
                      <FormDescription>
                        Regístralo solo si corresponde a esta variante.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mpn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Referencia del fabricante (MPN)</FormLabel>
                      <FormControl>
                        <Input
                          disabled={
                            loading || form.watch("hasNoProductIdentifier")
                          }
                          placeholder="Referencia del fabricante"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hasNoProductIdentifier"
                  render={({ field }) => (
                    <FormItem className="flex h-fit items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          disabled={loading}
                          onCheckedChange={(checked) => {
                            const hasNoIdentifier = checked === true;
                            field.onChange(hasNoIdentifier);

                            if (hasNoIdentifier) {
                              form.setValue("gtin", "");
                              form.setValue("mpn", "");
                            }
                          }}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>No tiene identificador global</FormLabel>
                        <FormDescription>
                          Úsalo únicamente para productos sin GTIN ni MPN del
                          fabricante. Al activarlo se eliminan ambos valores.
                        </FormDescription>
                      </div>
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
                    onSuccess={({ newStock }) => {
                      form.setValue("stock", newStock);
                    }}
                  />
                )}
              </div>
            </SectionCard>
            <SectionCard
              id="clasificacion"
              title="Clasificación y atributos"
              description="Subcategoría, tamaño, color, diseño y proveedor."
            >
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 xl:grid-cols-3">
                <FormField
                  control={form.control}
                  name="productGroupId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Grupo de variantes</FormLabel>
                      <FormControl>
                        <Combobox
                          id="productGroupId"
                          options={(productGroups ?? []).map((group: any) => ({
                            value: group.id,
                            label: group.name,
                          }))}
                          value={
                            field.value && field.value !== "none"
                              ? field.value
                              : null
                          }
                          onChange={(value) => field.onChange(value ?? "")}
                          placeholder="Sin grupo"
                          searchPlaceholder="Escribe para buscar…"
                          emptyText="No hay grupos con ese nombre"
                          disabled={loading}
                        />
                      </FormControl>
                      <FormDescription>
                        Al asignarlo a un grupo, la sub-categoría, el tamaño, el
                        color y el diseño pasan a gestionarse desde el grupo.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Sub-Categoría</FormLabel>
                      <FormControl>
                        <Combobox
                          id="categoryId"
                          options={selectOptions.categories ?? []}
                          value={field.value || null}
                          onChange={(value) => field.onChange(value ?? "")}
                          placeholder="Selecciona una sub-categoría"
                          searchPlaceholder="Escribe para buscar…"
                          emptyText="No hay resultados"
                          disabled={
                            loading ||
                            (!!watchedGroupId && watchedGroupId !== "none")
                          }
                        />
                      </FormControl>
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
                  name="sizeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Tamaño</FormLabel>
                      <FormControl>
                        <Combobox
                          id="sizeId"
                          options={selectOptions.sizes ?? []}
                          value={field.value || null}
                          onChange={(value) => field.onChange(value ?? "")}
                          placeholder="Selecciona un tamaño"
                          searchPlaceholder="Escribe para buscar…"
                          emptyText="No hay resultados"
                          disabled={
                            loading ||
                            (!!watchedGroupId && watchedGroupId !== "none")
                          }
                        />
                      </FormControl>
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
                      <FormControl>
                        <Combobox
                          id="colorId"
                          options={(selectOptions.colors ?? []).map(
                            (color) => ({
                              value: color.value,
                              label: color.label,
                              description: color.color,
                              icon: (
                                <span
                                  aria-hidden="true"
                                  className="mr-2 h-4 w-4 shrink-0 rounded-full border border-black/10"
                                  style={{ backgroundColor: color.color }}
                                />
                              ),
                            }),
                          )}
                          value={field.value || null}
                          onChange={(value) => field.onChange(value ?? "")}
                          placeholder="Selecciona un color"
                          searchPlaceholder="Escribe para buscar…"
                          emptyText="No hay resultados"
                          disabled={
                            loading ||
                            (!!watchedGroupId && watchedGroupId !== "none")
                          }
                        />
                      </FormControl>

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
                      <FormControl>
                        <Combobox
                          id="designId"
                          options={selectOptions.designs ?? []}
                          value={field.value || null}
                          onChange={(value) => field.onChange(value ?? "")}
                          placeholder="Selecciona un diseño"
                          searchPlaceholder="Escribe para buscar…"
                          emptyText="No hay resultados"
                          disabled={
                            loading ||
                            (!!watchedGroupId && watchedGroupId !== "none")
                          }
                        />
                      </FormControl>

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
                  <div className="col-span-full rounded-md bg-destructive/15 p-4 text-sm text-destructive">
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
                      <FormLabel>Proveedor</FormLabel>
                      <FormControl>
                        <Combobox
                          id="supplierId"
                          options={selectOptions.suppliers ?? []}
                          value={field.value || null}
                          onChange={(value) => field.onChange(value ?? "")}
                          placeholder="Sin proveedor"
                          searchPlaceholder="Escribe para buscar…"
                          emptyText="No hay resultados"
                          disabled={loading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </SectionCard>
            <SectionCard
              id="visibilidad"
              title="Visibilidad"
              description="Destacado en la portada, archivado (desaparece de la tienda; la URL queda como alias) o próximamente (se ve sin botón de compra hasta la fecha)."
            >
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 xl:grid-cols-3">
                <FormField
                  control={form.control}
                  name="availableAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Disponible desde</FormLabel>
                      <FormControl>
                        <DateField
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          clearable
                          placeholder="Ya disponible"
                          aria-label="Fecha desde la que se puede comprar"
                        />
                      </FormControl>
                      <FormDescription>
                        Con una fecha futura el producto aparece como «Llega
                        el…» y las clientas pueden pedir aviso. Vacío: se vende
                        ya.
                      </FormDescription>
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
                    <FormItem className="mt-auto flex h-fit items-start space-x-3 space-y-0 rounded-md border p-4">
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
            </SectionCard>
            <SectionCard
              id="descripcion"
              title="Descripción"
              description="Se muestra en la tienda y en Google; sin emojis y con formato."
            >
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 xl:grid-cols-3">
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="col-span-full">
                      <FormLabel>Descripción</FormLabel>
                      <FormControl>
                        <RichTextEditor
                          placeholder="Describe las características y beneficios del producto 🚀..."
                          value={field.value || ""}
                          onChange={field.onChange}
                          templates={PRODUCT_DESCRIPTION_TEMPLATES}
                          showSeoGuidance
                        />
                      </FormControl>
                      <FormDescription>
                        Usa secciones, listas y plantillas para explicar
                        beneficios, medidas y cuidados con claridad.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </SectionCard>
          </div>
          {initialData && (
            <SectionCard
              id="zona-de-cuidado"
              title="Zona de cuidado"
              tone="care"
              description="Limpiar descarta lo escrito sin guardar. Eliminar borra el producto de la tienda; si tiene pedidos, prefiere archivarlo desde Visibilidad."
            >
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClear}
                  disabled={loading}
                >
                  <Eraser className="h-4 w-4" aria-hidden="true" />
                  Limpiar formulario
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={() => setOpen(true)}
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash className="h-4 w-4" aria-hidden="true" />
                  Eliminar producto
                </Button>
              </div>
            </SectionCard>
          )}
          <div className="sticky bottom-[84px] z-20 flex flex-col gap-3 rounded-xl border bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between lg:bottom-4">
            <p className="text-xs text-muted-foreground">
              {initialData
                ? "Los cambios se aplican al guardar y la tienda se actualiza sola."
                : "Revisa nombre, imágenes, precio y stock; el producto se crea al guardar."}
            </p>
            <Button disabled={loading} type="submit" className="min-w-[180px]">
              {loading ? (
                <>
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  {pendingText}
                </>
              ) : (
                action
              )}
            </Button>
          </div>
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
