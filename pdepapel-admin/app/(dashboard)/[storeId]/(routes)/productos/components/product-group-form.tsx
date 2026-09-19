"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  ChevronDown,
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
import { PRODUCT_DESCRIPTION_TEMPLATES } from "@/lib/product-description-templates";
import {
  BatchIntakeModal,
  BatchIntakeVariant,
} from "@/components/modals/batch-intake-modal";
import { ProductImportModal } from "@/components/modals/product-import-modal";
import { ScanIntoGroupButton } from "@/components/products/scan-into-group-button";
import { ProductNameAssistant } from "@/components/products/product-name-assistant";
import { PRODUCT_NAME_MAX_LENGTH } from "@/lib/product-naming";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormPageHeader, FormStickyFooter } from "@/components/ui/form-page-chrome";
import { SectionCard } from "@/components/ui/section-card";
import { MobileSectionNav } from "../[productId]/components/section-nav";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { mapWithConcurrency } from "@/lib/concurrency";
import { Switch } from "@/components/ui/switch";
import {
  planGeneratedVariants,
  type GeneratedCombination,
} from "@/lib/product-group-form-state";
import { ImageUpload } from "@/components/ui/image-upload";
import { Input } from "@/components/ui/input";
import { PercentageInput } from "@/components/ui/percentage-input";
import { Modal } from "@/components/ui/modal";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  INITIAL_MISC_COST,
  INITIAL_PERCENTAGE_INCREASE,
  INITIAL_TRANSPORTATION_COST,
} from "@/constants";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
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
import { imageUrlKey, resolveVariantImages } from "@/lib/variant-images";
import {
  applyPendingImageRemovals,
  archivePayload,
  deriveArchiveMode,
  describeArchiveRows,
  stripAdoptedRowsFromDraft,
  type GroupArchiveMode,
} from "@/lib/product-group-form-state";
import { RadioCards } from "@/components/ui/radio-cards";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { cn, currencyFormatter } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProductTintBadge } from "./product-badges";
import { mergeAdoptedVariants } from "@/lib/product-group-variants";
import { VariantGrid } from "./variant-grid";
import { VariantMatrix } from "./variant-matrix";

const formSchema = z.object({
  name: z.string().min(1, "El nombre del grupo es requerido"),
  brand: z.string().max(120).optional(),
  description: z.string().optional(),
  images: z
    .object({ url: z.string(), isMain: z.boolean().optional() })
    .array()
    .min(1, "Se requiere al menos una imagen"),
  categoryId: z.string().min(1, "La subcategoría es requerida"),
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
        // Identificadores por variante: el grupo nunca los enviaba, asi que
        // toda variante nacia "sin identificador" para Google Merchant.
        gtin: z
          .string()
          .optional()
          .refine((value) => !value || /^(\d{8}|\d{12,14})$/.test(value), {
            message: "El GTIN debe tener 8, 12, 13 o 14 dígitos",
          }),
        mpn: z.string().max(70).optional(),
        hasNoProductIdentifier: z.boolean().optional(),
        // De dónde sale la fila: guardada en el grupo, traída de un producto
        // suelto (se adopta) o generada (se crea). Solo informa a la tabla.
        origin: z.enum(["saved", "adopted", "new"]).optional(),
        slug: z.string().optional(),
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
  // Estado en la tienda: «todas» manda un booleano al servidor; «por
  // variante» no manda nada y cada fila decide.
  archiveMode: z
    .enum(["per-variant", "all-archived", "all-published"])
    .optional(),
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
  gtin?: string;
  mpn?: string;
  hasNoProductIdentifier?: boolean;
  origin?: "saved" | "adopted" | "new";
  /** URL actual en la tienda (solo filas con producto real). */
  slug?: string;
}

interface GeneratedRowContext {
  sizes: { id: string; name: string; value?: string | null }[];
  colors: { id: string; name: string; value?: string | null }[];
  designs: { id: string; name: string }[];
  price: number;
  acqPrice: number;
  supplierId: string;
}

/** Fila nueva a partir de una combinación generada: 0 unidades, sin id. */
function buildGeneratedRow(gen: GeneratedCombination, ctx: GeneratedRowContext): FormVariant {
  const size = ctx.sizes.find((x) => x.id === gen.sizeId);
  const color = ctx.colors.find((x) => x.id === gen.colorId);
  const design = ctx.designs.find((x) => x.id === gen.designId);
  return {
    sku: gen.sku,
    name: gen.name,
    origin: "new",
    price: ctx.price,
    acqPrice: ctx.acqPrice,
    // Una variante nueva nace con 0 unidades; las existencias entran por
    // Inventario con su movimiento.
    stock: 0,
    supplierId: ctx.supplierId,
    isFeatured: false,
    isArchived: false,
    size: size ? { id: size.id, name: size.name, value: size.value ?? "" } : { id: "unknown", name: "?" },
    color: color ? { id: color.id, name: color.name, value: color.value ?? "" } : { id: "unknown", name: "?" },
    design: design ? { id: design.id, name: design.name } : { id: "unknown", name: "?" },
  };
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
  offers?: { offerId: string }[];
};

interface ProductGroupFormProps {
  categories: Category[];
  sizes: Size[];
  colors: Color[];
  designs: Design[];
  suppliers: Supplier[];
  initialData?: ProductGroupWithIncludes | null;
  /** URL pública de la tienda para los enlaces «Ver en la tienda» de cada variante. */
  storeUrl?: string | null;
}

export const ProductGroupForm: React.FC<ProductGroupFormProps> = ({
  categories,
  sizes,
  colors,
  designs,
  suppliers,
  initialData,
  storeUrl = null,
}) => {
  const params = useParams();
  // «Escanear y abrir» en Productos llega aquí con la variante leída para resaltarla.
  const highlightedVariantId = useSearchParams()?.get("variante") ?? null;
  // Un producto suelto con el mismo nombre que una variante generada: no se
  // crea el duplicado, se avisa para importarlo. Una consulta por nombre, cacheada.
  const standaloneByName = useRef(new Map<string, boolean>());
  const warnedStandalone = useRef(new Set<string>());
  const isStandaloneTaken = async (variantName: string): Promise<boolean> => {
    const key = variantName.trim().toLowerCase();
    if (!key) return false;
    const cached = standaloneByName.current.get(key);
    if (cached !== undefined) return cached;
    let taken = false;
    try {
      const response = await axios.get(
        `/api/${params.storeId}/search/products/isolated`,
        { params: { query: variantName.trim(), limit: 5 } },
      );
      const rows: { id: string; name: string }[] = response.data?.data ?? [];
      taken = rows.some((row) => row.name.trim().toLowerCase() === key);
    } catch {
      taken = false;
    }
    standaloneByName.current.set(key, taken);
    return taken;
  };
  // Mismas fotos que un producto suelto: es el mismo producto aunque el nombre
  // generado sea otro (así se duplicó «cartuchera lucky girls»).
  const standaloneByImages = useRef(new Map<string, string | null>());
  const isStandaloneImagesTaken = async (
    colorId: string,
    designId: string,
  ): Promise<string | null> => {
    const urls = resolveVariantImages({
      groupImages: form.getValues("images") || [],
      imageMapping: form.getValues("imageMapping") || [],
      colorId,
      designId,
    }).map((image) => image.url);
    if (urls.length === 0) return null;
    const key = imageUrlKey(urls);
    const cached = standaloneByImages.current.get(key);
    if (cached !== undefined) return cached;
    let match: string | null = null;
    try {
      const response = await axios.get(
        `/api/${params.storeId}/search/products/isolated`,
        { params: { imageUrls: urls.join(","), limit: 10 } },
      );
      const rows: { name: string; images?: { url: string }[] }[] =
        response.data?.data ?? [];
      match =
        rows.find(
          (row) => imageUrlKey((row.images ?? []).map((i) => i.url)) === key,
        )?.name ?? null;
    } catch {
      match = null;
    }
    standaloneByImages.current.set(key, match);
    return match;
  };
  const warnStandalone = (variantName: string) => {
    const key = variantName.trim().toLowerCase();
    if (warnedStandalone.current.has(key)) return;
    warnedStandalone.current.add(key);
    toast({
      title: "Ese producto ya existe",
      description: `Ya existe un producto suelto llamado «${variantName}». Usa «Traer existentes» para agregarlo a este grupo en vez de crear uno nuevo.`,
      variant: "warning",
    });
  };
  const warnStandaloneImages = (variantName: string, existing: string) => {
    const key = `img:${existing.trim().toLowerCase()}`;
    if (warnedStandalone.current.has(key)) return;
    warnedStandalone.current.add(key);
    toast({
      title: "Ese producto ya existe",
      description: `«${variantName}» llevaría exactamente las mismas fotos que el producto suelto «${existing}». Usa «Traer existentes» para agregarlo a este grupo en vez de crear uno nuevo.`,
      variant: "warning",
    });
  };
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

  // Controls if we automatically fill the matrix when attributes change
  // Defaults to TRUE for standard creation flow
  // El interruptor «Auto-Generar» desapareció del encabezado; el efecto de
  // sincronización automática se retoma en la fase 3.
  const [autoGenerate, setAutoGenerate] = useState(false);
  const [includeColorInVariantName, setIncludeColorInVariantName] =
    useState(false);
  const [includeDesignInVariantName, setIncludeDesignInVariantName] =
    useState(false);

  // Determine if we are in "Edit" mode
  const isEdit = !!initialData;

  const toastMessage = isEdit
    ? "Grupo actualizado"
    : "Grupo de productos creado";
  const action = isEdit ? "Guardar grupo" : "Crear grupo";
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
        brand: initialData.brand || "",
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
        defaultSupplier: initialData.products?.[0]?.supplierId || "",
        imageMapping:
          initialData.imageMapping ||
          reconstructMapping(getAllImages(), initialData.products),
        isFeatured: initialData.products?.[0]?.isFeatured || false,
        archiveMode: deriveArchiveMode(initialData.products ?? []),
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
            gtin: p.gtin || "",
            mpn: p.mpn || "",
            hasNoProductIdentifier: p.hasNoProductIdentifier ?? true,
            origin: "saved" as const,
            slug: p.slug,
          })) || [],
      }
    : {
        name: "",
        brand: "",
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
        defaultSupplier: "",
        imageMapping: [],
        isFeatured: false,
        archiveMode: "all-published",
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

  // El precio del grupo YA NO se propaga solo a las variantes. Antes un
  // `form.watch` con debounce sobreescribia `price` y `acqPrice` de todas las
  // variantes en cada tecla de los campos de precio: bastaba abrir el grupo y
  // rozar un campo para reemplazar precios puestos a mano variante por
  // variante. Ahora es un boton que dice antes que va a sobreescribir.

  const watchedVariants = form.watch("variants");
  const watchedGroupPrice = form.watch("price");
  const watchedGroupAcqPrice = form.watch("acqPrice");
  const watchedPercentageIncrease = form.watch("percentageIncrease");
  const watchedTransportationCost = form.watch("transportationCost");
  const watchedMiscCost = form.watch("miscCost");

  /** Precio que sugieren el costo y los gastos del grupo. Solo se aplica al pulsar. */
  const suggestedGroupPrice = useMemo(
    () =>
      calculatePrice({
        acqPrice: watchedGroupAcqPrice ?? 0,
        percentageIncrease: watchedPercentageIncrease ?? 0,
        transportationCost: watchedTransportationCost ?? 0,
        miscCost: watchedMiscCost ?? 0,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      watchedGroupAcqPrice,
      watchedPercentageIncrease,
      watchedTransportationCost,
      watchedMiscCost,
    ],
  );

  /** Variantes cuyo precio o costo cambiaria si se aplica el del grupo. */
  const variantsPriceDiff = useMemo(() => {
    const price = Number(watchedGroupPrice) || 0;
    const acqPrice = Number(watchedGroupAcqPrice) || 0;
    if (price <= 0) return [];
    return (watchedVariants ?? [])
      .map((variant, index) => ({ variant, index }))
      .filter(
        ({ variant }) =>
          Number(variant.price ?? 0) !== price ||
          Number(variant.acqPrice ?? 0) !== acqPrice,
      );
  }, [watchedVariants, watchedGroupPrice, watchedGroupAcqPrice]);

  /**
   * Variantes que existen en el grupo pero ya no estan en el formulario. El
   * servidor las archiva (si tienen pedidos) o las elimina; antes lo hacia sin
   * avisar, asi que aqui se dicen por su nombre ANTES de guardar.
   */
  const pendingRemovals = useMemo(() => {
    if (!initialData?.products) return [];
    const keptIds = new Set(
      (watchedVariants ?? [])
        .map((variant) => variant.id)
        .filter(Boolean) as string[],
    );
    return initialData.products
      .filter((product: { id: string }) => !keptIds.has(product.id))
      .map((product: any) => ({
        id: product.id,
        name: product.name as string,
        sku: product.sku as string | null,
        // El servidor decide igual, pero el criterio es el mismo: con pedidos
        // se archiva para conservar el historial.
        willArchive: (product.orderItems?.length ?? 0) > 0,
      }));
  }, [initialData, watchedVariants]);

  const applyGroupPriceToVariants = useCallback(() => {
    const price = Number(form.getValues("price")) || 0;
    const acqPrice = Number(form.getValues("acqPrice")) || 0;
    const current = form.getValues("variants") || [];
    form.setValue(
      "variants",
      current.map((variant) => ({ ...variant, price, acqPrice })),
      { shouldDirty: true },
    );
    toast({
      description: `Precio aplicado a ${current.length} ${current.length === 1 ? "variante" : "variantes"}`,
      variant: "success",
    });
  }, [form, toast]);

  const watchedColorIds = form.watch("colorIds");
  const watchedSizeIds = form.watch("sizeIds");
  const watchedDesignIds = form.watch("designIds");
  const watchedCategoryId = form.watch("categoryId");
  const watchedName = form.watch("name");
  const watchedBrand = form.watch("brand");

  // GENERACIÓN AUTOMÁTICA (interruptor en «Variantes»): al elegir atributos
  // crea las combinaciones que falten sin quitar nada. Antes el efecto salía
  // siempre antes de generar y el interruptor no hacía nada.
  useEffect(() => {
    if (!autoGenerate) return;
    const timer = setTimeout(async () => {
      if (!watchedName.trim() || !watchedCategoryId) return;
      const catObj = categories.find((x) => x.id === watchedCategoryId);
      const sizesObj = sizes.filter((x) => watchedSizeIds.includes(x.id));
      const colorsObj = colors.filter((x) => watchedColorIds.includes(x.id));
      const designsObj = designs.filter((x) => watchedDesignIds.includes(x.id));
      // Un producto necesita tamaño, color y diseño.
      if (!catObj || sizesObj.length === 0 || colorsObj.length === 0 || designsObj.length === 0) {
        return;
      }

      const { generateVariants } = await import("@/lib/variant-generator");
      const generated = generateVariants({
        baseName: watchedName,
        category: { id: catObj.id, name: catObj.name },
        sizes: sizesObj.map((x) => ({ id: x.id, name: x.name, value: x.value ?? "" })),
        colors: colorsObj.map((x) => ({ id: x.id, name: x.name, value: x.value })),
        designs: designsObj.map((x) => ({ id: x.id, name: x.name, value: x.name })),
        includeColorInName: includeColorInVariantName,
        includeDesignInName: includeDesignInVariantName,
      });

      const currentVars = form.getValues("variants") || [];
      const plan = planGeneratedVariants(currentVars, generated, "additive");
      if (plan.toCreate.length === 0) return;

      // Las comprobaciones de «ya existe suelto» van de cinco en cinco.
      const checks = await mapWithConcurrency(plan.toCreate, 5, async (gen) => {
        if (initialData) return { nameTaken: false, sameImagesAs: null as string | null };
        const [nameTaken, sameImagesAs] = await Promise.all([
          isStandaloneTaken(gen.name),
          isStandaloneImagesTaken(gen.colorId, gen.designId),
        ]);
        return { nameTaken, sameImagesAs };
      });
      const ctx: GeneratedRowContext = {
        sizes: sizesObj,
        colors: colorsObj,
        designs: designsObj,
        price: form.getValues("price") || 0,
        acqPrice: form.getValues("acqPrice") || 0,
        supplierId: form.getValues("defaultSupplier") || "",
      };
      const created = plan.toCreate
        .filter((gen, index) => {
          if (checks[index].nameTaken) {
            warnStandalone(gen.name);
            return false;
          }
          if (checks[index].sameImagesAs) {
            warnStandaloneImages(gen.name, checks[index].sameImagesAs);
            return false;
          }
          return true;
        })
        .map((gen) => buildGeneratedRow(gen, ctx));
      if (created.length === 0) return;

      // Aditivo: todo lo que había se queda; solo se suman las que faltan.
      form.setValue("variants", [...currentVars, ...created], {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      toast({
        description: `${created.length} ${created.length === 1 ? "variante nueva se crea" : "variantes nuevas se crean"} al guardar, con 0 unidades.`,
        variant: "success",
      });
    }, 800);

    return () => clearTimeout(timer);
    // Las funciones de comprobación y aviso son estables por render y no
    // entran como dependencias a propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    watchedColorIds,
    watchedSizeIds,
    watchedDesignIds,
    watchedCategoryId,
    watchedName,
    categories,
    sizes,
    colors,
    designs,
    form,
    autoGenerate,
    initialData,
    includeColorInVariantName,
    includeDesignInVariantName,
    toast,
  ]);

  // Form Persistence
  const { clearStorage } = useFormPersist({
    form,
    key: `product-group-form-${params.storeId}-${initialData?.id ?? "new"}`,
    // El borrador nunca restaura filas traídas de productos reales: se
    // vuelven a traer, así no se adopta nada que Paula no eligió hoy.
    sanitizeDraft: (draft) => {
      const { draft: clean, dropped } = stripAdoptedRowsFromDraft(draft);
      if (dropped > 0) {
        toast({
          title: "Borrador restaurado",
          description: `${dropped} ${dropped === 1 ? "producto traído no se restauró" : "productos traídos no se restauraron"}: vuelve a traerlos con «Traer productos existentes».`,
          variant: "warning",
        });
      }
      return clean;
    },
  });
  // Fotos del grupo marcadas con la papelera: se quitan al guardar, nunca antes.
  const [pendingImageRemovals, setPendingImageRemovals] = useState<string[]>([]);

  useFormValidationToast({ form });
  const { confirmLeave, confirmationDialog: leaveDialog } =
    useUnsavedChangesGuard(form, { enabled: !loading });

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

      const images = applyPendingImageRemovals(data.images, pendingImageRemovals);
      const pending = new Set(pendingImageRemovals);
      const mapping = (data.imageMapping || []).filter(
        (entry) => !pending.has(entry.url),
      );
      const { archiveMode, ...rest } = data;
      const payload = {
        ...rest,
        images,
        imageMapping: mapping,
        // Booleano solo con «todas archivadas» / «todas a la venta»; con
        // «por variante» cada fila manda y el servidor no pisa nada.
        ...archivePayload(archiveMode ?? "per-variant"),
      };

      if (initialData) {
        await axios.patch(
          `/api/${params.storeId}/product-groups/${initialData.id}`,
          {
            ...payload,
            preserveSlug: true,
            // El formulario ya listo las bajas en "Cambios pendientes";
            // sin esta bandera el servidor responde 409 en vez de borrar.
            confirmRemovals: true,
          },
        );
      } else {
        await axios.post(`/api/${params.storeId}/product-groups`, payload);
      }

      setPendingImageRemovals([]);
      clearStorage(); // Clear storage on success
      router.push(`/${params.storeId}/productos`);
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
  };

  const onDelete = async (strict: boolean) => {
    try {
      if (!initialData) return;
      setLoading(true);
      const response = await axios.delete<{
        ungrouped: { variants: { id: string }[]; offersCarried: number; photosCopiedTo: number } | null;
      }>(`/api/${params.storeId}/product-groups/${initialData.id}?deleteVariants=${strict}`);
      clearStorage();
      router.push(`/${params.storeId}/productos`);
      router.refresh();
      const ungrouped = response.data?.ungrouped;
      toast({
        title: ungrouped ? "Grupo desagrupado" : "Grupo eliminado",
        description: ungrouped
          ? [
              `${ungrouped.variants.length} ${ungrouped.variants.length === 1 ? "producto suelto conserva" : "productos sueltos conservan"} su SKU, stock, kardex, pedidos y URL.`,
              ungrouped.offersCarried > 0 ? `${ungrouped.offersCarried} ${ungrouped.offersCarried === 1 ? "oferta pasó" : "ofertas pasaron"} a las variantes.` : null,
              ungrouped.photosCopiedTo > 0 ? `Las fotos del grupo se copiaron a ${ungrouped.photosCopiedTo} ${ungrouped.photosCopiedTo === 1 ? "producto que no tenía" : "productos que no tenían"}.` : null,
            ]
              .filter(Boolean)
              .join(" ")
          : "El grupo y sus variantes se eliminaron.",
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
      categories: [...categories]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((category) => ({
          value: category.id,
          label: category.name,
        })),
      sizes: [...sizes]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((size) => ({
          value: size.id,
          label: size.name,
        })),
      colors: [...colors]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((color) => ({
          value: color.id,
          label: color.name,
          style: {
            badgeColor: color.value,
          },
        })),
      designs: [...designs]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((design) => ({
          value: design.id,
          label: design.name,
        })),
      suppliers: [...suppliers]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((supplier) => ({
          value: supplier.id,
          label: supplier.name,
        })),
    }),
    [categories, sizes, colors, designs, suppliers],
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
  const defaultSupplier = form.watch("defaultSupplier");

  // Smart Variant Generation Handler
  const handleMatrixConfirm = async (
    combinations: { colorId: string; designId: string }[],
  ) => {
    const baseName = form.getValues("name").trim();
    if (!baseName) {
      toast({
        title: "Agrega primero el nombre del producto",
        description:
          "Así las variantes se crearán con un nombre claro y consistente.",
        variant: "destructive",
      });
      return;
    }

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
        baseName,
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
        includeColorInName: includeColorInVariantName,
        includeDesignInName: includeDesignInVariantName,
      });
      allGenerated = [...allGenerated, ...result];
    }

    // Estricto: solo quedan las combinaciones marcadas. Las filas con
    // producto real fuera de la matriz se conservan y se avisa; las nuevas
    // sin marcar se descartan.
    const currentVars = form.getValues("variants") || [];
    const plan = planGeneratedVariants(currentVars, allGenerated, "strict");

    // Las comprobaciones de «ya existe suelto» (por nombre y por fotos) iban
    // una tras otra: 5 colores × 6 diseños × 2 tamaños eran hasta 120
    // peticiones en fila. Ahora van de cinco en cinco.
    const checks = await mapWithConcurrency(plan.toCreate, 5, async (gen) => {
      if (initialData) return { nameTaken: false, sameImagesAs: null as string | null };
      const [nameTaken, sameImagesAs] = await Promise.all([
        isStandaloneTaken(gen.name),
        isStandaloneImagesTaken(gen.colorId, gen.designId),
      ]);
      return { nameTaken, sameImagesAs };
    });
    const ctx: GeneratedRowContext = {
      sizes: sizesObj,
      colors,
      designs,
      price: currentPrice || 0,
      acqPrice: currentAcqPrice || 0,
      supplierId: defaultSupplier || "",
    };
    const created = plan.toCreate
      .filter((gen, index) => {
        if (checks[index].nameTaken) {
          warnStandalone(gen.name);
          return false;
        }
        if (checks[index].sameImagesAs) {
          warnStandaloneImages(gen.name, checks[index].sameImagesAs);
          return false;
        }
        return true;
      })
      .map((gen) => buildGeneratedRow(gen, ctx));

    const finalVariants: FormVariant[] = [...plan.kept, ...created, ...plan.keptOutside];
    if (plan.keptOutside.length > 0) {
      const keptById = plan.keptOutside;
      toast({
        title: "Variantes conservadas",
        description: `${keptById.length} ${keptById.length === 1 ? "variante con producto real no estaba" : "variantes con producto real no estaban"} en las combinaciones marcadas y se ${keptById.length === 1 ? "conserva" : "conservan"} igual: ${keptById.map((variant) => variant.name).join(", ")}.`,
        variant: "warning",
      });
    }

    form.setValue("variants", finalVariants, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    const createdCount = finalVariants.filter((variant) => !variant.id).length;
    toast({
      description: `${createdCount} ${createdCount === 1 ? "variante nueva se crea" : "variantes nuevas se crean"} al guardar, con 0 unidades.`,
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
    description?: string | null;
    gtin?: string | null;
    mpn?: string | null;
    hasNoProductIdentifier?: boolean;
    slug?: string;
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

    // Con `shouldDirty`: antes traer productos no ensuciaba el formulario y
    // la guarda de salida no avisaba al volver sin guardar.
    form.setValue("sizeIds", Array.from(currentSizes), { shouldDirty: true });
    form.setValue("colorIds", Array.from(currentColors), { shouldDirty: true });
    form.setValue("designIds", Array.from(currentDesigns), { shouldDirty: true });

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
      form.setValue("images", [...existingImages, ...newImages], {
        shouldDirty: true,
      });
      toast({
        description: `${newImages.length} nuevas imágenes agregadas de los productos importados.`,
      });
    }

    // 4. Los datos del grupo (precio, costo, proveedor) solo se rellenan si
    //    estaban vacíos, para las variantes NUEVAS. Un producto que se trae
    //    conserva lo suyo: precio, costo, proveedor, descripción y código.
    const firstProduct = products[0];
    const dirty = { shouldDirty: true } as const;
    if (!form.getValues("price")) form.setValue("price", firstProduct.price, dirty);
    if (!form.getValues("acqPrice")) {
      form.setValue("acqPrice", firstProduct.acqPrice || 0, dirty);
    }
    if (!form.getValues("defaultSupplier") && firstProduct.supplierId) {
      form.setValue("defaultSupplier", firstProduct.supplierId, dirty);
    }

    // 5. Filas adoptadas: llevan `id` (el servidor adopta en vez de crear) y
    //    todos sus datos reales; `origin: "adopted"` lo muestra la tabla.
    const newVariants: FormVariant[] = products.map((p) => ({
      id: p.id,
      origin: "adopted",
      sku: p.sku || "",
      name: p.name,
      price: p.price,
      acqPrice: p.acqPrice || 0,
      stock: p.stock ?? 0,
      supplierId: p.supplierId || "",
      isFeatured: p.isFeatured || false,
      isArchived: p.isArchived || false,
      size: p.size,
      color: p.color,
      design: p.design,
      images: p.images?.map((i) => i.url) || [],
      description: p.description ?? undefined,
      gtin: p.gtin ?? "",
      mpn: p.mpn ?? "",
      hasNoProductIdentifier: p.hasNoProductIdentifier ?? undefined,
      slug: p.slug,
    }));

    // Sin repetir id ni combinación de atributos: la misma regla para la
    // lista y para el escaneo (lib/product-group-variants).
    const currentVars = form.getValues("variants") || [];
    const { toAdd } = mergeAdoptedVariants(currentVars, newVariants);

    if (toAdd.length > 0) {
      // TURN OFF AUTO-GENERATE upon import to prevent filling the gaps
      setAutoGenerate(false);

      const finalVariants = [...currentVars, ...toAdd];
      const finalImages = [...existingImages, ...newImages];

      form.setValue("variants", finalVariants, { shouldDirty: true });

      // Recalculate Image Mapping for the new set of variants and images
      form.setValue(
        "imageMapping",
        reconstructMapping(finalImages, finalVariants),
        { shouldDirty: true },
      );

      const skipped = newVariants.length - toAdd.length;
      toast({
        title: "Productos traídos al grupo",
        description: `${toAdd.length} ${toAdd.length === 1 ? "producto se adopta" : "productos se adoptan"} con su precio, costo, stock y código.${
          skipped > 0
            ? ` ${skipped} ${skipped === 1 ? "se omitió porque ya está" : "se omitieron porque ya están"} en el grupo o repiten una combinación.`
            : ""
        }`,
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

  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const isDirty = form.formState.isDirty || pendingImageRemovals.length > 0;

  const onClearConfirmed = useCallback(async () => {
    const ok = await requestConfirmation({
      title: isEdit ? "¿Descartar los cambios?" : "¿Limpiar el formulario?",
      description: isEdit
        ? "Se vuelve a lo último guardado. Las fotos que subiste en esta sesión y no guardaste se borran."
        : "Se borra todo lo escrito y las fotos subidas en esta sesión.",
      confirmLabel: isEdit ? "Descartar" : "Limpiar",
      destructive: true,
    });
    if (ok) {
      setPendingImageRemovals([]);
      await onClear();
    }
  }, [isEdit, onClear, requestConfirmation]);

  /** Vuelve a poner en la tabla una variante quitada (antes de guardar). */
  const restoreRemovedVariant = useCallback(
    (productId: string) => {
      const product = initialData?.products?.find((row) => row.id === productId);
      if (!product) return;
      const current = form.getValues("variants") ?? [];
      form.setValue(
        "variants",
        [
          ...current,
          {
            id: product.id,
            sku: product.sku,
            name: product.name,
            size: product.size ? { id: product.size.id, name: product.size.name, value: product.size.value } : undefined,
            color: product.color ? { id: product.color.id, name: product.color.name, value: product.color.value } : undefined,
            design: product.design ? { id: product.design.id, name: product.design.name } : undefined,
            price: product.price,
            acqPrice: product.acqPrice || 0,
            stock: product.stock,
            supplierId: product.supplierId || "",
            isFeatured: product.isFeatured,
            isArchived: product.isArchived,
            images: product.images.map((img) => img.url),
            description: product.description || "",
            gtin: product.gtin || "",
            mpn: product.mpn || "",
            hasNoProductIdentifier: product.hasNoProductIdentifier ?? true,
            origin: "saved",
            slug: product.slug,
          },
        ],
        { shouldDirty: true },
      );
    },
    [form, initialData],
  );

  const imageScopes = useMemo(
    () =>
      currentMapping.reduce<Record<string, string>>(
        (acc, curr) => ({ ...acc, [curr.url]: curr.scope }),
        {},
      ),
    [currentMapping],
  );

  /** «→ 4 variantes», «→ Rosa» … quién recibe una foto según su alcance. */
  const scopeRecipients = (scope: string) => {
    const rows = currentVariants ?? [];
    if (scope === "all") return `${rows.length} ${rows.length === 1 ? "variante" : "variantes"}`;
    const label = availableScopes.find((option) => option.value === scope)?.label ?? scope;
    const count = rows.filter(
      (row) =>
        row.color?.id === scope ||
        row.design?.id === scope ||
        `COMBO|${row.color?.id}|${row.design?.id}` === scope,
    ).length;
    return `${label.replace(/^(Color|Diseño): /, "")} · ${count} ${count === 1 ? "variante" : "variantes"}`;
  };

  const groupStats = useMemo(() => {
    const rows = initialData?.products ?? [];
    return {
      total: rows.length,
      published: rows.filter((row) => !row.isArchived).length,
      units: rows.reduce((sum, row) => sum + (row.stock ?? 0), 0),
    };
  }, [initialData]);
  const groupAxes = useMemo(() => {
    const rows = initialData?.products ?? [];
    const count = (pick: (row: (typeof rows)[number]) => string | undefined) =>
      new Set(rows.map(pick).filter(Boolean)).size;
    return [
      { label: "Tamaño", count: count((row) => row.size?.name) },
      { label: "Color", count: count((row) => row.color?.name) },
      { label: "Diseño", count: count((row) => row.design?.name) },
    ].filter((axis) => axis.count > 1);
  }, [initialData]);
  const newVariantCount = (currentVariants ?? []).filter((row) => !row.id).length;
  const adoptedVariantCount = (currentVariants ?? []).filter((row) => row.origin === "adopted").length;

  const sectionLinks = [
    { id: "fotos", label: "1 · Fotos y reparto" },
    { id: "informacion", label: "2 · Datos del grupo" },
    { id: "asistente", label: "Asistente de producto" },
    { id: "precio", label: "3 · Precio y costo" },
    { id: "variantes", label: `4 · Variantes · ${currentVariants?.length ?? 0}` },
    { id: "descripcion", label: "5 · Descripción" },
  ];

  const openMatrix = () => {
    if (!form.getValues("categoryId")) {
      form.trigger("categoryId");
      toast({
        title: "Falta la subcategoría",
        description: "Elige una subcategoría antes de generar combinaciones.",
        variant: "destructive",
      });
      return;
    }
    if (!selectedColorIds?.length || !selectedDesignIds?.length) {
      toast({
        title: "Faltan colores o diseños",
        description: "Elige al menos un color y un diseño en «Datos del grupo».",
        variant: "destructive",
      });
      return;
    }
    setMatrixOpen(true);
  };

  const pendingSummary = [
    newVariantCount > 0 &&
      `${newVariantCount} ${newVariantCount === 1 ? "variante nueva" : "variantes nuevas"}`,
    adoptedVariantCount > 0 &&
      `${adoptedVariantCount} ${adoptedVariantCount === 1 ? "producto se adopta" : "productos se adoptan"}`,
    pendingRemovals.length > 0 &&
      `${pendingRemovals.length} ${pendingRemovals.length === 1 ? "se quita" : "se quitan"}`,
    pendingImageRemovals.length > 0 &&
      `${pendingImageRemovals.length} ${pendingImageRemovals.length === 1 ? "foto se quita" : "fotos se quitan"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {leaveDialog}
      {confirmationDialog}
      <Modal
        title="Desagrupar o eliminar el grupo"
        description="Dos caminos distintos: desagrupar no borra nada; eliminar borra el grupo y sus variantes."
        isOpen={open}
        onClose={() => setOpen(false)}
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-tint-mint/20 p-3 text-sm">
              <p className="font-semibold text-primary">Desagrupar</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {groupStats.total} {groupStats.total === 1 ? "variante vuelve a ser producto suelto" : "variantes vuelven a ser productos sueltos"} con su SKU, stock, kardex, pedidos, fotos y URL.
                {(initialData?.offers?.length ?? 0) > 0
                  ? ` ${initialData!.offers!.length} ${initialData!.offers!.length === 1 ? "oferta del grupo pasa" : "ofertas del grupo pasan"} a cada una.`
                  : " Se puede volver a agrupar después con «Traer existentes»."}
              </p>
            </div>
            <div className="rounded-lg border bg-tint-pink/20 p-3 text-sm">
              <p className="font-semibold text-destructive">Eliminar grupo y variantes</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Borra el grupo y sus {groupStats.total} {groupStats.total === 1 ? "variante" : "variantes"}. Si alguna tiene pedidos, kits, Mercado Libre, ferias, reposición o kardex, no se puede: archívala o desagrupa.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Button disabled={loading} variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={loading} variant="secondary" onClick={() => onDelete(false)}>
              Desagrupar
            </Button>
            <Button disabled={loading} variant="destructive" onClick={() => onDelete(true)}>
              Eliminar grupo y variantes
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

      <FormPageHeader
        title={isEdit ? watchedName || initialData?.name || "Grupo" : "Nuevo grupo de variantes"}
        badge={
          <>
            <ProductTintBadge label="Grupo de variantes" tone="lavender" />
            {isEdit ? (
              groupAxes.map((axis) => (
                <ProductTintBadge key={axis.label} label={`${axis.label} · ${axis.count} valores`} tone="slate" />
              ))
            ) : (
              <ProductTintBadge label="Borrador · aún no está en la tienda" tone="slate" />
            )}
          </>
        }
        summary={
          isEdit
            ? `${groupStats.total} ${groupStats.total === 1 ? "variante" : "variantes"} · ${groupStats.published} a la venta · ${groupStats.units} unidades en total`
            : "Un mismo artículo en varios colores o tamaños. Cada variante es un producto con su propio SKU, precio y stock."
        }
        backLabel="Volver a productos"
        onBack={async () => {
          if (await confirmLeave()) router.push(`/${params.storeId}/productos`);
        }}
        actions={
          <>
            <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => setImportOpen(true)}>
              <PackageCheckIcon className="mr-2 h-4 w-4" aria-hidden="true" />
              Traer existentes
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={loading} onClick={openMatrix}>
              <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Generar combinaciones
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" disabled={loading}>
                  Más
                  <ChevronDown className="ml-1 h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onClick={() => void onClearConfirmed()}>
                  <Eraser className="mr-2 h-4 w-4" aria-hidden="true" />
                  {isEdit ? "Descartar cambios" : "Limpiar formulario"}
                </DropdownMenuItem>
                {isEdit && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setOpen(true)}>
                      <Trash className="mr-2 h-4 w-4" aria-hidden="true" />
                      Desagrupar o eliminar…
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <MobileSectionNav sections={sectionLinks} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex w-full flex-col gap-4">
          <SectionCard
            id="fotos"
            step={1}
            title="Fotos y reparto"
            description="Cada foto va a todas las variantes o solo a un color, diseño o combinación. Lo que quites con la papelera se borra al guardar."
          >
            <FormField
              control={form.control}
              name="images"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Fotos del grupo</FormLabel>
                  <FormControl>
                    <ImageUpload
                      value={field.value.map((v) => ({ ...v, isMain: v.isMain ?? false }))}
                      disabled={loading}
                      maxImages={8}
                      onChange={(images) => field.onChange(images)}
                      pendingRemovals={pendingImageRemovals}
                      onMarkRemoval={(url) =>
                        setPendingImageRemovals((pending) => (pending.includes(url) ? pending : [...pending, url]))
                      }
                      onUndoRemoval={(url) => setPendingImageRemovals((pending) => pending.filter((item) => item !== url))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {currentImages?.length > 0 && (selectedColorIds?.length > 0 || selectedDesignIds?.length > 0) && (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-sm font-semibold text-primary">Reparto por variante</p>
                  <p className="text-xs text-muted-foreground">
                    Debajo de cada foto eliges quién la recibe. Una variante con fotos propias no se toca.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                  {currentImages.map((img) => {
                    const scope = currentMapping.find((m) => m.url === img.url)?.scope || "all";
                    const isPending = pendingImageRemovals.includes(img.url);
                    return (
                      <div
                        key={img.url}
                        className={cn("flex flex-col gap-2 rounded-lg border p-2", isPending && "opacity-50")}
                      >
                        <div className="relative aspect-square overflow-hidden rounded-md border">
                          <Image src={img.url} alt="" fill sizes="(max-width: 640px) 50vw, 200px" className="object-cover" />
                        </div>
                        <Select
                          key={`${img.url}-${scope}-${availableScopes.length}`}
                          disabled={loading || isPending}
                          value={scope}
                          onValueChange={(val) => {
                            const existingIndex = currentMapping.findIndex((m) => m.url === img.url);
                            const newMapping = [...currentMapping];
                            if (existingIndex >= 0) newMapping[existingIndex] = { ...newMapping[existingIndex], scope: val };
                            else newMapping.push({ url: img.url, scope: val });
                            form.setValue("imageMapping", newMapping, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs" aria-label="Quién recibe esta foto">
                            <SelectValue placeholder="Alcance" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableScopes.map((s) => (
                              <SelectItem key={s.value} value={s.value} disabled={s.disabled} className={s.disabled ? "font-semibold opacity-100" : ""}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-[11px] text-muted-foreground">
                          {isPending ? "Se quita al guardar" : `→ ${scopeRecipients(scope)}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard
            id="informacion"
            step={2}
            title="Datos del grupo"
            description="Nombre, marca, subcategoría y atributos. Se heredan a cada variante nueva; no pisan lo que ya guardaste en una variante."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="col-span-full">
                    <FormLabel isRequired>Nombre</FormLabel>
                    <FormControl>
                      <Input disabled={loading} maxLength={PRODUCT_NAME_MAX_LENGTH} placeholder="Ej. Cartuchera Wisdom" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="brand"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Marca o fabricante</FormLabel>
                    <FormControl>
                      <Input disabled={loading} placeholder="Ej. Sanrio, Stabilo" {...field} />
                    </FormControl>
                    <FormDescription>Se aplica a todas las variantes en Google Merchant.</FormDescription>
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
                    <Select
                      key={field.value}
                      disabled={loading || currentVariants?.some((v) => v.id)}
                      onValueChange={field.onChange}
                      value={field.value}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona una subcategoría" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {selectOptions.categories.map((category) => (
                          <SelectItem key={category.value} value={category.value}>
                            {category.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {currentVariants?.some((v) => v.id) && (
                      <FormDescription>
                        Bloqueada: hay variantes guardadas. Se cambia desde la ficha de cada producto.
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="defaultSupplier"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between gap-2">
                      <FormLabel>Proveedor para variantes nuevas</FormLabel>
                      <button
                        type="button"
                        disabled={loading}
                        className="text-xs text-primary underline underline-offset-2 hover:text-primary/80"
                        onClick={() => {
                          const val = form.getValues("defaultSupplier");
                          const current = form.getValues("variants");
                          if (!val || !current?.length) return;
                          form.setValue("variants", current.map((v) => ({ ...v, supplierId: val })), { shouldDirty: true });
                          toast({ description: `Proveedor aplicado a ${current.length} ${current.length === 1 ? "variante" : "variantes"}` });
                        }}
                      >
                        Aplicar a todas
                      </button>
                    </div>
                    <Select key={field.value} disabled={loading} onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un proveedor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {selectOptions.suppliers.map((supplier) => (
                          <SelectItem key={supplier.value} value={supplier.value}>
                            {supplier.label}
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
                      <MultiSelect options={selectOptions.sizes} defaultValue={field.value} value={field.value} onValueChange={field.onChange} placeholder="Elige tamaños…" variant="secondary" responsive className="h-10" />
                    </FormControl>
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
                      <MultiSelect options={selectOptions.colors} defaultValue={field.value} value={field.value} onValueChange={field.onChange} placeholder="Elige colores…" variant="secondary" responsive className="h-10" />
                    </FormControl>
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
                      <MultiSelect options={selectOptions.designs} defaultValue={field.value} value={field.value} onValueChange={field.onChange} placeholder="Elige diseños…" variant="secondary" responsive className="h-10" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="col-span-full rounded-lg border bg-muted/30 p-4">
                <p className="text-sm font-medium">Nombre de las variantes nuevas</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Color y diseño siguen siendo obligatorios para inventario y SKU. Inclúyelos en el nombre solo cuando la clienta pueda distinguir y elegir esa variante.
                </p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <Checkbox checked={includeColorInVariantName} disabled={loading || selectedColorIds.length === 0} onCheckedChange={(checked) => setIncludeColorInVariantName(checked === true)} />
                    <span>Incluir el color en cada nombre</span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <Checkbox checked={includeDesignInVariantName} disabled={loading || selectedDesignIds.length === 0} onCheckedChange={(checked) => setIncludeDesignInVariantName(checked === true)} />
                    <span>Incluir el diseño en cada nombre</span>
                  </label>
                </div>
              </div>
              <FormField
                control={form.control}
                name="isFeatured"
                render={({ field }) => (
                  <FormItem className="col-span-full flex items-start space-x-3 space-y-0 rounded-md border p-4 sm:col-span-1">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Destacado</FormLabel>
                      <FormDescription>Las variantes nuevas aparecen en la página principal.</FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </div>
          </SectionCard>

          <SectionCard
            id="asistente"
            title="Asistente de producto"
            description="Lee las fotos del grupo y propone nombre, marca, clasificación y descripción. Tú apruebas campo por campo; nada se guarda solo."
          >
            <ProductNameAssistant
              currentName={watchedName}
              categoryName={categories.find((category) => category.id === watchedCategoryId)?.name}
              brand={watchedBrand}
              includeVariantAttributes={false}
              disabled={loading}
              storeId={params.storeId}
              imageUrls={currentImages?.map((image) => image.url)}
              visualFieldAvailability={{
                brand: true,
                category: !currentVariants?.some((variant) => variant.id),
                size: false,
                color: false,
                design: false,
                catalogAttributes: false,
              }}
              onApply={(name) => form.setValue("name", name, { shouldDirty: true, shouldTouch: true, shouldValidate: true })}
              onApplyVisualAnalysis={(analysis) => {
                const options = { shouldDirty: true, shouldTouch: true, shouldValidate: true };
                if (analysis.brand) form.setValue("brand", analysis.brand, options);
                if (analysis.categoryId && !currentVariants?.some((variant) => variant.id)) {
                  form.setValue("categoryId", analysis.categoryId, options);
                }
              }}
              onApplyDescription={(description) => form.setValue("description", description, { shouldDirty: true, shouldTouch: true, shouldValidate: true })}
            />
          </SectionCard>

          <SectionCard
            id="precio"
            step={3}
            title="Precio y costo para variantes nuevas"
            description="Lo que heredan las variantes que se crean. Las guardadas o traídas conservan su precio hasta que pulses «Aplicar»."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <FormField control={form.control} name="acqPrice" render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Costo de compra</FormLabel>
                  <FormControl><CurrencyInput placeholder="$ 1.000" disabled={loading} value={field.value} onChange={field.onChange} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="price" render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Precio de venta</FormLabel>
                  <FormControl><CurrencyInput placeholder="$ 1.000" disabled={loading} value={field.value} onChange={field.onChange} /></FormControl>
                  {suggestedGroupPrice > 0 && suggestedGroupPrice !== Number(field.value) && (
                    <button type="button" disabled={loading} onClick={() => form.setValue("price", suggestedGroupPrice, { shouldDirty: true })} className="self-start text-xs text-primary underline underline-offset-2 hover:text-primary/80">
                      Usar el sugerido: {currencyFormatter(suggestedGroupPrice)}
                    </button>
                  )}
                  <FormMessage />
                </FormItem>
              )} />
              <details className="col-span-full rounded-lg border bg-muted/20 p-3">
                <summary className="cursor-pointer text-sm font-medium text-primary">Calculadora de precio (no se guarda)</summary>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <FormField control={form.control} name="percentageIncrease" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Incremento</FormLabel>
                      <FormControl><PercentageInput disabled={loading} placeholder="30" value={field.value} onChange={field.onChange} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="transportationCost" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Transporte por unidad</FormLabel>
                      <FormControl><CurrencyInput placeholder="$ 0" disabled={loading} value={field.value} onChange={field.onChange} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="miscCost" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Otros gastos por unidad</FormLabel>
                      <FormControl><CurrencyInput placeholder="$ 0" disabled={loading} value={field.value} onChange={field.onChange} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </details>
              {variantsPriceDiff.length > 0 && (
                <div className="col-span-full flex flex-col gap-3 rounded-lg border border-tint-cream bg-tint-cream/25 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-semibold text-primary">
                        Aplicar este precio sobrescribe {variantsPriceDiff.length} {variantsPriceDiff.length === 1 ? "variante" : "variantes"}
                      </p>
                      <p className="text-xs text-muted-foreground">El stock nunca se toca. Solo cambia lo que listamos aquí.</p>
                    </div>
                  </div>
                  <ul className="flex flex-col gap-1 text-xs text-primary">
                    {variantsPriceDiff.slice(0, 6).map(({ variant, index }) => (
                      <li key={variant.id ?? index} className="flex flex-wrap gap-2">
                        <span className="font-medium">{variant.name || variant.sku || `Variante ${index + 1}`}</span>
                        <span className="text-muted-foreground">
                          {currencyFormatter(Number(variant.price ?? 0))} → {currencyFormatter(Number(watchedGroupPrice) || 0)}
                        </span>
                      </li>
                    ))}
                    {variantsPriceDiff.length > 6 && <li className="text-muted-foreground">y {variantsPriceDiff.length - 6} más</li>}
                  </ul>
                  <Button type="button" variant="soft" size="sm" disabled={loading} onClick={applyGroupPriceToVariants} className="self-start">
                    Aplicar a {variantsPriceDiff.length} {variantsPriceDiff.length === 1 ? "variante" : "variantes"}
                  </Button>
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard
            id="variantes"
            step={4}
            title="Variantes"
            description="Cada fila es un producto real con su SKU, precio, stock e identificador. Nada cambia en la tienda hasta guardar."
            action={
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => setImportOpen(true)}>
                  <PackageCheckIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                  Traer existentes
                </Button>
                <ScanIntoGroupButton onImport={handleImport} disabled={loading} />
                <Button type="button" variant="outline" size="sm" disabled={loading} onClick={openMatrix}>
                  <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Generar combinaciones
                </Button>
              </div>
            }
          >
            <p className="text-xs text-muted-foreground">
              Traer conserva precio, costo, stock, código y URL de cada producto (también escaneando su etiqueta o código de barras). Generar crea variantes nuevas con 0 unidades y avisa si alguna ya existe suelta.
            </p>
            <label className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
              <Switch
                checked={autoGenerate}
                onCheckedChange={setAutoGenerate}
                disabled={loading}
                aria-label="Generar todas las combinaciones al elegir atributos"
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-primary">Generar todas las combinaciones al elegir atributos</span>
                <span className="block text-xs text-muted-foreground">
                  Suma las que falten sin quitar nada. Con varios colores y diseños, «Generar combinaciones» deja marcar solo las que existen.
                </span>
              </span>
            </label>
            <VariantGrid
              form={form}
              loading={loading}
              images={currentImages}
              imageScopes={imageScopes}
              suppliers={suppliers}
              storeId={params.storeId as string}
              storeUrl={storeUrl}
              isEditMode={isEdit}
              sizes={sizes}
              colors={colors}
              designs={designs}
              highlightId={highlightedVariantId}
              onBatchIntake={(variantIds) => {
                const variants = form.getValues("variants") || [];
                const selected: BatchIntakeVariant[] = variantIds
                  .map((id) => {
                    const v = variants.find((variant) => variant.id === id);
                    return v ? { id: v.id!, name: v.name || "Variante", currentStock: v.stock || 0 } : null;
                  })
                  .filter((v): v is BatchIntakeVariant => v !== null);
                if (selected.length > 0) {
                  setBatchIntakeVariants(selected);
                  setBatchIntakeOpen(true);
                }
              }}
            />

            <FormField
              control={form.control}
              name="archiveMode"
              render={({ field }) => {
                const rows = describeArchiveRows(watchedVariants ?? []);
                return (
                  <FormItem>
                    <FormLabel>Estado en la tienda</FormLabel>
                    <FormControl>
                      <RadioCards<GroupArchiveMode>
                        value={field.value ?? "per-variant"}
                        onChange={field.onChange}
                        label="Estado en la tienda"
                        idPrefix="estado-grupo"
                        disabled={loading}
                        columns={3}
                        options={[
                          { value: "all-published", title: "Todas a la venta", hint: "Publica todas las variantes al guardar." },
                          { value: "all-archived", title: "Todas archivadas", hint: "Saca el grupo de la tienda y pausa Mercado Libre. Conserva todo." },
                          {
                            value: "per-variant",
                            title: "Por variante",
                            hint: rows.saved > 0
                              ? `Cada fila decide. Hoy: ${rows.live} a la venta, ${rows.archived} ${rows.archived === 1 ? "archivada" : "archivadas"}.`
                              : "Cada fila decide su estado.",
                          },
                        ]}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {pendingRemovals.length > 0 && (
              <section aria-labelledby="cambios-pendientes-titulo" className="flex flex-col gap-3 rounded-xl border border-tint-pink bg-tint-pink/20 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <div className="flex flex-col gap-1">
                    <h3 id="cambios-pendientes-titulo" className="text-sm font-semibold text-primary">
                      Al guardar se quitarán {pendingRemovals.length} {pendingRemovals.length === 1 ? "variante" : "variantes"} del grupo
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Se revisa qué la usa (pedidos, kits, Mercado Libre, ferias, reposición, kardex): con bloqueos se archiva y conserva su historial; libre se elimina y su URL redirige a una hermana.
                    </p>
                  </div>
                </div>
                <ul className="flex flex-col gap-1.5 text-xs">
                  {pendingRemovals.map((removal) => (
                    <li key={removal.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-primary">{removal.name}</span>
                      {removal.sku && <span className="font-mono text-muted-foreground">{removal.sku}</span>}
                      <ProductTintBadge label={removal.willArchive ? "Se archiva (tiene pedidos)" : "Se elimina si nada la usa"} tone={removal.willArchive ? "cream" : "pink"} />
                      <button
                        type="button"
                        className="text-primary underline underline-offset-2"
                        onClick={() => restoreRemovedVariant(removal.id)}
                      >
                        Deshacer
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </SectionCard>

          <BatchIntakeModal
            isOpen={batchIntakeOpen}
            onClose={() => { setBatchIntakeOpen(false); setBatchIntakeVariants([]); }}
            variants={batchIntakeVariants}
            defaultCost={form.getValues("acqPrice") || 0}
            defaultSupplierId={form.getValues("defaultSupplier") || ""}
            suppliers={suppliers}
          />

          <SectionCard
            id="descripcion"
            step={5}
            title="Descripción"
            description="Se muestra en la tienda y en Google. Las variantes nuevas la heredan; las guardadas conservan la suya."
          >
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <RichTextEditor placeholder="Describe el grupo de productos…" value={field.value || ""} onChange={field.onChange} templates={PRODUCT_DESCRIPTION_TEMPLATES} showSeoGuidance />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </SectionCard>

          <FormStickyFooter
            className="bottom-[84px] z-20 lg:bottom-2"
            note={
              <>
                {isDirty && <ProductTintBadge label="Cambios sin guardar" tone="cream" className="mr-2" />}
                {pendingSummary
                  ? `Al guardar: ${pendingSummary}.`
                  : isEdit
                    ? "Los cambios se aplican al guardar y la tienda se actualiza sola."
                    : "Revisa fotos, datos y variantes; el grupo se crea al guardar."}
              </>
            }
          >
            <Button type="button" variant="outline" disabled={loading || !isDirty} onClick={() => void onClearConfirmed()}>
              Descartar
            </Button>
            <Button disabled={loading} type="submit">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  {pendingText}
                </>
              ) : (
                action
              )}
            </Button>
          </FormStickyFooter>
        </form>
      </Form>
    </>
  );
};
