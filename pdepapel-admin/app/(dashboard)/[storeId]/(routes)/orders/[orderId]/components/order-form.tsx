"use client";

import { useFormPersist } from "@/hooks/use-form-persist";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  DiscountType,
  OrderStatus,
  OrderType,
  PaymentMethod,
  ShippingProvider,
  ShippingStatus,
  type Box,
  type Category,
  type Coupon,
} from "@prisma/client";
import axios from "axios";
import {
  ArrowLeft,
  Check,
  ChevronsUpDown,
  Copy,
  Eraser,
  Loader2,
  Package,
  Percent,
  Plus,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  Store,
  Ticket,
  Trash,
  Truck,
  Wallet,
  Wand2,
} from "lucide-react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { isValidPhoneNumber } from "react-phone-number-input";
import z from "zod";

import { AlertModal } from "@/components/modals/alert-modal";
import { GuideConfirmationModal } from "@/components/modals/guide-confirmation-modal";
import { ProductConversionModal } from "@/components/modals/product-conversion-modal";
import { AdminCartItem } from "@/components/ui/admin-cart-item";
import { EnhancedProductSelector } from "@/components/ui/enhanced-product-selector";
import { Heading } from "@/components/ui/heading";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WhatsappButton } from "@/components/whatsapp-button";
import { useToast } from "@/hooks/use-toast";

const generateGuestId = () => {
  return "guest_" + Math.random().toString(36).substr(2, 9);
};

const parseOrderDetails = (details: any) => {
  if (!details) return {};
  if (typeof details === "string") {
    try {
      return JSON.parse(details);
    } catch {
      return {};
    }
  }
  return details;
};

import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DatePicker } from "@/components/ui/date-picker";
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
import { Label } from "@/components/ui/label";
import {
  LocationCombobox,
  type LocationOption,
} from "@/components/ui/location-combobox";
import { OrderStatusSelector } from "@/components/ui/order-status-selector";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { QuantitySelector } from "@/components/ui/quantity-selector";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { UserCombobox } from "@/components/ui/user-combobox";
import {
  Models,
  detailsTitleOptions,
  discountOptions,
  paymentMethodsByOption,
  paymentOptions,
  shippingOptions,
} from "@/constants";
import { ENVIOCLICK_LIMITS, getCarrierInfo } from "@/constants/shipping";
import { getErrorMessage } from "@/lib/api-errors";
import { cn, currencyFormatter } from "@/lib/utils";
import { getBoxes } from "../server/get-boxes";
import { getCoupons } from "../server/get-coupons";
import { type GetOrderResult, type ProductOption } from "../server/get-order";
import { QuoteRequestsList } from "./quote-requests-list";
import { TestDataGenerator } from "./test-data-generator";

const paymentSchema = z
  .object({
    method: z.nativeEnum(PaymentMethod),
    transactionId: z.string(),
  })
  .partial();

const shippingSchema = z
  .object({
    status: z.nativeEnum(ShippingStatus),
    courier: z.string(),
    carrierName: z.string(),
    productName: z.string(),
    flete: z.coerce.number(),
    minimumInsurance: z.coerce.number(),
    deliveryDays: z.coerce.number(),
    isCOD: z.boolean(),
    cost: z.coerce.number(),
    trackingCode: z.string(),
    trackingUrl: z.string().optional(),
    guideUrl: z.string().optional(),
    estimatedDeliveryDate: z.preprocess((arg) => {
      if (typeof arg === "string" || arg instanceof Date) {
        const date = new Date(arg);
        return isNaN(date.getTime()) ? undefined : date;
      }
      return arg;
    }, z.date().optional()),
    notes: z.string().optional(),
    adminNotes: z.string().optional(),
    internalNotes: z.string().optional(),
    boxId: z.string().optional(),
  })
  .partial();

const discountSchema = z
  .object({
    type: z.nativeEnum(DiscountType),
    amount: z.coerce.number().min(0),
    reason: z.string(),
  })
  .partial();

const formSchema = z
  .object({
    userId: z.string().default(""),
    guestId: z.string().default(""),
    fullName: z
      .string()
      .min(1, "Debes agregar un nombre")
      .max(50, "El nombre completo no puede exceder 50 caracteres"),
    email: z
      .string()
      .max(
        ENVIOCLICK_LIMITS.email.max,
        `El correo no puede exceder ${ENVIOCLICK_LIMITS.email.max} caracteres`,
      )
      .optional(),
    phone: z.string().optional(),
    address: z
      .string()
      .max(
        ENVIOCLICK_LIMITS.address.max,
        `La dirección no puede exceder ${ENVIOCLICK_LIMITS.address.max} caracteres`,
      )
      .optional(),
    city: z.string().optional(),
    department: z.string().optional(),
    daneCode: z.string().optional(),
    neighborhood: z
      .string()
      .max(
        ENVIOCLICK_LIMITS.suburb.max,
        `El barrio no puede exceder ${ENVIOCLICK_LIMITS.suburb.max} caracteres`,
      )
      .optional(),
    addressReference: z
      .string()
      .max(
        ENVIOCLICK_LIMITS.reference.max,
        `La referencia no puede exceder ${ENVIOCLICK_LIMITS.reference.max} caracteres`,
      )
      .optional(),
    address2: z
      .string()
      .max(
        ENVIOCLICK_LIMITS.crossStreet.max,
        `La intersección no puede exceder ${ENVIOCLICK_LIMITS.crossStreet.max} caracteres`,
      )
      .optional(),
    company: z
      .string()
      .max(
        ENVIOCLICK_LIMITS.company.max,
        `La empresa no puede exceder ${ENVIOCLICK_LIMITS.company.max} caracteres`,
      )
      .optional(),
    adminNotes: z.string().optional(),
    internalNotes: z.string().optional(),

    orderItems: z
      .array(
        z.object({
          productId: z.string().nullable().optional(),
          quantity: z.coerce.number().min(1),
          // Snapshot & Cart fields
          name: z.string().min(1, "Nombre requerido"),
          price: z.coerce.number().min(0),
          discountedPrice: z.coerce.number().optional(),
          sku: z.string().optional(),
          imageUrl: z.string().optional(),
          isCustom: z.boolean().default(false),
          // Helper for editing
          stock: z.number().optional(),
          productGroup: z
            .object({
              name: z.string(),
            })
            .nullable()
            .optional(),
          id: z.string().optional(),
        }),
      )
      .nonempty({ message: "Debes agregar al menos 1 producto" }),
    type: z.nativeEnum(OrderType).default(OrderType.STANDARD),
    status: z.nativeEnum(OrderStatus),
    payment: paymentSchema,
    shipping: shippingSchema,
    shippingProvider: z
      .nativeEnum(ShippingProvider)
      .default(ShippingProvider.NONE),
    envioClickIdRate: z.number().optional(),
    documentId: z.string().default(""),
    subtotal: z.coerce.number().default(0),
    total: z.coerce.number().default(0),
    discount: discountSchema,
    couponCode: z.string().optional(),
    expiresAt: z.preprocess((arg) => {
      if (typeof arg === "string" || arg instanceof Date) {
        const date = new Date(arg);
        return isNaN(date.getTime()) ? undefined : date;
      }
      return arg;
    }, z.date().optional()),
  })
  .superRefine((data, ctx) => {
    // 1. EnvioClick Validation
    if (data.shippingProvider === "ENVIOCLICK") {
      if (!data.city || !data.department || !data.daneCode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Ciudad, departamento y código DANE son requeridos para EnvioClick",
          path: ["daneCode"],
        });
      }
    }

    // 2. Real Order Validation (Require Contact Info)
    const isRealOrder = (
      [
        OrderStatus.CREATED,
        OrderStatus.PENDING,
        OrderStatus.PAID,
        OrderStatus.SENT,
      ] as OrderStatus[]
    ).includes(data.status);

    if (isRealOrder) {
      if (!data.email || !z.string().email().safeParse(data.email).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "El correo es requerido para órdenes activas",
          path: ["email"],
        });
      }
      if (!data.phone || !isValidPhoneNumber(data.phone)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "El teléfono válido es requerido para órdenes activas",
          path: ["phone"],
        });
      }
      if (!data.address || data.address.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "La dirección es requerida para órdenes activas",
          path: ["address"],
        });
      }
    }
  });

type OrderFormValues = z.infer<typeof formSchema>;

interface ShippingQuote {
  idRate: number;
  carrier: string;
  product: string;
  flete: number;
  minimumInsurance: number;
  totalCost: number;
  deliveryDays: string | number;
  isCOD: boolean;
}

// Helper to safely parse dates
const safeDate = (date: string | Date | null | undefined): Date | undefined => {
  if (!date) return undefined;
  const parsed = new Date(date);
  // Check if it's a valid date object and not "Invalid Date"
  return parsed instanceof Date && !isNaN(parsed.getTime())
    ? parsed
    : undefined;
};

interface OrderFormProps {
  initialData: GetOrderResult["order"];
  products: ProductOption[];
  availableCoupons: Awaited<ReturnType<typeof getCoupons>>;
  users: {
    value: string;
    label: string;
    image?: string;
    email?: string;
    phone?: string;
  }[];
  categories: Category[];
  locations: LocationOption[];
  boxes: Awaited<ReturnType<typeof getBoxes>>;
}

export const OrderForm: React.FC<OrderFormProps> = ({
  initialData,
  products,
  categories,
  availableCoupons,
  users,
  locations,
  boxes,
}) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const handleUserSelect = async (rawId: string, user: any) => {
    // Process ID prefixes from Search API
    let finalUserId = rawId;
    let finalGuestId = "";

    if (rawId?.startsWith("clerk_")) {
      finalUserId = rawId.replace("clerk_", "");
    } else if (rawId?.startsWith("guest_")) {
      finalUserId = ""; // No Clerk ID for guests
      finalGuestId = rawId; // Keep the guest identifier
    }

    // Update the form field for userId used by RHF
    form.setValue("userId", finalUserId ?? "");
    form.setValue("guestId", finalGuestId);

    if (!rawId || !user) {
      return;
    }

    // Parse name robustly (allow spaces in phone number)
    const cleanName =
      (user.label || "").replace(/\s*\(\+?[\d\s.-]+\)\s*/g, "").trim() ||
      user.label ||
      "Cliente";

    // Use setTimeout to avoid conflict with other effects (e.g. form persistence or resets)
    setTimeout(() => {
      const options = { shouldValidate: true, shouldDirty: true };
      form.setValue("fullName", cleanName, options);
      form.setValue("email", user.email || "", options);
      form.setValue("phone", user.phone || "", options);
      form.setValue("documentId", user.documentId || "", options);

      // Reset address fields to avoid confusion
      form.setValue("address", "", options);
      form.setValue("city", "", options);
      form.setValue("department", "", options);
      form.setValue("daneCode", "", options);
      form.setValue("neighborhood", "", options);
      form.setValue("addressReference", "", options);
      form.setValue("address2", "", options);
      form.setValue("company", "", options);
    }, 100);

    try {
      toast({
        title: "Cargando datos...",
        description: "Buscando información del último pedido...",
      });

      const lookupId = rawId?.startsWith("clerk_") ? finalUserId : rawId;
      const response = await axios.get(
        `/api/${params.storeId}/customers/${lookupId}/last-order`,
      );
      const lastOrder = response.data;
      // console.log("DEBUG_LAST_ORDER_RESPONSE", lastOrder);

      if (lastOrder && Object.keys(lastOrder).length > 0) {
        const options = { shouldValidate: true, shouldDirty: true };
        // Address & Company Info
        if (lastOrder.address)
          form.setValue("address", lastOrder.address, options);
        if (lastOrder.city) form.setValue("city", lastOrder.city, options);
        if (lastOrder.department)
          form.setValue("department", lastOrder.department, options);
        if (lastOrder.daneCode)
          form.setValue("daneCode", lastOrder.daneCode, options);
        if (lastOrder.neighborhood)
          form.setValue("neighborhood", lastOrder.neighborhood, options);
        if (lastOrder.addressReference)
          form.setValue(
            "addressReference",
            lastOrder.addressReference,
            options,
          );
        if (lastOrder.address2)
          form.setValue("address2", lastOrder.address2, options);
        if (lastOrder.company)
          form.setValue("company", lastOrder.company, options);

        // Backfill contact info if missing from User Object but present in Last Order
        if (!user.email && lastOrder.email)
          form.setValue("email", lastOrder.email, options);
        if (!user.phone && lastOrder.phone)
          form.setValue("phone", lastOrder.phone, options);
        if (!user.documentId && lastOrder.documentId)
          form.setValue("documentId", lastOrder.documentId, options);

        // Force Name Update from Last Order (Most authoritative source)
        if (lastOrder.fullName) {
          form.setValue("fullName", lastOrder.fullName, options);
        }

        toast({
          title: "Datos completados",
          description: "Se han cargado los datos del cliente.",
        });
      } else {
        toast({
          description: "Datos básicos del usuario cargados.",
        });
      }
    } catch (error) {
      console.error("Error loading last order:", error);
      // Don't error toast, as basic info is still useful
    }
  };

  const [open, setOpen] = useState(false);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [shippingQuotes, setShippingQuotes] = useState<ShippingQuote[]>([]);
  const [selectedRateId, setSelectedRateId] = useState<number | null>(
    initialData?.shipping?.envioClickIdRate || null,
  );

  // State to store recommended box from quote response
  const [recommendedBox, setRecommendedBox] = useState<any>(null);

  const [showGuideConfirmation, setShowGuideConfirmation] = useState(false);

  const [coupon, setCoupon] = useState<Coupon | null>(null);

  const [conversionIndex, setConversionIndex] = useState<number | null>(null);

  const { title, description, toastMessage, action, pendingText } = useMemo(
    () => ({
      title: initialData ? "Editar orden" : "Crear orden",
      description: initialData ? "Editar una orden" : "Crear una nueva orden",
      toastMessage: initialData ? "Orden actualizada" : "Orden creada",
      action: initialData ? "Guardar cambios" : "Crear",
      pendingText: initialData ? "Actualizando..." : "Creando...",
    }),
    [initialData],
  );

  const getOriginalDiscountAmount = (initialData: GetOrderResult["order"]) => {
    if (!initialData?.discount || !initialData?.discountType) return undefined;

    if (initialData.discountType === DiscountType.PERCENTAGE) {
      return Number(
        ((initialData.discount / initialData.subtotal) * 100).toFixed(0),
      );
    }

    return initialData.discount;
  };

  const defaultValues = useMemo(
    () =>
      initialData
        ? {
            ...initialData,
            userId: initialData.userId || "",
            guestId: initialData.guestId || "",
            documentId: initialData.documentId || "",
            email: initialData.email || "",
            address: initialData.address || "",
            city: initialData.city || "",
            department: initialData.department || "",
            daneCode: initialData.daneCode || "",
            neighborhood: initialData.neighborhood || "",
            addressReference: initialData.addressReference || "",
            address2: initialData.address2 || "",
            company: initialData.company || "",
            subtotal: initialData.subtotal || 0,
            total: initialData.total || 0,
            discount: {
              type: initialData.discountType || undefined,
              amount: getOriginalDiscountAmount(initialData),
              reason: initialData.discountReason || undefined,
            },
            adminNotes: (initialData as any).adminNotes || undefined,
            internalNotes: (initialData as any).internalNotes || undefined,
            couponCode: initialData.coupon?.code || "",
            orderItems: initialData.orderItems.map((item: any) => {
              const product = products.find((p) => p.value === item.productId);
              return {
                id: item.id || undefined,
                productId: item.productId || null,
                quantity: item.quantity,
                name: item.name || product?.name || "Producto sin nombre",
                price: item.price || product?.price || 0,
                sku: item.sku || product?.sku || "",
                imageUrl: item.imageUrl || product?.image || "",
                isCustom: item.isCustom || false,
                stock: product?.stock || 0,
              };
            }),
            payment: {
              ...initialData.payment,
              transactionId: initialData.payment?.transactionId || undefined,
            },
            shippingProvider:
              initialData.shipping?.provider || ShippingProvider.NONE,
            envioClickIdRate:
              initialData.shipping?.envioClickIdRate || undefined,
            shipping: {
              ...initialData.shipping,
              status: initialData.shipping?.status || ShippingStatus.Preparing,
              courier: initialData.shipping?.courier || undefined,
              carrierName: initialData.shipping?.carrierName || undefined,
              productName: initialData.shipping?.productName || undefined,
              flete: initialData.shipping?.flete || undefined,
              minimumInsurance:
                initialData.shipping?.minimumInsurance || undefined,
              deliveryDays: initialData.shipping?.deliveryDays || undefined,
              isCOD: initialData.shipping?.isCOD || false,
              cost: initialData.shipping?.cost || 0,
              trackingCode: initialData.shipping?.trackingCode || undefined,
              trackingUrl: initialData.shipping?.trackingUrl || undefined,
              guideUrl: initialData.shipping?.guideUrl || undefined,
              estimatedDeliveryDate: safeDate(
                initialData.shipping?.estimatedDeliveryDate,
              ),
              notes: initialData.shipping?.notes || undefined,
              boxId: initialData.shipping?.boxId || undefined,
            },
            expiresAt: safeDate(initialData?.expiresAt),
          }
        : {
            userId: "",
            guestId: generateGuestId(),
            fullName: "",
            orderItems: [],
            phone: "",
            email: "",
            address: "",
            city: "",
            department: "",
            daneCode: "",
            neighborhood: "",
            addressReference: "",
            address2: "",
            company: "",
            documentId: "",
            status: OrderStatus.DRAFT,
            type: OrderType.STANDARD,
            payment: {},
            adminNotes: "",
            internalNotes: "",
            shippingProvider: ShippingProvider.NONE,
            envioClickIdRate: undefined,
            shipping: {
              status: ShippingStatus.Preparing,
              courier: "",
              carrierName: "",
              productName: "",
              flete: 0,
              minimumInsurance: 0,
              deliveryDays: 0,
              isCOD: false,
              trackingCode: "",
              trackingUrl: "",
              guideUrl: "",
              cost: 0,
              estimatedDeliveryDate: undefined,
              notes: undefined,
              boxId: undefined,
            },
            subtotal: 0,
            total: 0,
            discount: {},
            couponCode: "",
          },
    [initialData, products],
  );

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [initialData, form, defaultValues]);

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "orderItems",
  });

  const [loadingItems, setLoadingItems] = useState(false);

  // Watch for totals calculation
  const watchedItems = useWatch({
    control: form.control,
    name: "orderItems",
  });
  const discountType = form.watch("discount.type");
  const discountAmount = form.watch("discount.amount");
  const shippingCost = form.watch("shipping.cost");
  const shippingCourier = form.watch("shipping.courier");
  const shippingCarrierName = form.watch("shipping.carrierName");

  const carrierInfo = useMemo(() => {
    return getCarrierInfo(shippingCarrierName || shippingCourier || "");
  }, [shippingCarrierName, shippingCourier]);

  const {
    formState: { isDirty },
  } = form;

  const { clearStorage } = useFormPersist({
    form,
    key: `order-form-${params.storeId}-${initialData?.id ?? "new"}`,
  });

  useFormValidationToast({ form });

  const onClear = () => {
    form.reset(defaultValues);
    clearStorage();
    toast({
      title: "Formulario limpiado",
      description: "Los datos han sido restablecidos.",
    });
  };

  const orderTotals = useMemo(() => {
    const items = watchedItems || [];
    console.log("Calculating totals with items:", items);
    // Calculate subtotal
    const subtotal = items.reduce((sum, item) => {
      // Find original product to check for discounts/offers logic if needed
      // But for Admin Cart, we often just trust the 'price' in the item
      // unless we want to replicate storefront 'discountedPrice' logic dynamically.
      // If item comes from EnhancedProductSelector, it should have the correct unit price set.
      const effectivePrice =
        item.discountedPrice !== undefined && item.discountedPrice !== null
          ? Number(item.discountedPrice)
          : Number(item.price);
      return sum + effectivePrice * Number(item.quantity);
    }, 0);

    // Offer savings - complex to calculate if we don't store original price vs discounted price in orderItems
    // For now, assume 0 or implement store-side logic later if needed.
    // Ideally AdminCartItem should store 'originalPrice' and 'price' if we want to show savings.
    // For simplicity in Admin, we might skip "Offer Savings" display or just calculate based on known products.
    // Let's keep it simple: Subtotal is sum of (Price * Qty).
    const offerSavings = 0;

    let discountValue = 0;
    if (discountType && discountAmount && !isNaN(discountAmount)) {
      discountValue =
        discountType === DiscountType.PERCENTAGE
          ? (subtotal * discountAmount) / 100
          : Math.min(discountAmount, subtotal);
    }

    let couponDiscount = 0;
    if (coupon && subtotal >= (Number(coupon.minOrderValue) || 0)) {
      const afterDiscount = subtotal - discountValue;
      couponDiscount =
        coupon.type === DiscountType.PERCENTAGE
          ? (afterDiscount * Number(coupon.amount)) / 100
          : Math.min(Number(coupon.amount), afterDiscount);
    }

    const shipping = Number(shippingCost) || 0;
    const total = Math.max(
      0,
      subtotal - discountValue - couponDiscount + shipping,
    );

    return {
      subtotal,
      offerSavings,
      discount: discountValue,
      couponDiscount,
      total,
    };
  }, [watchedItems, discountType, discountAmount, coupon, shippingCost]);

  const onSubmit = async (data: OrderFormValues) => {
    try {
      setLoading(true);

      // Validation: Manual Items cannot be in Payable Status (CREATED/PENDING)
      const hasManualItems = data.orderItems.some((item) => !item.productId);
      const isPayableStatus =
        data.status === OrderStatus.CREATED ||
        data.status === OrderStatus.PENDING;

      if (hasManualItems && isPayableStatus) {
        toast({
          title: "Error de Validación",
          description:
            "Órdenes con items manuales no pueden tener estado Creado/Pendiente para pago en tienda. Úsalas como Borrador o Cotización.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Check if order will be PAID with ENVIOCLICK and has selected rate
      const willBePaid = data.status === "PAID";
      const hasEnvioClickRate =
        data.shippingProvider === "ENVIOCLICK" && data.envioClickIdRate;
      const hasGuideAlready = initialData?.shipping?.envioClickIdOrder;

      if (willBePaid && hasEnvioClickRate && !hasGuideAlready) {
        // Show confirmation modal for guide creation
        setShowGuideConfirmation(true);
        setLoading(false);
        return; // Don't submit yet, wait for confirmation
      }

      // Normal submission
      await submitOrder(data);
    } catch (error: any) {
      toast({
        title: "Error",
        description: getErrorMessage(error),
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const submitOrder = async (
    data: OrderFormValues,
    forceRedirect = true,
    skipAutoGuide = false,
  ) => {
    // orderItems already has quantity from useFieldArray/ReactHookForm
    const updatedOrderItems = data.orderItems;

    // Sanitize UserId before sending
    let finalUserId = data.userId;
    let finalGuestId = data.guestId;

    if (finalUserId?.startsWith("guest_")) {
      finalGuestId = finalUserId; // Preserve the guest ID/phone
      finalUserId = ""; // clear userId so backend doesn't try to validate against Clerk
    } else if (finalUserId?.startsWith("clerk_")) {
      finalUserId = finalUserId.replace("clerk_", "");
    }

    const payload = {
      ...data,
      userId: finalUserId,
      guestId: finalGuestId,
      orderItems: updatedOrderItems,
      subtotal: orderTotals.subtotal,
      total: orderTotals.total,
      discountType: data.discount?.type,
      discountAmount: data.discount?.amount,
      discountReason: data.discount?.reason,
      skipAutoGuide,
    };

    let response;
    if (initialData) {
      response = await axios.patch(
        `/api/${params.storeId}/${Models.Orders}/${params.orderId}`,
        payload,
      );
    } else {
      response = await axios.post(
        `/api/${params.storeId}/${Models.Orders}`,
        payload,
      );
    }
    clearStorage();
    if (forceRedirect) {
      const guideCreation = response.data.guideCreation;

      if (guideCreation?.attempted) {
        if (guideCreation.success) {
          toast({
            title: "Éxito",
            description: "Orden creada y guía generada exitosamente.",
            variant: "success",
          });
        } else {
          toast({
            title: "Atención",
            description:
              "Orden creada, pero falló la generación de la guía. Por favor créala manualmente.",
            variant: "warning",
          });
        }
      } else {
        toast({
          description: toastMessage,
          variant: "success",
        });
      }

      router.push(`/${params.storeId}/${Models.Orders}`);
    }
  };

  const confirmAndCreateGuide = async () => {
    try {
      setLoading(true);
      const data = form.getValues();

      await submitOrder(data, false, false); // Create guide (skipAutoGuide = false)

      setShowGuideConfirmation(false);

      toast({
        title: "Orden guardada y guía creada",
        description: "La guía de envío se creará automáticamente",
      });

      router.push(`/${params.storeId}/${Models.Orders}`);
    } catch (error) {
      toast({
        title: "Error",
        description: getErrorMessage(error),
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const saveWithoutGuide = async () => {
    try {
      setLoading(true);
      const data = form.getValues();

      await submitOrder(data, false, true); // Skip guide (skipAutoGuide = true)

      setShowGuideConfirmation(false);

      toast({
        title: "Orden guardada",
        description:
          "La orden fue guardada. Puedes crear la guía manualmente desde el detalle.",
        variant: "success",
      });

      router.push(`/${params.storeId}/${Models.Orders}`);
    } catch (error) {
      toast({
        title: "Error",
        description: getErrorMessage(error),
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const onDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(
        `/api/${params.storeId}/${Models.Orders}/${params.orderId}`,
      );
      router.push(`/${params.storeId}/${Models.Orders}`);
      toast({
        description: "Orden eliminada",
        variant: "success",
        duration: 4000,
      });
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  const onGetShippingQuotes = async () => {
    const formData = form.getValues();

    if (!formData.city || !formData.department || !formData.daneCode) {
      toast({
        title: "Error",
        description:
          "Debes seleccionar una ciudad con el buscador para cotizar",
        variant: "destructive",
      });
      return;
    }

    if (formData.orderItems.length === 0) {
      toast({
        title: "Error",
        description: "Debes agregar al menos un producto al pedido",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoadingQuotes(true);
      const response = await axios.post(
        `/api/${params.storeId}/shipment/quote`,
        {
          destination: {
            daneCode: formData.daneCode || "",
            address: formData.address || "",
          },
          orderTotal: orderTotals.total,
          items: formData.orderItems.map((item: any) => ({
            ...item,
          })),
          boxId: formData.shipping.boxId,
          forceRefresh: true,
        },
      );

      setShippingQuotes(response.data.quotes);
      setRecommendedBox(response.data.packageDimensions);

      if (response.data.quotes.length === 0) {
        toast({
          title: "Sin resultados",
          description:
            "No se encontraron tarifas disponibles para esta ubicación",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Cotización exitosa",
          description: `Se encontraron ${response.data.quotes.length} tarifas disponibles`,
        });
      }
    } catch (error) {
      toast({
        title: "Error al cotizar",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoadingQuotes(false);
    }
  };

  const handleBoxChange = (boxId: string) => {
    const value = boxId === "auto" ? undefined : boxId;
    form.setValue("shipping.boxId", value);
  };

  const handleSelectRate = (quote: ShippingQuote) => {
    setSelectedRateId(quote.idRate);

    // Update form with selected rate data
    form.setValue("shippingProvider", "ENVIOCLICK");
    form.setValue("envioClickIdRate", quote.idRate);

    const boxId = form.getValues("shipping.boxId");

    // Store all quotation data including carrier info for guide creation
    form.setValue("shipping", {
      carrierName: quote.carrier,
      courier: quote.carrier, // Set both for compatibility
      productName: quote.product,
      flete: quote.flete,
      minimumInsurance: quote.minimumInsurance,
      deliveryDays:
        typeof quote.deliveryDays === "string"
          ? parseInt(quote.deliveryDays)
          : quote.deliveryDays,
      isCOD: quote.isCOD,
      cost: quote.totalCost,
      status: ShippingStatus.Preparing,
      boxId,
    });

    toast({
      title: "Tarifa seleccionada",
      description: `${quote.carrier} - ${currencyFormatter(quote.totalCost)}`,
    });
  };

  const parsedDetails = parseOrderDetails(initialData?.payment?.details);

  useEffect(() => {
    if (initialData?.coupon) {
      setCoupon(initialData.coupon);
    }
  }, [initialData]);

  return (
    <>
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onDelete}
        loading={loading}
      />
      <GuideConfirmationModal
        isOpen={showGuideConfirmation}
        onClose={() => setShowGuideConfirmation(false)}
        onConfirm={confirmAndCreateGuide}
        onSaveWithoutGuide={saveWithoutGuide}
        loading={loading}
        selectedQuote={
          shippingQuotes.find((q) => q.idRate === selectedRateId) || {
            idRate: form.getValues("envioClickIdRate") || 0,
            carrier: form.getValues("shipping.carrierName") || "",
            product: form.getValues("shipping.productName") || "",
            flete: form.getValues("shipping.flete") || 0,
            minimumInsurance: form.getValues("shipping.minimumInsurance") || 0,
            totalCost: form.getValues("shipping.cost") || 0,
            deliveryDays: form.getValues("shipping.deliveryDays") || 0,
            isCOD: form.getValues("shipping.isCOD") || false,
          }
        }
      />
      <ProductConversionModal
        isOpen={conversionIndex !== null}
        onClose={() => setConversionIndex(null)}
        loading={loading}
        categories={categories}
        initialData={
          conversionIndex !== null
            ? {
                name: form.getValues(`orderItems.${conversionIndex}.name`),
                price: form.getValues(`orderItems.${conversionIndex}.price`),
                quantity: form.getValues(
                  `orderItems.${conversionIndex}.quantity`,
                ),
                orderId: initialData?.id,
                orderItemId: form.getValues(
                  `orderItems.${conversionIndex}.id` as any,
                ),
              }
            : null
        }
        onConfirm={(product: any) => {
          if (conversionIndex === null) return;
          const currentItem = form.getValues(`orderItems.${conversionIndex}`);
          update(conversionIndex, {
            ...currentItem,
            productId: product.id,
            name: product.name,
            price: product.price,
            sku: product.sku || undefined,
            imageUrl: product.images?.[0]?.url,
            stock: product.stock,
            isCustom: false,
            productGroup: product.category
              ? { name: product.category.name }
              : undefined,
          });
          setConversionIndex(null);
        }}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Heading title={title} description={description} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClear} type="button">
            {initialData ? (
              <>
                <RotateCcw className="mr-2 h-4 w-4" />
                Descartar Cambios
              </>
            ) : (
              <>
                <Eraser className="mr-2 h-4 w-4" />
                Limpiar Formulario
              </>
            )}
          </Button>
          {initialData && (
            <>
              {initialData.token && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-blue-200 bg-blue-50 px-4 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
                  onClick={() => {
                    const storeUrl =
                      process.env.NEXT_PUBLIC_FRONTEND_STORE_URL ||
                      "http://localhost:3001";
                    const url = `${storeUrl}/quote/${initialData.token}`;
                    navigator.clipboard.writeText(url);
                    toast({ description: "Link copiado al portapapeles" });
                  }}
                  type="button"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar Link
                </Button>
              )}
              {form.watch("phone") &&
                isValidPhoneNumber(form.watch("phone") || "") && (
                  <WhatsappButton
                    withText
                    variant="default" // Use defaults button style (solid)
                    className="bg-[#25D366] px-4 hover:bg-[#128C7E]" // Override with WhatsApp Brand Color
                    order={{
                      orderNumber: initialData.orderNumber,
                      status: form.watch("status"),
                      fullName: form.watch("fullName") || "Cliente",
                      phone: form.watch("phone") || "",
                      totalPrice: form.watch("total"),
                      products: form.watch("orderItems").map((i: any) => ({
                        name: i.name,
                        quantity: i.quantity,
                      })),
                      token: initialData.token,
                      trackingCode: form.watch("shipping.trackingCode"),
                    }}
                  />
                )}
            </>
          )}
          {process.env.NODE_ENV !== "production" && (
            <TestDataGenerator form={form} products={products} />
          )}
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
          autoComplete="off"
        >
          <h2 className="text-lg font-semibold">
            Orden # {initialData?.orderNumber}
          </h2>

          {/* Totals */}
          {/* Totals Section */}
          {/* New 2-Column Cart Layout */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Left Column: Product List (Cart) */}
            <div className="lg:col-span-8">
              <FormField
                control={form.control}
                name="orderItems"
                render={({ field }) => (
                  <FormItem className="col-span-full">
                    <FormLabel isRequired className="flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4" />
                      Carrito de Compras
                    </FormLabel>
                    <FormControl>
                      <div className="flex w-full flex-col gap-4">
                        <EnhancedProductSelector
                          selectedItems={fields.reduce(
                            (acc: Record<string, number>, item: any) => {
                              if (item.productId)
                                acc[item.productId] = item.quantity;
                              return acc;
                            },
                            {} as Record<string, number>,
                          )}
                          selectedProductsList={fields
                            .filter((f) => f.productId)
                            .map((f: any) => ({
                              id: f.productId,
                              name: f.name,
                              price: f.price,
                              stock: f.stock || 9999,
                              images: f.imageUrl ? [{ url: f.imageUrl }] : [],
                              category: { name: "Seleccionado" },
                              hasDiscount: false,
                              productGroup: f.productGroup,
                            }))}
                          onClearSelection={() => {
                            const realProductIndices = fields
                              .map((field, index) =>
                                field.productId ? index : -1,
                              )
                              .filter((index) => index !== -1)
                              .sort((a, b) => b - a);

                            realProductIndices.forEach((index) =>
                              remove(index),
                            );
                          }}
                          onUpdate={(productId, quantity, product) => {
                            const existingIndex = fields.findIndex(
                              (field) => field.productId === productId,
                            );

                            if (quantity > 0) {
                              if (existingIndex !== -1) {
                                update(existingIndex, {
                                  ...fields[existingIndex],
                                  quantity,
                                });
                              } else if (product) {
                                append({
                                  productId,
                                  quantity,
                                  name: product.name,
                                  price: product.originalPrice || product.price,
                                  discountedPrice: product.discountedPrice,
                                  sku: product.sku || "",
                                  imageUrl: product.images?.[0]?.url || "",
                                  isCustom: false,
                                  stock: product.stock,
                                  productGroup: product.productGroup,
                                });
                              }
                            } else if (existingIndex !== -1) {
                              remove(existingIndex);
                            }
                          }}
                        />

                        <div className="space-y-4">
                          {fields.map((field: any, index) => {
                            if (!field.productId) {
                              const itemValues = watchedItems?.[index] || field;

                              return (
                                <div
                                  key={field.id}
                                  className="relative mb-4 rounded-md border border-dashed bg-muted/20 p-4"
                                >
                                  <div className="absolute right-2 top-2 flex gap-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                                      onClick={() => setConversionIndex(index)}
                                      title="Convertir a Producto"
                                    >
                                      <Wand2 className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                      onClick={() => remove(index)}
                                    >
                                      <Trash className="h-4 w-4" />
                                    </Button>
                                  </div>
                                  <div className="grid gap-4">
                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                      <Package className="h-4 w-4" /> Item
                                      Manual
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                      <div className="space-y-1">
                                        <Label className="text-xs">
                                          Nombre del producto
                                        </Label>
                                        <Input
                                          {...form.register(
                                            `orderItems.${index}.name`,
                                          )}
                                          placeholder="Nombre del item..."
                                          className="h-8"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-xs">
                                          Precio Unitario
                                        </Label>
                                        <CurrencyInput
                                          value={itemValues.price}
                                          onChange={(val) =>
                                            form.setValue(
                                              `orderItems.${index}.price`,
                                              Number(val),
                                              { shouldValidate: true },
                                            )
                                          }
                                          className="h-8"
                                        />
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-[1fr_auto] items-end gap-4">
                                      <div className="space-y-1">
                                        <Label className="text-xs">
                                          URL Imagen
                                        </Label>
                                        <div className="flex gap-2">
                                          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded border">
                                            <Image
                                              src={
                                                itemValues.imageUrl ||
                                                "/images/placeholder_1.png"
                                              }
                                              fill
                                              alt="Preview"
                                              className="object-cover"
                                            />
                                          </div>
                                          <Input
                                            {...form.register(
                                              `orderItems.${index}.imageUrl`,
                                            )}
                                            placeholder="https://..."
                                            className="h-8"
                                          />
                                        </div>
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-xs">
                                          Cantidad
                                        </Label>
                                        <QuantitySelector
                                          value={Number(itemValues.quantity)}
                                          onChange={(val) =>
                                            form.setValue(
                                              `orderItems.${index}.quantity`,
                                              Number(val),
                                              { shouldValidate: true },
                                            )
                                          }
                                          min={1}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div key={field.id} className="relative">
                                <AdminCartItem
                                  key={field.id}
                                  item={{
                                    id: field.productId || field.id,
                                    name: field.name,
                                    price: field.price,
                                    discountedPrice: field.discountedPrice,
                                    stock: field.stock || 9999,
                                    images: field.imageUrl
                                      ? [{ url: field.imageUrl }]
                                      : [],
                                    quantity: field.quantity,
                                    productGroup: field.productGroup,
                                  }}
                                  onUpdateQuantity={(quantity) => {
                                    if (quantity > 0) {
                                      update(index, {
                                        ...field,
                                        quantity,
                                      });
                                    } else {
                                      remove(index);
                                    }
                                  }}
                                  onRemove={() => remove(index)}
                                />
                              </div>
                            );
                          })}
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full border-2 border-dashed hover:bg-accent/50 hover:text-accent-foreground"
                          onClick={() => {
                            append({
                              productId: null,
                              quantity: 1,
                              name: "Item Manual",
                              price: 0,
                              isCustom: true,
                              imageUrl: "",
                              stock: 9999,
                              productGroup: undefined,
                            });
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Agregar Item Manual
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Right Column: Totals Card (Sticky) */}
            <div className="lg:col-span-4">
              <div className="sticky top-4 space-y-4">
                <Card className="overflow-hidden border-none shadow-md">
                  <CardHeader className="bg-muted/50 pb-2 pt-4">
                    <CardTitle className="text-sm font-medium">
                      Resumen de Orden
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 bg-muted/30 p-6">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Subtotal</span>
                        <span>{currencyFormatter(orderTotals.subtotal)}</span>
                      </div>
                      {orderTotals.offerSavings > 0 && (
                        <div className="flex justify-between text-success">
                          <span>Ahorro por oferta</span>
                          <span>
                            - {currencyFormatter(orderTotals.offerSavings)}
                          </span>
                        </div>
                      )}
                      {orderTotals.discount > 0 && (
                        <div className="flex justify-between text-destructive">
                          <span className="flex items-center gap-1">
                            Descuento
                            {form.watch("discount.type") ===
                              DiscountType.PERCENTAGE && (
                              <span className="text-xs opacity-75">
                                ({form.watch("discount.amount")}%)
                              </span>
                            )}
                          </span>
                          <span>
                            - {currencyFormatter(orderTotals.discount)}
                          </span>
                        </div>
                      )}
                      {orderTotals.couponDiscount > 0 && (
                        <div className="flex justify-between text-success">
                          <span className="flex items-center gap-1">
                            Cupón
                            {coupon?.type === DiscountType.PERCENTAGE && (
                              <span className="text-xs opacity-75">
                                ({coupon.amount}%)
                              </span>
                            )}
                          </span>
                          <span>
                            - {currencyFormatter(orderTotals.couponDiscount)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-muted-foreground">
                        <span>Envío</span>
                        <span>
                          {Number(shippingCost || 0) > 0
                            ? `+ ${currencyFormatter(Number(shippingCost || 0))}`
                            : "Por calcular"}
                        </span>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between text-lg font-bold">
                      <span>Total</span>
                      <span className="text-primary">
                        {currencyFormatter(orderTotals.total)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Usuario</FormLabel>
                  <FormControl>
                    <UserCombobox
                      options={users}
                      value={field.value || form.watch("guestId")}
                      onChange={(value, user) => {
                        // RHF update
                        field.onChange(value);
                        // Logic update
                        handleUserSelect(value, user);
                      }}
                      disabled={loading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="guestId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Id de invitado</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      readOnly
                      placeholder="Id de invitado"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Nombre</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Nombre completo"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="documentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Documento de identidad</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Documento de identidad"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Correo electrónico</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Correo electrónico"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Teléfono</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-x-1">
                      {(initialData ||
                        (field.value && field.value.length >= 10)) && (
                        <WhatsappButton
                          order={{
                            orderNumber: initialData?.orderNumber ?? "",
                            status: initialData?.status ?? OrderStatus.CREATED,
                            fullName:
                              initialData?.fullName ??
                              form.watch("fullName") ??
                              "",
                            phone: field.value || "",
                            totalPrice: orderTotals.total,
                            products: form.watch("orderItems").map((item) => ({
                              name: item.name,
                              quantity: item.quantity,
                            })),
                          }}
                          size="md"
                        />
                      )}
                      <PhoneInput
                        disabled={loading}
                        placeholder=""
                        value={field.value}
                        onChange={field.onChange}
                        defaultCountry="CO"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="daneCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>
                    Ciudad y Departamento
                    <span className="ml-2 text-xs text-muted-foreground">
                      (Requerido para cotización de envío)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <LocationCombobox
                      options={locations}
                      value={field.value || ""}
                      onChange={(value, location) => {
                        field.onChange(value);
                        if (location) {
                          form.setValue("city", location.city);
                          form.setValue("department", location.department);
                        }
                      }}
                      disabled={loading}
                      placeholder="Buscar ciudad..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ciudad</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Ej: Bogotá"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="department"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Departamento</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Ej: Cundinamarca"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Dirección</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Ej: Calle 123 #45-67"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dirección 2</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Ej: Apto 501, Torre B"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="neighborhood"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Barrio (Opcional)</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Ej: Laureles"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="addressReference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Referencia de dirección</FormLabel>
                  <FormControl>
                    <Textarea
                      disabled={loading}
                      placeholder="Ej: Frente al parque, edificio azul"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="company"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Empresa</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Ej: Acme Corp"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Quote Requests List (Negotiation History) */}
            {initialData && (initialData as any).quoteRequests && (
              <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4">
                <QuoteRequestsList
                  requests={(initialData as any).quoteRequests}
                />
              </div>
            )}

            <FormField
              control={form.control}
              name="adminNotes"
              render={({ field }) => (
                <FormItem className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4">
                  <FormLabel isRequired>Notas de Cotización</FormLabel>
                  <FormControl>
                    <RichTextEditor
                      placeholder="Estas notas serán visibles como 'Descripción de la Cotización' para el cliente."
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormDescription>
                    Información adicional o condiciones especiales para esta
                    cotización.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="internalNotes"
              render={({ field }) => (
                <FormItem className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4">
                  <FormLabel isRequired>Notas Internas</FormLabel>
                  <FormControl>
                    <RichTextEditor
                      placeholder="Notas privadas para el equipo administrativo..."
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormDescription>
                    Estas notas solo son visibles para administradores.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem className="col-span-1">
                  <FormLabel>Tipo de Orden</FormLabel>
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
                          placeholder="Seleccionar tipo"
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={OrderType.STANDARD}>
                        Estándar
                      </SelectItem>
                      <SelectItem value={OrderType.QUOTATION}>
                        Cotización
                      </SelectItem>
                      <SelectItem value={OrderType.CUSTOM}>
                        Personalizada
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4">
                  <FormLabel isRequired>Estado de la orden</FormLabel>
                  <FormDescription>
                    Selecciona el estado actual de la orden
                  </FormDescription>
                  <FormControl>
                    <OrderStatusSelector
                      currentStatus={field.value}
                      onStatusChange={(newStatus) => {
                        if (newStatus === OrderStatus.SENT) {
                          const trackingCode = form.getValues(
                            "shipping.trackingCode",
                          );
                          const provider = form.getValues("shippingProvider");

                          // If manual shipping, strict check.
                          // If EnvioClick, it might be auto-filled, but we still expect it to be present if "Sent" is clicked.
                          // If NO shipping (Pickup), maybe we don't need it?
                          // User said "Trigger Notifications... Tracking Number".
                          // Let's assume if Provider is NOT "NONE", we need tracking.

                          if (
                            provider !== ShippingProvider.NONE &&
                            !trackingCode
                          ) {
                            toast({
                              title: "Falta el número de guía",
                              description:
                                "Para marcar como Enviado, debes ingresar el número de guía (Tracking Code) en la sección de envío.",
                              variant: "destructive",
                            });
                            return;
                          }
                        }
                        field.onChange(newStatus);
                      }}
                      readOnly={loading}
                      className="py-4"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Expiration Date - Only visible for Quotations */}
            {form.watch("type") === OrderType.QUOTATION && (
              <FormField
                control={form.control}
                name="expiresAt"
                render={({ field }) => (
                  <FormItem className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4">
                    <FormLabel>Válida Hasta</FormLabel>
                    <FormControl>
                      <DatePicker
                        name={field.name}
                        control={form.control}
                        disabled={loading}
                        placeholder="Fecha de expiración"
                      />
                    </FormControl>
                    <FormDescription>
                      Fecha límite para aceptar esta cotización.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Descuentos y Cupones</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                form.resetField("discount.type");
                form.resetField("discount.amount", {
                  defaultValue: 0,
                });
                form.resetField("discount.reason", {
                  defaultValue: "",
                });
                toast({
                  description: "Descuentos eliminados",
                  variant: "success",
                });
              }}
            >
              <Trash className="mr-2 h-4 w-4" />
              Limpiar descuentos
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3">
            <FormField
              control={form.control}
              name="discount.type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de descuento</FormLabel>
                  <Select
                    key={field.value}
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value || ""}
                    defaultValue={field.value || ""}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={DiscountType.PERCENTAGE}>
                        {discountOptions[DiscountType.PERCENTAGE]}
                      </SelectItem>
                      <SelectItem value={DiscountType.FIXED}>
                        {discountOptions[DiscountType.FIXED]}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="discount.amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monto del descuento</FormLabel>
                  <FormControl>
                    {form.watch("discount.type") === DiscountType.PERCENTAGE ? (
                      <div className="relative">
                        <Percent className="absolute left-3 top-3 h-4 w-4" />
                        <Input
                          type="number"
                          disabled={loading || !form.watch("discount.type")}
                          className="pl-8"
                          placeholder="10"
                          {...field}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === ""
                                ? undefined
                                : Number(e.target.value),
                            )
                          }
                        />
                      </div>
                    ) : (
                      <CurrencyInput
                        placeholder="$ 10.000"
                        disabled={loading || !form.watch("discount.type")}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="discount.reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Razón del descuento</FormLabel>
                  <FormControl>
                    <Textarea
                      disabled={loading || !form.watch("discount.type")}
                      placeholder="Ej: Promoción especial"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="couponCode"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className="flex items-center gap-2">
                    Cupón
                    {coupon && (
                      <Badge
                        variant="success"
                        className="flex items-center gap-1"
                      >
                        <Check className="h-3 w-3" />
                        Aplicado
                      </Badge>
                    )}
                  </FormLabel>
                  <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            disabled={validatingCoupon || loading}
                            className={cn(
                              "w-full justify-between",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            <div className="flex items-center gap-2 font-mono">
                              <Ticket
                                className={cn(
                                  "h-4 w-4",
                                  coupon
                                    ? "text-success"
                                    : "text-muted-foreground",
                                )}
                              />
                              {field.value
                                ? availableCoupons.find(
                                    (c: Coupon) => c.code === field.value,
                                  )?.code || field.value
                                : availableCoupons.length > 0
                                  ? "Seleccionar cupón"
                                  : "No hay cupones disponibles"}
                            </div>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      {availableCoupons.length > 0 && (
                        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                          <Command>
                            <CommandInput placeholder="Buscar cupón..." />
                            <CommandEmpty>
                              No se encontraron cupones.
                            </CommandEmpty>
                            <CommandGroup>
                              {availableCoupons.map((c: Coupon) => (
                                <CommandItem
                                  key={c.code}
                                  value={c.code}
                                  onSelect={async () => {
                                    try {
                                      setValidatingCoupon(true);
                                      if (
                                        !initialData?.coupon ||
                                        initialData.coupon.code !== c.code
                                      ) {
                                        const response = await axios.post(
                                          `/api/${params.storeId}/coupons/validate`,
                                          {
                                            code: c.code,
                                            subtotal: orderTotals.subtotal,
                                          },
                                        );
                                        setCoupon(response.data);
                                      } else {
                                        setCoupon(initialData.coupon);
                                      }
                                      field.onChange(c.code);
                                      toast({
                                        description:
                                          "Cupón aplicado correctamente",
                                        variant: "success",
                                      });
                                    } catch (error) {
                                      toast({
                                        description: getErrorMessage(error),
                                        variant: "destructive",
                                      });
                                      setCoupon(null);
                                      field.onChange("");
                                    } finally {
                                      setValidatingCoupon(false);
                                    }
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      c.code === field.value
                                        ? "opacity-100"
                                        : "opacity-0",
                                    )}
                                  />
                                  <div className="flex w-full items-center justify-between">
                                    <span className="font-mono">{c.code}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {c.type === DiscountType.PERCENTAGE
                                        ? `${c.amount}% de descuento`
                                        : `${currencyFormatter(Number(c.amount))} de descuento`}
                                    </span>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </Command>
                        </PopoverContent>
                      )}
                    </Popover>
                    {coupon && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className=""
                        onClick={() => {
                          setCoupon(null);
                          field.onChange("");
                          toast({
                            description: "Cupón removido",
                            variant: "success",
                          });
                        }}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Separator />
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Wallet className="h-5 w-5" />
            Estado del pago{" "}
            {initialData?.payment?.transactionId
              ? `# (${initialData?.payment?.transactionId})`
              : ""}
          </h2>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3">
            <FormField
              control={form.control}
              name="payment.method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Método de pago</FormLabel>
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
                          placeholder="Selecciona un método de pago"
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(PaymentMethod).map((state) => (
                        <SelectItem key={state} value={state}>
                          {paymentOptions[state]}
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
              name="payment.transactionId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de la transacción</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="000-000000-000"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {initialData?.payment?.details && (
              <FormItem className="flex w-full flex-col">
                <FormLabel>Detalles del pago</FormLabel>
                <Alert className="max-w-full">
                  <AlertDescription>
                    <div className="flex w-full flex-col">
                      {Object.entries(parsedDetails).map(([key, value]) => {
                        const currentPaymentMethodObject =
                          paymentMethodsByOption[
                            initialData?.payment?.method as PaymentMethod
                          ];
                        return (
                          <div
                            key={key}
                            className="flex w-full flex-col text-sm"
                          >
                            <span className="font-semibold">
                              {detailsTitleOptions[key] || key}
                            </span>
                            <span>
                              {currentPaymentMethodObject?.[String(value)] ||
                                String(value)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </AlertDescription>
                </Alert>
              </FormItem>
            )}
          </div>
          <Separator />
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Package className="h-5 w-5" />
            Información de envío{" "}
            {initialData?.shipping?.envioClickIdOrder
              ? `# (${initialData?.shipping?.envioClickIdOrder})`
              : ""}
          </h2>
          <div className="grid grid-cols-1 gap-8">
            <FormField
              control={form.control}
              name="shippingProvider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Tipo de Envío</FormLabel>
                  <FormControl>
                    <RadioGroup
                      key={field.value}
                      onValueChange={field.onChange}
                      value={field.value}
                      defaultValue={field.value}
                      className="grid grid-cols-1 gap-4 md:grid-cols-3"
                      disabled={
                        loading || !!initialData?.shipping?.envioClickIdOrder
                      }
                    >
                      {/* NONE - Store Pickup */}
                      <Label
                        htmlFor="none"
                        className={cn("cursor-pointer transition-all")}
                      >
                        <Card className="h-full hover:border-primary/50">
                          <CardContent className="flex items-start gap-3 p-5">
                            <RadioGroupItem
                              value={ShippingProvider.NONE}
                              id="none"
                              className="mt-0.5"
                            />
                            <div className="flex flex-1 flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <Store className="h-5 w-5 text-primary" />
                                <span className="font-semibold">
                                  Recoger en tienda
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                El cliente recogerá el pedido en la ubicación
                                física
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      </Label>

                      {/* ENVIOCLICK - Integrated Shipping */}
                      <Label
                        htmlFor="envioclick"
                        className={cn(
                          "cursor-pointer transition-all",
                          field.value === ShippingProvider.ENVIOCLICK &&
                            "ring-2 ring-white ring-offset-2",
                        )}
                      >
                        <Card className="h-full overflow-hidden hover:border-blue-400">
                          <CardContent className="flex items-start gap-3 rounded-md p-5 text-white [background:linear-gradient(135deg,#010019,#020a47)]">
                            <RadioGroupItem
                              value={ShippingProvider.ENVIOCLICK}
                              id="envioclick"
                              className="mt-0.5 border-white text-white"
                            />
                            <div className="flex flex-1 flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <Image
                                  src="https://www.envioclickpro.com.co/img/register/logo_solo.svg"
                                  alt="EnvíoClick"
                                  width={100}
                                  height={32}
                                  className="h-8 w-auto object-contain"
                                />
                              </div>
                              <span className="text-xs text-blue-100">
                                Transportadora integrada para envíos nacionales
                                con múltiples opciones
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      </Label>

                      {/* MANUAL - Other Carriers */}
                      <Label
                        htmlFor="manual"
                        className={cn(
                          "cursor-pointer transition-all",
                          field.value === ShippingProvider.MANUAL &&
                            "ring-2 ring-primary ring-offset-2",
                        )}
                      >
                        <Card className="h-full hover:border-primary/50">
                          <CardContent className="flex items-start gap-3 p-5">
                            <RadioGroupItem
                              value={ShippingProvider.MANUAL}
                              id="manual"
                              className="mt-0.5"
                            />
                            <div className="flex flex-1 flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <Truck className="h-5 w-5 text-primary" />
                                <span className="font-semibold">
                                  Envío Manual
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                Usar otra transportadora o servicio de
                                mensajería personalizado
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      </Label>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Store Pickup Status Section */}
            {form.watch("shippingProvider") === ShippingProvider.NONE && (
              <div className="space-y-4 rounded-lg bg-muted/50 p-4">
                <Alert>
                  <Store className="h-4 w-4" />
                  <AlertDescription>
                    El cliente recogerá el pedido en tienda. Actualiza el estado
                    para informar al cliente sobre el progreso de su orden.
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="shipping.status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estado del Pedido</FormLabel>
                        <Select
                          disabled={loading}
                          onValueChange={field.onChange}
                          value={field.value}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona un estado" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(shippingOptions).map(
                              ([key, label]) => (
                                <SelectItem key={key} value={key}>
                                  {label}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Estado actual del pedido para recogida
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="shipping.cost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Costo Adicional</FormLabel>
                        <FormControl>
                          <CurrencyInput
                            placeholder="$ 0"
                            disabled={loading}
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormDescription>
                          Costo adicional si aplica
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="shipping.notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notas para el cliente</FormLabel>
                      <FormControl>
                        <Textarea
                          disabled={loading}
                          placeholder="Ej: Su pedido estará listo para recoger mañana después de las 2pm"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* EnvioClick Quotation Section */}
            {form.watch("shippingProvider") === ShippingProvider.ENVIOCLICK && (
              <div className="space-y-4">
                {/* Box Selector UI for EnvioClick - Pre Quote */}
                <div className="space-y-4 rounded-md border bg-muted/20 p-4">
                  <h3 className="font-medium">Configuración de Empaque</h3>
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="min-w-[200px] space-y-2">
                      <Label>Seleccionar Caja Manual</Label>
                      <Select
                        value={form.watch("shipping.boxId") || "auto"}
                        onValueChange={(val) => handleBoxChange(val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Automático (Recomendado)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">
                            Automático (Recomendado)
                          </SelectItem>
                          {boxes?.map((box: Box) => (
                            <SelectItem key={box.id} value={box.id}>
                              {box.name} ({box.width}x{box.height}x{box.length}
                              cm)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Quote Button */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        onClick={onGetShippingQuotes}
                        disabled={
                          loadingQuotes ||
                          !form.watch("city") ||
                          !form.watch("daneCode") ||
                          !!initialData?.shipping?.envioClickIdOrder
                        }
                        className="w-auto border border-input bg-white text-black hover:bg-accent hover:text-accent-foreground"
                      >
                        {loadingQuotes ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Image
                            src="https://www.envioclick.com/img/home/shipSmarter.svg"
                            alt="EnvioClick"
                            width={100}
                            height={24}
                            className="h-6 w-auto"
                          />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Obtener Cotizaciones de Envío</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Rates Display */}
                {shippingQuotes.length > 0 && (
                  <div className="space-y-3">
                    {/* Box Used Info */}
                    {recommendedBox && (
                      <Alert className="bg-blue-50">
                        <Package className="h-4 w-4" />
                        <AlertDescription>
                          <strong>Caja Utilizada para Cotización:</strong>{" "}
                          {recommendedBox.name} ({recommendedBox.width}x
                          {recommendedBox.height}x{recommendedBox.length}cm)
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="flex items-center justify-between">
                      <Label>Selecciona una tarifa:</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onGetShippingQuotes}
                        disabled={loadingQuotes}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>

                    <RadioGroup
                      key={selectedRateId?.toString() || "no-rate"}
                      value={selectedRateId?.toString() || ""}
                      defaultValue={selectedRateId?.toString() || undefined}
                      onValueChange={(value) => {
                        const quote = shippingQuotes.find(
                          (q) => q.idRate === parseInt(value),
                        );
                        if (quote) handleSelectRate(quote);
                      }}
                      className="space-y-3"
                    >
                      {shippingQuotes.map((quote) => {
                        const carrierInfo = getCarrierInfo(quote.carrier);
                        const bgColor = carrierInfo?.color || "#FFFFFF";
                        return (
                          <div key={quote.idRate} className="relative">
                            <RadioGroupItem
                              value={quote.idRate.toString()}
                              id={`rate-${quote.idRate}`}
                              className="peer sr-only"
                              disabled={
                                !!initialData?.shipping?.envioClickIdOrder
                              }
                            />
                            <Label
                              htmlFor={`rate-${quote.idRate}`}
                              className={cn(
                                "flex cursor-pointer flex-col rounded-lg border-2 p-4 transition-all",
                                selectedRateId === quote.idRate
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:border-primary/50",
                                !!initialData?.shipping?.envioClickIdOrder &&
                                  "cursor-not-allowed opacity-50",
                              )}
                            >
                              <div className="flex items-start justify-between gap-4">
                                {/* Carrier Logo with Brand Color */}
                                <div className="flex flex-1 items-center gap-3">
                                  {carrierInfo && (
                                    <div
                                      className="flex h-12 w-20 flex-shrink-0 items-center justify-center rounded-md p-2"
                                      style={{ backgroundColor: bgColor }}
                                    >
                                      <Image
                                        src={carrierInfo.logoUrl}
                                        alt={carrierInfo.comercialName}
                                        width={64}
                                        height={32}
                                        className="h-full w-full object-contain"
                                      />
                                    </div>
                                  )}

                                  <div className="flex-1 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-semibold">
                                        {quote.carrier}
                                      </span>
                                      {quote.isCOD && (
                                        <Badge
                                          variant="secondary"
                                          className="text-xs"
                                        >
                                          Contra entrega
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                      {quote.product}
                                    </p>
                                    <div className="flex items-center gap-4 text-sm">
                                      <span className="text-muted-foreground">
                                        Entrega aprox. {quote.deliveryDays}{" "}
                                        {quote.deliveryDays === 1
                                          ? "día"
                                          : "días"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                {/* Price Section */}
                                <div className="flex-shrink-0 space-y-1 text-right">
                                  <p className="text-2xl font-bold">
                                    {currencyFormatter(quote.totalCost)}
                                  </p>
                                  <div className="space-y-0.5 text-xs text-muted-foreground">
                                    <p>
                                      Flete: {currencyFormatter(quote.flete)}
                                    </p>
                                    <p>
                                      Seguro:{" "}
                                      {currencyFormatter(
                                        quote.minimumInsurance,
                                      )}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </Label>
                          </div>
                        );
                      })}
                    </RadioGroup>

                    {selectedRateId && (
                      <Alert>
                        <AlertDescription>
                          <Check className="inline h-4 w-4 text-green-500" />{" "}
                          Tarifa seleccionada.{" "}
                          {form.watch("status") === "PAID"
                            ? "Al guardar se creará automáticamente la guía de envío."
                            : "Cambia el estado a PAGADO para crear la guía de envío."}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                {/* Guide already created warning */}
                {initialData?.shipping?.envioClickIdOrder && (
                  <Alert>
                    <AlertDescription>
                      Esta orden ya tiene una guía de EnvioClick creada. Los
                      datos de envío no se pueden modificar.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* Manual Shipping Info */}
            {form.watch("shippingProvider") === "MANUAL" && (
              <div className="space-y-4 rounded-lg bg-muted/50 p-4">
                <Alert>
                  <AlertDescription>
                    Completa los datos del envío con una transportadora que no
                    está en EnvioClick.
                  </AlertDescription>
                </Alert>

                {/* Box Selector UI for Manual */}
                <div className="space-y-4 rounded-md border bg-white p-4">
                  <h3 className="font-medium">Configuración de Empaque</h3>
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="min-w-[200px] space-y-2">
                      <Label>Seleccionar Caja Manual</Label>
                      <Select
                        value={form.watch("shipping.boxId") || "auto"}
                        onValueChange={handleBoxChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Automático (Recomendado)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">
                            Automático (Recomendado)
                          </SelectItem>
                          {boxes?.map((box: Box) => (
                            <SelectItem key={box.id} value={box.id}>
                              {box.name} ({box.width}x{box.height}x{box.length}
                              cm)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Carrier Name */}
                <FormField
                  control={form.control}
                  name="shipping.carrierName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Transportadora</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ej: Servientrega, TCC, Coordinadora"
                          disabled={loading}
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Tracking Code */}
                <FormField
                  control={form.control}
                  name="shipping.trackingCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número de Guía</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ej: SER123456789"
                          disabled={loading}
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormDescription>
                        Código de seguimiento de la transportadora
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Tracking URL */}
                <FormField
                  control={form.control}
                  name="shipping.trackingUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL de Rastreo</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ej: https://..."
                          disabled={loading}
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Guide URL */}
                <FormField
                  control={form.control}
                  name="shipping.guideUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL de la Guía (PDF)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ej: https://..."
                          disabled={loading}
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Cost and Status in Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="shipping.cost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Costo del Envío</FormLabel>
                        <FormControl>
                          <CurrencyInput
                            placeholder="$ 15.000"
                            disabled={loading}
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormDescription>
                          Cantidad que el cliente pagará por el envío
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="shipping.status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estado del Envío</FormLabel>
                        <Select
                          disabled={loading}
                          onValueChange={field.onChange}
                          value={field.value}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona un estado" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(shippingOptions).map(
                              ([key, label]) => (
                                <SelectItem key={key} value={key}>
                                  {label}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="shipping.deliveryDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Días de entrega</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            placeholder="Ej: 3"
                            disabled={loading}
                            {...field}
                            value={field.value || ""}
                            onChange={(e) =>
                              field.onChange(parseInt(e.target.value) || 0)
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="shipping.isCOD"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Pago Contra Entrega</FormLabel>
                          <FormDescription>
                            ¿Este envío es con recaudo?
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="shipping.estimatedDeliveryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de Entrega Estimada</FormLabel>
                      <FormControl>
                        <DatePicker
                          name={field.name}
                          control={form.control}
                          disabled={loading}
                          placeholder="Selecciona una fecha"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="shipping.notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notas adicionales para el envío</FormLabel>
                      <FormControl>
                        <Textarea
                          disabled={loading}
                          placeholder="Ej: Entregar en la portería"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Show carrier logo if available */}
                {carrierInfo && (
                  <div className="flex items-center gap-3 rounded-md border p-3">
                    <div
                      className="flex h-12 w-20 flex-shrink-0 items-center justify-center rounded-md p-2"
                      style={{
                        backgroundColor: carrierInfo.color || "#FFFFFF",
                      }}
                    >
                      <Image
                        src={carrierInfo.logoUrl}
                        alt={carrierInfo.comercialName}
                        width={64}
                        height={32}
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {carrierInfo.comercialName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Transportadora registrada
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <Button
            disabled={loading}
            className="mt-8 h-12 w-full text-lg font-bold shadow-lg transition-all hover:scale-[1.01]"
            type="submit"
            size="lg"
          >
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
