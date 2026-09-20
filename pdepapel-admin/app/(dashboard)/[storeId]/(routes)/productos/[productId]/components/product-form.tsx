"use client";

import type { SupplierPickerOption } from "@/lib/public-catalog";
import { useCanWrite } from "@/components/shell/viewer-access";
import { cn, currencyFormatter } from "@/lib/utils";
import { ProductNameAssistant } from "@/components/products/product-name-assistant";
import {
  CatalogAttributesEditor,
  type CatalogOptionSuggestion,
} from "@/components/products/catalog-attributes-editor";
import {
  ConvertProductWizard,
  type ProductVariantReviewPayload,
} from "@/components/modals/convert-product-to-variants-modal";
import { ProductTintBadge, ShapeBadge } from "../../components/product-badges";
import { ProductDeleteDialog } from "../../components/product-delete-dialog";
import { ProductShapePicker } from "./product-shape-picker";
import { PRODUCT_NAME_MAX_LENGTH } from "@/lib/product-naming";
import { type ProductImageAnalysis } from "@/lib/product-image-analysis";
import { mergeProductCatalogAttributes } from "@/lib/product-catalog-attributes";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Copy,
  Eraser,
  ExternalLink,
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
import {
  FormPageHeader,
  FormStickyFooter,
} from "@/components/ui/form-page-chrome";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { SectionCard } from "@/components/ui/section-card";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { BarcodeScanner } from "@/components/ui/barcode-scanner";
import { focusFirstInvalidField } from "@/lib/focus-invalid-field";
import {
  PresaleSection,
  type ProductPresaleSummary,
} from "@/components/products/presale-section";
import { availableAtToInput } from "@/lib/product-availability";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { INITIAL_PERCENTAGE_INCREASE, Models } from "@/constants";
import { generateSizeName, generateSizeValue } from "@/constants/sizes";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { Color, Design, Size, Supplier, Type } from "@prisma/client";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getProduct, getProductSeed } from "../server/get-product";
import { ReviewColumn, columns } from "./columns";
import { ComponentSelector } from "./component-selector";
import { computeKitStockLimit, sumKitComponentCost } from "@/lib/kit-pricing";
import {
  imagesToSave,
  normalizeProductImages,
  unsavedUploadsToCleanup,
} from "@/lib/product-images";
import { gtinValidationMessage } from "@/lib/product-identifiers";
import { getProductReadiness, getProductShape } from "@/lib/product-readiness";
import { getProductStatus, PRODUCT_STATUS } from "@/lib/product-status";
import { isPriceBelowCost } from "@/lib/product-pricing-rules";
import { generateProductSlug } from "@/lib/slugify";
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
    // «Envío y otros gastos»: vacío = no registrado. Antes se rellenaba con
    // una constante y se guardaba como si fuera un dato real.
    transportationCost: z.preprocess(
      (value) => (value === "" || value === undefined ? null : value),
      z.coerce
        .number()
        .min(0, "El costo de envío no puede ser negativo")
        .nullable(),
    ),
    price: z.coerce.number().min(1, "El precio de venta debe ser mayor a 0"),
    /** Solo para liquidaciones: permite guardar por debajo del costo. No se guarda. */
    sellAtLoss: z.boolean().default(false).optional(),
    categoryId: z.string().min(1, "Elige una subcategoría"),
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
      .superRefine((value, ctx) => {
        const message = gtinValidationMessage(value);
        if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      })
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
    if (!data.sellAtLoss && isPriceBelowCost(data.price, data.acqPrice)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["price"],
        message:
          "Está por debajo del costo de compra. Súbelo, corrige el costo o marca «Vender con pérdida a propósito».",
      });
    }
  });

type ProductFormValues = z.infer<typeof formSchema>;

type Categories = Awaited<ReturnType<typeof getProduct>>["categories"][number];

type InitialData = Awaited<ReturnType<typeof getProduct>>["product"];
type ProductSeed = Awaited<ReturnType<typeof getProductSeed>>;

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
  suppliers: SupplierPickerOption[];
  productGroup: ProductGroup;
  productGroups: ProductGroups;
  catalogOptions: CatalogOptionSuggestion[];
  /** Preventa activa del producto, si tiene una abierta. */
  activePresale?: ProductPresaleSummary | null;
  /** «Duplicar»: datos del original para sembrar un producto nuevo. */
  seed?: ProductSeed | null;
  /** URL pública de la tienda para «Ver en la tienda». */
  storeUrl?: string | null;
  /** Ofertas vigentes del producto (para el asistente de conversión). */
  activeOffers?: { id: string; name: string }[];
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
  activePresale = null,
  seed = null,
  storeUrl = null,
  activeOffers = [],
}) => {
  const canWrite = useCanWrite();
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [conversionOpen, setConversionOpen] = useState(false);
  const [variantReviewAnalysis, setVariantReviewAnalysis] =
    useState<ProductImageAnalysis | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Fotos marcadas con la papelera: se borran de Cloudinary solo al guardar.
  const [pendingRemovals, setPendingRemovals] = useState<string[]>([]);
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

  // Una foto del grupo se suma como principal; no reemplaza las propias.
  const onAssignImage = (url: string) => {
    const current = form.getValues("images") ?? [];
    const others = current
      .filter((image) => image.url !== url)
      .map((image) => ({ ...image, isMain: false }));
    form.setValue("images", [{ url, isMain: true }, ...others], {
      shouldDirty: true,
    });
    setPendingRemovals((pending) => pending.filter((item) => item !== url));
  };

  const { title, description, toastMessage, action, pendingText } = useMemo(
    () => ({
      title: initialData ? (canWrite ? "Editar producto" : "Ver producto") : "Crear producto",
      description: initialData
        ? "Editar un producto"
        : "Crear un nuevo producto",
      toastMessage: initialData ? "Producto actualizado" : "Producto creado",
      action: initialData ? "Guardar cambios" : "Crear",
      pendingText: initialData ? "Actualizando..." : "Creando...",
    }),
    [initialData, canWrite],
  );

  const defaultValues = useMemo(
    () =>
      initialData
        ? {
            ...initialData,
            // Un kit cuesta lo que cuestan sus componentes: sembrarlo igual
            // evita que la ficha abra como «con cambios sin guardar».
            acqPrice: initialData.isKit
              ? sumKitComponentCost(
                  (initialData.kitComponents ?? []).map((c: any) => ({
                    quantity: c.quantity,
                    acqPrice: Number(c.component?.acqPrice || 0),
                  })),
                )
              : initialData.acqPrice || 0,
            supplierId: initialData.supplierId || "",
            brand: initialData.brand || "",
            gtin: initialData.gtin || "",
            mpn: initialData.mpn || "",
            hasNoProductIdentifier: initialData.hasNoProductIdentifier || false,
            availableAt: availableAtToInput(initialData.availableAt),
            // Se respeta la principal guardada; antes se reasignaba a la
            // primera fila en cada carga y podía cambiar sola al guardar.
            images: normalizeProductImages(initialData.images),
            transportationCost: initialData.transportationCost ?? null,
            sellAtLoss: false,
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
            name: seed?.name ?? "",
            description: seed?.description ?? "",
            stock: 0,
            images: [],
            price: seed?.price ?? 0,
            acqPrice: seed?.acqPrice ?? 0,
            categoryId: seed?.categoryId ?? "",
            colorId: seed?.colorId ?? "",
            sizeId: seed?.sizeId ?? "",
            designId: seed?.designId ?? "",
            supplierId: seed?.supplierId ?? "",
            brand: seed?.brand ?? "",
            gtin: "",
            mpn: "",
            // GTIN, MPN y el escáner quedan habilitados desde el inicio. Si no
            // se escribe ninguno ni se toca la casilla, el servidor marca el
            // producto «sin código» al crearlo (la mayoría del catálogo).
            hasNoProductIdentifier: false,
            isFeatured: false,
            isArchived: false,
            availableAt: "",
            transportationCost: seed?.transportationCost ?? null,
            sellAtLoss: false,
            productGroupId: productGroup?.id || "",
            kitDiscountPercent: 0,
            isKit: seed?.isKit ?? false,
            components:
              seed?.kitComponents?.map((c: any) => ({
                componentId: c.componentId,
                quantity: c.quantity,
                name: c.component?.name || "",
                sku: c.component?.sku || "",
                stock: c.component?.stock || 0,
                price: c.component?.price || 0,
                acqPrice: Number(c.component?.acqPrice || 0),
                image:
                  c.component?.images?.find((i: any) => i.isMain)?.url ||
                  c.component?.images?.[0]?.url ||
                  "",
                categoryName: c.component?.category?.name,
                sizeName: c.component?.size?.name,
                colorName: c.component?.color?.name,
                designName: c.component?.design?.name,
              })) ?? [],
            catalogAttributes:
              seed?.catalogOptionValues?.map((item) => ({
                key: item.option.key,
                name: item.option.name,
                value: item.optionValue.name,
                evidence: "Copiado del producto original",
              })) ?? [],
          },
    [initialData, productGroup, seed],
  );

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  // Solo el borrador de un producto NUEVO se restaura (ver use-form-persist);
  // dejarlo activo al editar escribia cada tecla en storage sin leerla nunca.
  const { clearStorage } = useFormPersist({
    form,
    key: `product-form-${params.storeId}-${initialData?.id ?? (seed ? `copia-${seed.id}` : "new")}`,
    enabled: !initialData,
  });

  useFormValidationToast({ form });
  const { confirmLeave, confirmationDialog: leaveDialog } =
    useUnsavedChangesGuard(form, { enabled: !loading });

  const onClear = useCallback(async () => {
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
  }, [form, initialData, defaultValues, clearStorage, toast]);

  const watchedGroupId = form.watch("productGroupId");
  const watchedIsKit = form.watch("isKit");
  const watchedComponents = form.watch("components");
  const watchedAcqPrice = form.watch("acqPrice");
  const watchedPrice = form.watch("price");
  const watchedTransportationCost = form.watch("transportationCost");
  const watchedKitDiscount = form.watch("kitDiscountPercent");
  const watchedSellAtLoss = form.watch("sellAtLoss");
  const watchedGtin = form.watch("gtin");
  const watchedMpn = form.watch("mpn");
  const watchedHasNoIdentifier = form.watch("hasNoProductIdentifier");
  // La calculadora vive fuera del formulario: no se guarda con el producto.
  const [calculatorIncrease, setCalculatorIncrease] = useState<number>(
    INITIAL_PERCENTAGE_INCREASE,
  );
  // Si la dueña no toca la casilla y deja GTIN y MPN vacíos al crear, el
  // servidor marca el producto «sin código» (como hasta ahora).
  const [identifierTouched, setIdentifierTouched] = useState(false);
  // Cambiar la URL es un acto explícito: la anterior queda como redirección.
  const [refreshSlug, setRefreshSlug] = useState(false);
  const { requestConfirmation, confirmationDialog: identifierConfirmation } =
    useActionConfirmation();

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

  // Precio sugerido = costo × (1 + incremento) + envío. Solo se escribe con
  // el botón; el precio nunca se recalcula solo.
  const suggestedPrice = useMemo(() => {
    const cost = watchedIsKit ? kitComponentCost : Number(watchedAcqPrice) || 0;
    if (cost <= 0) return 0;
    const extra = Number(watchedTransportationCost) || 0;
    return Math.round(
      cost * (1 + (Number(calculatorIncrease) || 0) / 100) + extra,
    );
  }, [
    watchedIsKit,
    kitComponentCost,
    watchedAcqPrice,
    watchedTransportationCost,
    calculatorIncrease,
  ]);
  const priceBelowCost = isPriceBelowCost(
    Number(watchedPrice) || 0,
    watchedIsKit ? kitComponentCost : Number(watchedAcqPrice) || 0,
  );
  const slugPreview = useMemo(
    () => generateProductSlug({ name: form.watch("name") || "" }) || "producto",
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.watch("name")],
  );
  const isDirty = form.formState.isDirty || pendingRemovals.length > 0;
  const headerStatus = initialData
    ? getProductStatus({
        isArchived: Boolean(initialData.isArchived),
        stock: initialData.stock,
        availableAt: initialData.availableAt,
      })
    : "a-la-venta";
  const headerMargin =
    initialData && initialData.acqPrice && initialData.price
      ? Math.round(
          ((initialData.price - initialData.acqPrice) / initialData.price) *
            100,
        )
      : null;
  const headerReadiness = getProductReadiness(initialData ?? {});
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
            title: "Subcategoría Actualizada",
            description: `La subcategoría se ha ajustado a "${categories.find((c) => c.id === groupCategory)?.name}" para coincidir con el grupo.`,
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
      const images = imagesToSave(data.images, pendingRemovals);
      if (images.length === 0) {
        form.setError("images", {
          type: "manual",
          message:
            "Necesitas al menos una foto; deshaz la que quitaste o sube otra.",
        });
        window.setTimeout(focusFirstInvalidField, 0);
        return;
      }
      try {
        setLoading(true);
        const { sellAtLoss, ...rest } = data;
        const payload: Record<string, unknown> = {
          ...rest,
          images,
          allowBelowCost: Boolean(sellAtLoss),
        };
        if (!initialData && !identifierTouched && !data.gtin && !data.mpn) {
          // Sin código y sin decisión explícita: el servidor aplica «sin código».
          delete payload.hasNoProductIdentifier;
        }
        if (initialData) {
          await axios.patch(
            `/api/${params.storeId}/${Models.Products}/${params.productId}`,
            { ...payload, preserveSlug: !refreshSlug },
          );
        } else {
          await axios.post(
            `/api/${params.storeId}/${Models.Products}`,
            payload,
          );
        }
        // Las fotos quitadas que ya estaban guardadas las borra el servidor;
        // las subidas y descartadas en esta sesión no existen en la base.
        const orphans = unsavedUploadsToCleanup(
          pendingRemovals,
          (initialData?.images ?? []).map(
            (image: { url: string }) => image.url,
          ),
        );
        if (orphans.length > 0) {
          const { cleanupImages } = await import("@/actions/cleanup-images");
          void cleanupImages(orphans);
        }
        setPendingRemovals([]);
        clearStorage();
        router.push(`/${params.storeId}/${Models.Products}`);
        router.refresh();
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
      pendingRemovals,
      form,
      identifierTouched,
      refreshSlug,
    ],
  );
  /** Archivar o restaurar desde el encabezado, sin pasar por Guardar. */
  const toggleArchive = useCallback(async () => {
    if (!initialData) return;
    const archive = !initialData.isArchived;
    const ok = await requestConfirmation({
      title: archive
        ? `¿Archivar «${initialData.name}»?`
        : `¿Restaurar «${initialData.name}»?`,
      description: archive
        ? "Sale de la tienda y del buscador, y su publicación activa en Mercado Libre se pausa. Conserva pedidos, kardex y URL; se puede restaurar."
        : "Vuelve a la tienda con su stock y precio actuales. La publicación de Mercado Libre no se reactiva sola.",
      confirmLabel: archive ? "Archivar" : "Restaurar",
    });
    if (!ok) return;
    try {
      setLoading(true);
      const response = await axios.post<{ pausedListings: number }>(
        `/api/${params.storeId}/${Models.Products}/bulk-update`,
        { productIds: [initialData.id], field: "isArchived", value: archive },
      );
      form.setValue("isArchived", archive, { shouldDirty: false });
      toast({
        description: archive
          ? `«${initialData.name}» quedó archivado.${response.data.pausedListings ? " Su publicación en Mercado Libre se pausa." : ""}`
          : `«${initialData.name}» vuelve a estar a la venta.`,
        variant: "success",
      });
      router.refresh();
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [initialData, params.storeId, requestConfirmation, form, toast, router]);

  const onClearConfirmed = useCallback(async () => {
    const ok = await requestConfirmation({
      title: initialData
        ? "¿Descartar los cambios?"
        : "¿Limpiar el formulario?",
      description: initialData
        ? "Se vuelve a lo último guardado. Las fotos que subiste en esta sesión y no guardaste se borran."
        : "Se borra todo lo escrito y las fotos subidas en esta sesión.",
      confirmLabel: initialData ? "Descartar" : "Limpiar",
      destructive: true,
    });
    if (ok) {
      setPendingRemovals([]);
      await onClear();
    }
  }, [initialData, onClear, requestConfirmation]);

  const onCreateReviewedVariants = useCallback(
    async (payload: ProductVariantReviewPayload) => {
      if (!initialData) return;

      try {
        setLoading(true);
        const response = await axios.post<{
          productGroupId: string;
          createdProductIds: string[];
          copiedOffers: number;
        }>(
          `/api/${params.storeId}/${Models.Products}/${initialData.id}/convert-to-variants/review`,
          payload,
        );

        clearStorage();
        setConversionOpen(false);
        setVariantReviewAnalysis(null);
        const created = response.data.createdProductIds?.length ?? 0;
        const copied = response.data.copiedOffers ?? 0;
        toast({
          title: "Grupo creado",
          description:
            created === 0
              ? "El producto ahora es la primera opción de su grupo. Agrega las demás desde el grupo."
              : `${created} ${created === 1 ? "opción nueva" : "opciones nuevas"} con el inventario repartido y registrado en el kardex${copied > 0 ? `; ${copied} ${copied === 1 ? "oferta copiada" : "ofertas copiadas"}` : ""}.`,
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

      // Con dos o más opciones vistas por la IA, el paso 2 llega prellenado.
      setVariantReviewAnalysis(
        analysis?.variantCandidates.length && analysis.variantCandidates.length >= 2
          ? analysis
          : null,
      );
      setConversionOpen(true);
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
      {leaveDialog}
      {identifierConfirmation}
      {initialData && (
        <ProductDeleteDialog
          productId={initialData.id}
          productName={initialData.name}
          isArchived={Boolean(initialData.isArchived)}
          open={open}
          onOpenChange={setOpen}
          onDone={(outcome) => {
            if (outcome === "deleted") {
              router.push(`/${params.storeId}/${Models.Products}`);
            }
            router.refresh();
          }}
        />
      )}
      {initialData && (
        <ConvertProductWizard
          product={{
            name: initialData.name,
            sku: initialData.sku,
            slug: initialData.slug,
            stock: watchedStock,
            price: initialData.price,
            acqPrice: initialData.acqPrice,
            gtin: initialData.gtin,
            imageUrls: watchedImages?.map((image) => image.url) ?? [],
            colorId: watchedColorId,
            designId: watchedDesignId,
            sizeId: watchedSizeId,
          }}
          analysis={variantReviewAnalysis}
          colors={availableColors}
          designs={availableDesigns}
          sizes={availableSizes}
          activeOffers={activeOffers}
          isOpen={conversionOpen}
          loading={loading}
          onClose={() => {
            setConversionOpen(false);
            setVariantReviewAnalysis(null);
          }}
          onConfirm={onCreateReviewedVariants}
        />
      )}
      <FormPageHeader
        title={
          initialData
            ? initialData.name
            : seed
              ? `Copia de «${seed.sourceName}»`
              : "Nuevo producto"
        }
        badge={
          initialData ? (
            <>
              <ProductTintBadge
                label={PRODUCT_STATUS[headerStatus].label}
                tone={PRODUCT_STATUS[headerStatus].tone}
              />
              <ShapeBadge shape={getProductShape(initialData)} />
            </>
          ) : (
            <ProductTintBadge
              label="Borrador · aún no está en la tienda"
              tone="slate"
            />
          )
        }
        summary={
          initialData
            ? `${initialData.sku} · ${currencyFormatter(initialData.price)}${headerMargin !== null ? ` · margen ${headerMargin} %` : ""} · ${initialData.stock} und${!headerReadiness.complete ? ` · faltan ${headerReadiness.total - headerReadiness.done} para vender` : ""}`
            : seed
              ? "Se copiaron nombre, precio, costo, clasificación y descripción. Sube fotos nuevas y revisa el stock inicial; el SKU y la URL se generan al guardar."
              : "Sube la foto, completa nombre, precio y categoría; la lista te dice qué falta para venderlo."
        }
        backLabel="Volver a productos"
        onBack={async () => {
          if (await confirmLeave())
            router.push(`/${params.storeId}/${Models.Products}`);
        }}
        actions={
          initialData ? (
            <>
              {storeUrl && initialData.slug && !initialData.isArchived && (
                <Button asChild variant="outline" size="sm">
                  <a
                    href={`${storeUrl.replace(/\/$/, "")}/producto/${initialData.slug}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                    Ver en la tienda
                  </a>
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => void toggleArchive()}
              >
                {initialData.isArchived ? (
                  <ArchiveRestore className="mr-2 h-4 w-4" aria-hidden="true" />
                ) : (
                  <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {initialData.isArchived ? "Restaurar" : "Archivar"}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loading}
                  >
                    Más
                    <ChevronDown className="ml-1 h-4 w-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onClick={async () => {
                      if (await confirmLeave())
                        router.push(
                          `/${params.storeId}/${Models.Products}/nuevo?desde=${initialData.id}`,
                        );
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                    Duplicar
                  </DropdownMenuItem>
                  {!initialData.productGroupId && !initialData.isKit && (
                    <DropdownMenuItem
                      onClick={() => requestVariantConversion()}
                    >
                      <Package className="mr-2 h-4 w-4" aria-hidden="true" />
                      Convertir en variantes
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setOpen(true)}
                  >
                    <Trash className="mr-2 h-4 w-4" aria-hidden="true" />
                    Eliminar…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onClearConfirmed()}
              type="button"
              disabled={loading}
            >
              <Eraser className="mr-2 h-4 w-4" aria-hidden="true" />
              Limpiar formulario
            </Button>
          )
        }
      />
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
            title="Fotos"
            description="La principal se ve en la tienda y en Google; el asistente las lee para proponer los datos. Lo que quites con la papelera se borra solo al guardar."
          >
            <FormField
              control={form.control}
              name="images"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Fotos del producto</FormLabel>
                  <FormControl>
                    <ImageUpload
                      value={field.value}
                      disabled={loading}
                      maxImages={8}
                      onChange={(images) => {
                        field.onChange(images);
                        form.clearErrors("images");
                      }}
                      pendingRemovals={pendingRemovals}
                      onMarkRemoval={(url) =>
                        setPendingRemovals((pending) =>
                          pending.includes(url) ? pending : [...pending, url],
                        )
                      }
                      onUndoRemoval={(url) =>
                        setPendingRemovals((pending) =>
                          pending.filter((item) => item !== url),
                        )
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
                    onApplyDescription={async (description) => {
                      const current = (form.getValues("description") || "")
                        .replace(/<[^>]*>/g, "")
                        .trim();
                      if (current.length > 0) {
                        const ok = await requestConfirmation({
                          title: "¿Reemplazar la descripción?",
                          description:
                            "La descripción actual se reemplaza por la propuesta de la IA. Puedes deshacerlo con Descartar antes de guardar.",
                          confirmLabel: "Reemplazar",
                          destructive: true,
                        });
                        if (!ok) return;
                      }
                      form.setValue("description", description, {
                        shouldDirty: true,
                        shouldTouch: true,
                        shouldValidate: true,
                      });
                    }}
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
              title="Nombre y URL"
              description="Nombre comercial claro (50–65 caracteres) y marca. La URL se conserva al renombrar; puedes actualizarla y la anterior seguirá funcionando."
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
                <FormItem className="col-span-full">
                  <FormLabel>URL en la tienda</FormLabel>
                  {initialData ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input
                          readOnly
                          aria-label="URL actual"
                          className="bg-muted/50 font-mono text-xs sm:text-sm"
                          value={`/producto/${refreshSlug ? slugPreview : initialData.slug}`}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="shrink-0"
                          disabled={loading}
                          onClick={() => setRefreshSlug((value) => !value)}
                        >
                          {refreshSlug
                            ? "Conservar la URL actual"
                            : "Actualizar URL"}
                        </Button>
                      </div>
                      <FormDescription>
                        {refreshSlug
                          ? `Al guardar, la URL pasará a /producto/${slugPreview}${initialData.productGroupId ? " (puede sumar el color o tamaño de la variante)" : ""} y /producto/${initialData.slug} redirigirá a la nueva.`
                          : "Se conserva aunque cambies el nombre. Nunca cambia sola."}
                      </FormDescription>
                    </div>
                  ) : (
                    <FormDescription>
                      Se genera del nombre al guardar: /producto/{slugPreview}
                    </FormDescription>
                  )}
                </FormItem>
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
              title="Precio y costo"
              description="Se guardan el costo de compra, el precio de venta y los gastos por unidad. La calculadora solo sugiere; el precio de Mercado Libre es aparte."
            >
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 xl:grid-cols-3">
                <FormField
                  control={form.control}
                  name="acqPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired={!watchedIsKit}>
                        Costo de compra
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
                  name="transportationCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Envío y otros gastos por unidad</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          placeholder="Sin registrar"
                          disabled={loading}
                          value={field.value ?? undefined}
                          onChange={(value) => field.onChange(value ?? null)}
                        />
                      </FormControl>
                      <FormDescription>
                        Vacío = no registrado; no se rellena con un valor
                        inventado. Entra en el precio sugerido y en el piso de
                        precio de Mercado Libre.
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
                      {marginPct !== null && !priceBelowCost && (
                        <FormDescription className="font-semibold text-primary">
                          Margen {marginPct.toFixed(1)} % ·{" "}
                          {currencyFormatter(
                            (Number(watchedPrice) || 0) -
                              (watchedIsKit
                                ? kitComponentCost
                                : Number(watchedAcqPrice) || 0),
                          )}{" "}
                          por unidad
                        </FormDescription>
                      )}
                      {priceBelowCost && (
                        <FormDescription className="font-semibold text-destructive">
                          Está por debajo del costo (
                          {currencyFormatter(
                            watchedIsKit
                              ? kitComponentCost
                              : Number(watchedAcqPrice) || 0,
                          )}
                          ): perderías{" "}
                          {currencyFormatter(
                            (watchedIsKit
                              ? kitComponentCost
                              : Number(watchedAcqPrice) || 0) -
                              (Number(watchedPrice) || 0),
                          )}{" "}
                          por unidad.
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {priceBelowCost && (
                  <FormField
                    control={form.control}
                    name="sellAtLoss"
                    render={({ field }) => (
                      <FormItem className="col-span-full flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-primary">
                          <strong>No se puede guardar con pérdida.</strong> Sube
                          el precio o corrige el costo. Si es intencional
                          (liquidación), márcalo.
                        </p>
                        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
                          <FormControl>
                            <Checkbox
                              checked={Boolean(field.value)}
                              disabled={loading}
                              onCheckedChange={(checked) => {
                                field.onChange(checked === true);
                                void form.trigger("price");
                              }}
                            />
                          </FormControl>
                          Vender con pérdida a propósito
                        </label>
                      </FormItem>
                    )}
                  />
                )}
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
                  <details className="col-span-full rounded-lg border border-dashed p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-primary">
                      Calculadora de precio (no se guarda)
                    </summary>
                    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
                      <FormItem>
                        <FormLabel htmlFor="calculadora-incremento">
                          Incremento sobre el costo
                        </FormLabel>
                        <PercentageInput
                          id="calculadora-incremento"
                          disabled={loading}
                          value={calculatorIncrease}
                          onChange={(value) =>
                            setCalculatorIncrease(value ?? 0)
                          }
                        />
                      </FormItem>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium">
                          Precio sugerido
                        </span>
                        <span className="text-xl font-bold text-primary">
                          {suggestedPrice > 0
                            ? currencyFormatter(suggestedPrice)
                            : "—"}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={loading || suggestedPrice <= 0}
                        onClick={() =>
                          form.setValue("price", suggestedPrice, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                      >
                        Usar como precio de venta
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Costo × (1 + incremento) + envío por unidad. El precio de
                      venta solo cambia si pulsas el botón.
                    </p>
                  </details>
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
                            excludeId={initialData?.id ?? null}
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
              description="GTIN real del código de barras (nunca inventado) y referencia del fabricante. Ambos habilitados desde el inicio; se valida el dígito de control y que no esté en otro producto."
            >
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 xl:grid-cols-3">
                <FormField
                  control={form.control}
                  name="gtin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>GTIN / código de barras</FormLabel>
                      {/* min-w-0 + flex-1: el lector trae dos botones (cámara y celular) y en celular la fila se salía de la tarjeta. */}
                      <div className="flex min-w-0 items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <FormControl>
                            <Input
                              disabled={loading || watchedHasNoIdentifier}
                              inputMode="numeric"
                              placeholder="8, 12, 13 o 14 dígitos"
                              {...field}
                            />
                          </FormControl>
                        </div>
                        {!watchedHasNoIdentifier && (
                          <BarcodeScanner
                            compact
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
                        {watchedHasNoIdentifier
                          ? "Desmarca «No tiene código de barras» para escribir o escanear uno."
                          : "Regístralo solo si corresponde a este producto."}
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
                          disabled={loading || watchedHasNoIdentifier}
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
                          onCheckedChange={async (checked) => {
                            const hasNoIdentifier = checked === true;
                            setIdentifierTouched(true);
                            if (
                              hasNoIdentifier &&
                              (watchedGtin || watchedMpn)
                            ) {
                              const ok = await requestConfirmation({
                                title: "¿Borrar el código registrado?",
                                description: `Al marcar «No tiene código de barras» se borra ${watchedGtin ? `el GTIN ${watchedGtin}` : ""}${watchedGtin && watchedMpn ? " y " : ""}${watchedMpn ? `la referencia ${watchedMpn}` : ""}. Puedes volver a escribirlos después.`,
                                confirmLabel: "Borrar y marcar",
                                destructive: true,
                              });
                              if (!ok) return;
                            }
                            field.onChange(hasNoIdentifier);
                            if (hasNoIdentifier) {
                              form.setValue("gtin", "", { shouldDirty: true });
                              form.setValue("mpn", "", { shouldDirty: true });
                            }
                          }}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>No tiene código de barras</FormLabel>
                        <FormDescription>
                          Solo si el empaque no trae GTIN ni MPN del fabricante.
                          {!initialData &&
                            " Si dejas ambos vacíos y no tocas esta casilla, el producto se crea marcado así."}
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
                        Al asignarlo a un grupo, la subcategoría, el tamaño, el
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
                      <FormLabel isRequired>Subcategoría</FormLabel>
                      <FormControl>
                        <Combobox
                          id="categoryId"
                          options={selectOptions.categories ?? []}
                          value={field.value || null}
                          onChange={(value) => field.onChange(value ?? "")}
                          placeholder="Selecciona una subcategoría"
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
            <PresaleSection
              storeId={String(params.storeId)}
              productId={initialData?.id ?? null}
              presale={activePresale}
              isKit={Boolean(initialData?.isKit)}
            />
            <SectionCard
              id="descripcion"
              title="Descripción"
              description="Se muestra en la tienda y en Google. Usa las plantillas para medidas, materiales y cuidados."
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
                          placeholder="Describe las características y beneficios del producto…"
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
              description="Eliminar borra el producto y sus fotos. Antes se revisa qué lo usa (pedidos, kits, Mercado Libre, ferias, reposición); si algo lo bloquea, se ofrece archivar."
            >
              <div className="flex flex-wrap items-center gap-2">
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
          <FormStickyFooter
            className="bottom-[84px] z-20 lg:bottom-2"
            note={
              <>
                {isDirty && (
                  <ProductTintBadge
                    label="Cambios sin guardar"
                    tone="cream"
                    className="mr-2"
                  />
                )}
                {initialData
                  ? "Los cambios se aplican al guardar y la tienda se actualiza sola."
                  : "Revisa nombre, fotos, precio y stock; el producto se crea al guardar."}
              </>
            }
          >
            {initialData && (
              <Button
                type="button"
                variant="outline"
                disabled={loading || !isDirty}
                onClick={() => void onClearConfirmed()}
              >
                Descartar
              </Button>
            )}
            <Button disabled={loading} type="submit" className="min-w-[160px]">
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
          </FormStickyFooter>
        </form>
      </Form>
      {initialData && (
        <SectionCard
          id="resenas"
          title="Reseñas"
          description="Lo que las clientas escribieron sobre este producto en la tienda."
        >
          <DataTable
            tableKey={Models.Reviews}
            searchKey="name"
            columns={columns}
            data={reviews ?? []}
          />
        </SectionCard>
      )}
    </>
  );
};
