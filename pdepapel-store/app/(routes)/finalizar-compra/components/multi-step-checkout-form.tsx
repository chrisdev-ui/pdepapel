"use client";

import { checkLiveStock } from "@/actions/check-live-stock";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { FreeShippingProgress } from "@/components/free-shipping-progress";
import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { CloudinaryImage } from "@/components/ui/cloudinary-image";
import { Currency } from "@/components/ui/currency";
import { Form } from "@/components/ui/form";
import { NoResults } from "@/components/ui/no-results";
import { Skeleton } from "@/components/ui/skeleton";
import { KAWAII_FACE_SAD, PaymentMethod } from "@/constants";
import { useCart } from "@/hooks/use-cart";
import useCheckout from "@/hooks/use-checkout";
import {
  isPendingOrderUsable,
  useCheckoutStore,
} from "@/hooks/use-checkout-store";
import { useConfetti } from "@/hooks/use-confetti";
import { useDebounce } from "@/hooks/use-debounce";
import { useGuestUser } from "@/hooks/use-guest-user";
import { useToast } from "@/hooks/use-toast";
import { useCouponMinimumGuard } from "@/hooks/use-coupon-minimum-guard";
import useValidateCoupon from "@/hooks/use-validate-coupon";
import {
  getCheckoutRequestFailureAnalytics,
  getCheckoutStepName,
  summarizeCheckoutValidationErrors,
} from "@/lib/checkout-analytics";
import {
  CHECKOUT_TOTAL_STEPS,
  getFirstInvalidStep,
  getStepFields,
  joinFullName,
} from "@/lib/checkout-steps";
import {
  getAnalyticsValue,
  getGoogleAnalyticsClientId,
  toAnalyticsItem,
  trackCustomerEvent,
} from "@/lib/customer-analytics";
import { readEarlyAccessCookie } from "@/lib/early-access";
import { normalizePhoneForInput } from "@/lib/phone";
import { getCustomerFacingProductOptions } from "@/lib/product-options";
import { orderPath, productPath, STOREFRONT_ROUTES } from "@/lib/routes";
import {
  calculateTotals,
  cn,
  currencyFormatter,
  generateGuestId,
} from "@/lib/utils";
import {
  createIdempotencyKey,
  getCartSignature,
} from "@/lib/checkout-idempotency";
import { Coupon, Product } from "@/types";
import { UnifiedOrder } from "@/types/unified-order";
import { useAuth } from "@clerk/nextjs";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ChevronDown,
  Clock,
  Loader2,
  Lock,
  ShoppingBag,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isValidPhoneNumber } from "react-phone-number-input";
import { MultiStepForm } from "./multi-step-form";
import { StepNavigation } from "./step-navigation";
import { BasicInfoStep } from "./steps/basic-info-step";
import {
  PaymentInfoStep,
  StockConflictItem,
} from "./steps/payment-info-step";
import { ShippingInfoStep } from "./steps/shipping-info-step";

type CheckoutFormUser = {
  firstName?: string | null;
  lastName?: string | null;
  telephone?: string | null;
  email?: string | null;
};

const getProductImageUrl = (product: Product) =>
  product.images.find((image) => image.isMain)?.url ?? product.images[0]?.url;

const shippingSchema = z
  .object({
    carrierName: z.string(),
    courier: z.string(),
    productName: z.string(),
    flete: z.number(),
    minimumInsurance: z.number(),
    deliveryDays: z.number(),
    isCOD: z.boolean(),
    cost: z.number(),
    status: z.string(),
  })
  .partial();

const optionalText = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} debe tener al menos ${min} caracteres`)
    .max(max, `${label} debe tener menos de ${max} caracteres`)
    .optional()
    .or(z.literal(""));

const formSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(3, "Escribe tu nombre y apellidos")
      .max(100, "El nombre debe tener menos de 100 caracteres"),
    email: z
      .string()
      .trim()
      .email("Escribe un correo válido, por ejemplo ana@gmail.com")
      .max(60, "El correo debe tener menos de 60 caracteres"),
    telephone: z.string().refine(isValidPhoneNumber, {
      message: "Escribe un celular válido, por ejemplo 300 123 4567",
    }),
    address1: z
      .string()
      .trim()
      .min(2, "Escribe tu dirección con número")
      .max(50, "La dirección debe tener menos de 50 caracteres"),
    address2: optionalText(2, 50, "El apartamento o torre"),
    neighborhood: optionalText(2, 30, "El barrio"),
    addressReference: optionalText(2, 25, "La referencia"),
    company: optionalText(2, 50, "El nombre de la empresa"),
    city: z
      .string()
      .min(1, "Elige tu ciudad de la lista")
      .max(50, "La ciudad debe tener menos de 50 caracteres"),
    department: z
      .string()
      .min(1, "Elige tu ciudad de la lista")
      .max(50, "El departamento debe tener menos de 50 caracteres"),
    daneCode: z
      .string({
        required_error:
          "Elige tu ciudad y departamento de la lista. Si no aparece, escríbenos por WhatsApp.",
      })
      .length(
        8,
        "Elige tu ciudad y departamento de la lista. Si no aparece, escríbenos por WhatsApp.",
      ),
    documentId: z
      .string()
      .trim()
      .min(5, "Escribe el número de tu documento")
      .max(15, "El documento debe tener menos de 15 caracteres")
      .regex(/^[A-Za-z0-9.-]+$/, "Escribe solo números, sin espacios"),
    saveAddress: z.boolean().default(false),
    savedAddressId: z.string().max(191).optional().or(z.literal("")),
    addressLabel: z
      .string()
      .max(60, "El nombre debe tener menos de 60 caracteres")
      .optional()
      .or(z.literal("")),
    couponCode: z.string().optional().or(z.literal("")),
    newsletterOptIn: z.boolean().default(false),
    // Business rule: the online gateway is the default; bank transfer stays
    // available but needs manual verification, so it is never preselected.
    paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.Bold),
    shippingProvider: z.string().default("ENVIOCLICK"),
    shippingOptionType: z
      .enum(["ENVIOCLICK", "MEDELLIN_LOCAL", "CUSTOM_WHATSAPP"])
      .default("ENVIOCLICK"),
    envioClickIdRate: z.number().optional(),
    shipping: shippingSchema,
  })
  .superRefine((data, ctx) => {
    if (data.shippingOptionType === "ENVIOCLICK") {
      if (data.envioClickIdRate === undefined || data.envioClickIdRate < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Elige una transportadora para continuar",
          path: ["envioClickIdRate"],
        });
      }
    }
  });

export type CheckoutFormValue = z.infer<typeof formSchema>;

async function subscribeFromCheckout(email: string) {
  try {
    await fetch("/api/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, consent: true, source: "pago", company: "" }),
    });
  } catch {
    // La suscripción no bloquea el pedido.
  }
}

interface CheckoutFormProps {
  currentUser?: CheckoutFormUser | null;
  customOrder?: UnifiedOrder | null;
  /** Store free-shipping threshold (COP) on the product subtotal; null = off. */
  freeShippingThreshold?: number | null;
}

export interface CouponState {
  coupon: Coupon | null;
  isValid: boolean | null;
}

const FORM_STEPS = [
  { id: 1, name: "Datos", description: "Contacto" },
  { id: 2, name: "Entrega", description: "Dirección y envío" },
  { id: 3, name: "Pago", description: "Confirmar y pagar" },
];

export const MultiStepCheckoutForm: React.FC<CheckoutFormProps> = ({
  currentUser,
  customOrder,
  freeShippingThreshold = null,
}) => {
  const { userId, getToken } = useAuth();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  const [isNavigationVisible, setIsNavigationVisible] = useState(true);
  const { guestId, setGuestId, clearGuestId } = useGuestUser();
  const cart = useCart();
  const [isMounted, setIsMounted] = useState(false);
  const [stockConflicts, setStockConflicts] = useState<StockConflictItem[]>(
    [],
  );
  const { toast } = useToast();
  const { fireConfetti } = useConfetti();
  const setStoredStep = useCheckoutStore((state) => state.setCurrentStep);
  const setStoredFormData = useCheckoutStore((state) => state.setFormData);
  const setStoredCouponState = useCheckoutStore(
    (state) => state.setCouponState,
  );
  const setPendingOrder = useCheckoutStore((state) => state.setPendingOrder);
  const pendingOrder = useCheckoutStore((state) => state.pendingOrder);
  const resetCheckout = useCheckoutStore((state) => state.resetCheckout);

  // Initialize state from store only once on mount
  const [currentStep, setCurrentStep] = useState(() => {
    const stored = useCheckoutStore.getState().currentStep || 1;
    return Math.min(Math.max(stored, 1), CHECKOUT_TOTAL_STEPS);
  });
  const [isNavigating, setIsNavigating] = useState(false);
  const [isPreparingSubmit, setIsPreparingSubmit] = useState(false);
  const [completedOrderPath, setCompletedOrderPath] = useState<string | null>(
    null,
  );
  const hasFinalizedCheckoutRef = useRef(false);
  const checkoutStartedRef = useRef(false);
  const trackedCheckoutStepsRef = useRef(new Set<number>());
  const analyticsClientIdRef = useRef<string | null>(null);
  const isSubmittingRef = useRef(false);
  // One key per order attempt (see lib/checkout-idempotency): retries of the
  // same attempt reuse it, a created order or a changed cart renews it.
  const idempotencyKeyRef = useRef<string>(createIdempotencyKey());
  const cartSignatureRef = useRef<string | null>(null);

  const [couponState, setCouponState] = useState<CouponState>(() => {
    return (
      useCheckoutStore.getState().couponState || {
        coupon: null,
        isValid: null,
      }
    );
  });

  // Update store when coupon state changes
  useEffect(() => {
    if (completedOrderPath) return;

    setStoredCouponState(couponState);
  }, [completedOrderPath, couponState, setStoredCouponState]);

  const hasVerifiedStockRef = useRef(false);

  // Real-time live stock verification on checkout mount to prevent overselling
  useEffect(() => {
    setIsMounted(true);
    if (hasVerifiedStockRef.current || customOrder) return;
    hasVerifiedStockRef.current = true;

    const cartState = useCart.getState();
    if (cartState.items.length === 0) return;

    const itemIds = cartState.items.map((i) => i.id);
    checkLiveStock(itemIds).then((stockMap) => {
      if (!stockMap || Object.keys(stockMap).length === 0) return;

      const currentCart = useCart.getState();
      let hasAdjusted = false;

      currentCart.items.forEach((item) => {
        const liveInfo = stockMap[item.id];
        if (liveInfo !== undefined) {
          const liveStock = liveInfo.stock;
          if (item.stock !== liveStock) {
            currentCart.updateStock(item.id, liveStock);
            if (item.quantity && item.quantity > liveStock) {
              currentCart.updateQuantity(item.id, Math.max(0, liveStock));
              hasAdjusted = true;
            }
          }
        }
      });

      if (hasAdjusted) {
        toast({
          title: "Actualizamos tu carrito",
          description:
            "Ajustamos las cantidades de tu pedido a la disponibilidad actual.",
          variant: "warning",
        });
      }
    });
  }, [customOrder, toast]);

  const form = useForm<CheckoutFormValue>({
    mode: "onTouched",
    resolver: zodResolver(formSchema),
    defaultValues: async () => {
      const storedFormData = useCheckoutStore.getState().formData;
      if (customOrder) {
        return {
          fullName: customOrder.customerName ?? "",
          telephone: normalizePhoneForInput(customOrder.customerPhone),
          email: customOrder.email ?? "",
          documentId: "",
          address1: customOrder.address ?? "",
          address2: customOrder.address2 ?? "",
          neighborhood: customOrder.neighborhood ?? "",
          addressReference: customOrder.addressReference ?? "",
          company: customOrder.company ?? "",
          city: customOrder.city ?? "",
          department: customOrder.department ?? "",
          daneCode: customOrder.daneCode ?? "",
          saveAddress: false,
          savedAddressId: "",
          addressLabel: "",
          couponCode: "",
          newsletterOptIn: false,
          paymentMethod: PaymentMethod.Bold,
          shippingProvider: "ENVIOCLICK",
          shippingOptionType: "ENVIOCLICK",
          envioClickIdRate: customOrder.shipping?.envioClickIdRate ?? 0,
          shipping: customOrder.shipping
            ? {
                carrierName: customOrder.shipping.carrierName,
                cost: customOrder.shipping.cost,
                status: customOrder.shipping.status,
              }
            : {},
        };
      }

      return {
        fullName:
          storedFormData.fullName ??
          joinFullName(currentUser?.firstName, currentUser?.lastName),
        telephone: normalizePhoneForInput(
          storedFormData.telephone ?? currentUser?.telephone,
        ),
        email: storedFormData.email ?? currentUser?.email ?? "",
        documentId: storedFormData.documentId ?? "",
        address1: storedFormData.address1 ?? "",
        address2: storedFormData.address2 ?? "",
        neighborhood: storedFormData.neighborhood ?? "",
        addressReference: storedFormData.addressReference ?? "",
        company: storedFormData.company ?? "",
        city: storedFormData.city ?? "",
        department: storedFormData.department ?? "",
        daneCode: storedFormData.daneCode ?? "",
        saveAddress: false,
        savedAddressId: storedFormData.savedAddressId ?? "",
        addressLabel: "",
        couponCode: storedFormData.couponCode ?? "",
        newsletterOptIn: storedFormData.newsletterOptIn ?? false,
        shippingProvider: storedFormData.shippingProvider ?? "ENVIOCLICK",
        shippingOptionType: storedFormData.shippingOptionType ?? "ENVIOCLICK",
        envioClickIdRate: storedFormData.envioClickIdRate ?? 0,
        paymentMethod: storedFormData.paymentMethod ?? PaymentMethod.Bold,
        shipping: {
          carrierName: storedFormData.shipping?.carrierName ?? "",
          courier: storedFormData.shipping?.courier ?? "",
          productName: storedFormData.shipping?.productName ?? "",
          flete: storedFormData.shipping?.flete ?? 0,
          minimumInsurance: storedFormData.shipping?.minimumInsurance ?? 0,
          deliveryDays: storedFormData.shipping?.deliveryDays ?? 0,
          isCOD: storedFormData.shipping?.isCOD ?? false,
          cost: storedFormData.shipping?.cost ?? 0,
          status: storedFormData.shipping?.status ?? "",
        },
      };
    },
  });

  // Watch form changes and update store with debounce
  const watchedFormData = form.watch();
  const debouncedFormData = useDebounce(watchedFormData, 500);

  // Fields validate when the customer leaves them («onTouched»), but a field
  // flagged by a step check must clear its error while it is being fixed.
  // Otherwise the message disappears on the blur caused by tapping the
  // button, the layout shifts under the finger and the tap is lost.
  useEffect(() => {
    const subscription = form.watch((_, { name }) => {
      if (name && form.getFieldState(name).invalid) {
        void form.trigger(name);
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  // If customOrder is present, we override the items list
  const activeItems = useMemo(() => {
    if (customOrder) {
      return customOrder.items.map(
        (item) =>
          ({
            id: item.productId || item.id, // Use productId if available or fallback to item id
            name: item.name,
            price: item.unitPrice.toString(),
            originalPrice: 0,
            images: [{ url: item.imageUrl || "", isMain: true }],
            quantity: item.quantity,
            // Mock required Product fields
            category: { name: "", id: "", typeId: "" },
            description: item.description || "",
            stock: 999,
            isFeatured: false,
            size: { name: "", value: "", id: "" },
            color: { name: "", value: "", id: "" },
            design: { name: "", id: "" },
            reviews: [],
            sku: "CUSTOM",
          }) as unknown as Product,
      );
    }
    return cart.items;
  }, [customOrder, cart.items]);

  useEffect(() => {
    if (completedOrderPath) return;

    setStoredFormData(debouncedFormData as Partial<CheckoutFormValue>);
  }, [completedOrderPath, debouncedFormData, setStoredFormData]);

  // A different cart is a different order: renew the idempotency key.
  useEffect(() => {
    const signature = getCartSignature(activeItems);
    if (cartSignatureRef.current !== null && cartSignatureRef.current !== signature) {
      idempotencyKeyRef.current = createIdempotencyKey();
    }
    cartSignatureRef.current = signature;
  }, [activeItems]);

  const isCODShipment = form.watch("shipping.isCOD");
  const paymentMethod = form.watch("paymentMethod");
  const shippingOptionType = form.watch("shippingOptionType");

  useEffect(() => {
    if (!isCODShipment && paymentMethod === PaymentMethod.COD) {
      form.setValue("paymentMethod", PaymentMethod.Bold, {
        shouldDirty: true,
      });
    }
  }, [isCODShipment, paymentMethod, form]);

  const shippingCost = form.watch("shipping.cost");

  const {
    total,
    subtotal,
    couponDiscount,
    productSavings,
    freeShipping,
  } = useMemo(
    () =>
      calculateTotals(
        activeItems,
        couponState.coupon,
        shippingCost,
        freeShippingThreshold,
      ),
    [activeItems, couponState.coupon, shippingCost, freeShippingThreshold],
  );

  // Mismo cuidado que en el carrito: sin la compra mínima el cupón se quita
  // con aviso en vez de fallar al final con un 409.
  const dropCouponBelowMinimum = useCallback(
    (dropped: { code: string; minOrderValue: number | null }) => {
      setCouponState((previous) => ({ ...previous, coupon: null, isValid: null }));
      form.setValue("couponCode", "");
      toast({
        title: "Cupón retirado",
        description: `${dropped.code} pide una compra mínima de ${currencyFormatter.format(Number(dropped.minOrderValue ?? 0))}.`,
        variant: "warning",
      });
    },
    [form, toast],
  );
  useCouponMinimumGuard(couponState.coupon, subtotal, dropCouponBelowMinimum);

  const analyticsItems = useMemo(
    () => activeItems.map((item) => toAnalyticsItem(item, item.quantity ?? 1)),
    [activeItems],
  );

  useEffect(() => {
    if (checkoutStartedRef.current || analyticsItems.length === 0) return;

    checkoutStartedRef.current = true;
    trackCustomerEvent("begin_checkout", {
      currency: "COP",
      items: analyticsItems,
      value: getAnalyticsValue(analyticsItems),
    });
  }, [analyticsItems]);

  useEffect(() => {
    const checkoutStepName = getCheckoutStepName(currentStep);
    if (
      !checkoutStepName ||
      analyticsItems.length === 0 ||
      trackedCheckoutStepsRef.current.has(currentStep)
    ) {
      return;
    }

    trackedCheckoutStepsRef.current.add(currentStep);
    trackCustomerEvent("checkout_step_view", {
      checkout_step: currentStep,
      checkout_step_name: checkoutStepName,
    });
  }, [analyticsItems.length, currentStep]);

  useEffect(() => {
    const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    if (!measurementId) return;

    void getGoogleAnalyticsClientId(measurementId).then((clientId) => {
      analyticsClientIdRef.current = clientId;
    });
  }, []);

  const validateStep = async (step: number) => {
    const fieldsToValidate = getStepFields(
      step,
    ) as (keyof CheckoutFormValue)[];
    const result = await form.trigger(fieldsToValidate);
    if (!result) {
      const invalidFields = fieldsToValidate
        .filter((fieldName) => form.getFieldState(fieldName).invalid)
        .map(String);

      trackCustomerEvent(
        "checkout_validation_error",
        summarizeCheckoutValidationErrors(step, invalidFields),
      );
    }
    return result;
  };

  const scrollToFirstError = () => {
    const { errors } = form.formState;
    const firstErrorKey = Object.keys(errors)[0];
    if (!firstErrorKey) return;

    // Native inputs carry the field name; custom controls (location
    // combobox, radio cards, rate selector) only carry aria-invalid.
    const element = (document.querySelector(`[name="${firstErrorKey}"]`) ??
      document.querySelector(
        '[aria-invalid="true"]',
      )) as HTMLElement | null;
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.focus({ preventScroll: true });
    }
  };

  const scrollToTop = () => {
    document
      .getElementById("checkout-form")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const goToStep = useCallback(
    (step: number) => {
      const nextStep = Math.min(Math.max(step, 1), CHECKOUT_TOTAL_STEPS);
      setCurrentStep(nextStep);
      setStoredStep(nextStep);
      window.setTimeout(scrollToTop, 0);
    },
    [setStoredStep],
  );

  /**
   * The final submit validates the whole form. If a value saved from an
   * earlier session became invalid (expired rate, cleared city…), take the
   * customer back to that step instead of failing silently.
   */
  const handleInvalidSubmit = (errors: Record<string, unknown>) => {
    const invalidFields = Object.keys(errors);
    trackCustomerEvent(
      "checkout_validation_error",
      summarizeCheckoutValidationErrors(currentStep, invalidFields),
    );

    const targetStep = getFirstInvalidStep(errors, currentStep);
    if (targetStep && targetStep !== currentStep) {
      goToStep(targetStep);
    }
    toast({
      title: "Revisa un dato antes de continuar",
      description:
        targetStep && targetStep !== currentStep
          ? `Falta completar algo en el paso ${targetStep}. Te llevamos allí.`
          : "Hay un campo por corregir en este paso.",
      variant: "warning",
    });
    // Wait for the step to render before looking for the invalid control.
    window.setTimeout(scrollToFirstError, 80);
  };

  const handleNext = async () => {
    if (isNavigating) return;
    setIsNavigating(true);
    try {
      // Tapping the button blurs the last field, which starts its own
      // validation in «onTouched» mode; let that settle before validating the
      // step, otherwise the two runs race and the tap does nothing.
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      const isValid = await validateStep(currentStep);
      if (isValid) {
        if (currentStep === 2) {
          const shipping = form.getValues("shipping");
          trackCustomerEvent("add_shipping_info", {
            currency: "COP",
            items: analyticsItems,
            shipping_tier: shipping?.carrierName || "Sin transportadora",
            value: getAnalyticsValue(analyticsItems),
          });
        }

        goToStep(currentStep + 1);
      } else {
        scrollToFirstError();
      }
    } finally {
      // The lock only guards against a double tap while validating; holding
      // it longer leaves the button in «Procesando…» for no reason.
      setIsNavigating(false);
    }
  };

  const handleBack = () => {
    goToStep(currentStep - 1);
  };

  const { mutate: validateCouponMutate, status: validateCouponStatus } =
    useValidateCoupon({
      onError(err) {
        console.error(err);
        setCouponState((prev) => ({
          ...prev,
          coupon: null,
          isValid: false,
        }));
        toast({
          title: "Cupón no válido",
          description: "El código ingresado no es válido o ya expiró.",
          variant: "destructive",
        });
      },
      onSuccess(data) {
        setCouponState((prev) => ({
          ...prev,
          coupon: data,
          isValid: true,
        }));
        toast({
          title: "Cupón aplicado 🎉",
          description: "El descuento ya está en tu total.",
          variant: "success",
        });
      },
    });

  const applyWelcomeBenefit = (code: string) => {
    form.setValue("couponCode", code, { shouldDirty: true });
    setCouponState((previous) => ({
      ...previous,
      coupon: null,
      isValid: null,
    }));
    validateCouponMutate({ code, subtotal });
  };

  const rememberPendingOrder = useCallback(
    (order: { id: string; orderNumber?: string; total?: number }) => {
      setPendingOrder({
        id: order.id,
        orderNumber: order.orderNumber || order.id,
        total: Number(order.total ?? total),
        createdAt: Date.now(),
      });
    },
    [setPendingOrder, total],
  );

  const { mutateAsync, status } = useCheckout({
    getToken,
    onError(err: any) {
      console.error(err);

      if (err?.response?.status === 409) {
        toast({
          title: "Este pedido ya existe",
          description: "Ya fue creado o pagado antes. Revisa tus pedidos.",
          variant: "destructive",
        });
        return;
      }

      // Handle structured stock error (422)
      if (
        err?.response?.status === 422 &&
        err?.response?.data?.details?.items
      ) {
        const items = err.response.data.details.items as {
          productId: string;
          productName?: string;
          available?: number;
          requested?: number;
        }[];
        const conflicts: StockConflictItem[] = items.map((item) => {
          const cartItem = activeItems.find(
            (candidate) => candidate.id === item.productId,
          );
          return {
            productId: item.productId,
            name: item.productName || cartItem?.name || "Producto",
            requested: item.requested ?? cartItem?.quantity ?? 1,
            available: Math.max(0, item.available ?? 0),
          };
        });
        setStockConflicts(conflicts);
        trackCustomerEvent("checkout_stock_unavailable", {
          affected_items: conflicts.length,
          checkout_step: currentStep,
        });
        scrollToTop();
        return;
      }

      const serverError =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        (err?.code === "ECONNABORTED"
          ? "La conexión tardó demasiado."
          : null);

      trackCustomerEvent("checkout_submit_failed", {
        checkout_step: currentStep,
        checkout_step_name: getCheckoutStepName(currentStep) ?? "desconocido",
        ...getCheckoutRequestFailureAnalytics(err),
      });

      toast({
        title: "No pudimos crear tu pedido",
        description: `${serverError ? `${serverError} ` : ""}Tu información sigue aquí y no se cobró nada. Inténtalo de nuevo.`,
        variant: "destructive",
      });
    },
    onSuccess(data) {
      const wantsNewsletter = form.getValues("newsletterOptIn");
      const email = form.getValues("email");
      // This attempt produced an order: the next attempt is a new order.
      idempotencyKeyRef.current = createIdempotencyKey();

      // Fallback gateway: full-page redirect with the order remembered.
      if ("url" in data && typeof data.url === "string") {
        trackCustomerEvent("checkout_payment_redirect", {
          payment_type: PaymentMethod.Wompi,
        });
        if (wantsNewsletter) void subscribeFromCheckout(email);
        // The cart stays until the gateway confirms the payment.
        window.location.href = data.url;
      }
      // Default gateway: pre-signed payload, opened from the order page.
      else if ("boldData" in data && data.boldData !== undefined) {
        const { order } = data;
        trackCustomerEvent("checkout_payment_redirect", {
          payment_type: PaymentMethod.Bold,
        });
        if (wantsNewsletter) void subscribeFromCheckout(email);
        // The order exists but nothing has been paid: keep the cart and the
        // form, remember the order, and open the gateway from the order page
        // (where the payment SDK lives and the status is polled).
        rememberPendingOrder(order);
        toast({
          title: "Pedido creado, falta el pago",
          description: `Tu pedido #${order.orderNumber || order.id} quedó reservado. Te llevamos al pago seguro…`,
        });
        router.push(`${orderPath(order.id)}?autoPay=true`);
      }
      // Offline methods (COD / bank transfer): the order itself comes back.
      else if ("id" in data && data.id !== undefined) {
        const order = data;
        const isBankTransfer =
          form.getValues("paymentMethod") === PaymentMethod.BankTransfer;
        if (!isBankTransfer) fireConfetti();
        toast({
          title: isBankTransfer
            ? "Pedido reservado, falta la transferencia"
            : "¡Pedido creado!",
          description: isBankTransfer
            ? "Te mostramos los datos para transferir. Lo verificamos manualmente y te confirmamos."
            : `Tu pedido #${order.orderNumber || order.id} quedó registrado.`,
          variant: "success",
        });
        if (wantsNewsletter) void subscribeFromCheckout(email);
        setPendingOrder(null);
        setCompletedOrderPath(orderPath(order.id));
      }
    },
  });

  const isPendingSubmit = status === "pending" || isPreparingSubmit;

  useEffect(() => {
    if (!completedOrderPath || hasFinalizedCheckoutRef.current) return;

    hasFinalizedCheckoutRef.current = true;
    cart.removeAll();
    resetCheckout();
    if (userId) clearGuestId();
    router.replace(completedOrderPath);
  }, [cart, clearGuestId, completedOrderPath, resetCheckout, router, userId]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Show the fixed action bar only while the in-form buttons are off screen.
  useEffect(() => {
    const target = navigationRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsNavigationVisible(entry.isIntersecting),
      { rootMargin: "0px 0px -8px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [isMounted, currentStep, activeItems.length, completedOrderPath]);

  const adjustStockConflict = (productId: string, quantity: number) => {
    if (quantity <= 0) cart.removeItem(productId);
    else cart.updateQuantity(productId, quantity);
    setStockConflicts((conflicts) =>
      conflicts.filter((item) => item.productId !== productId),
    );
  };

  if (!isMounted) {
    return <CheckoutFormSkeleton />;
  }

  if (completedOrderPath) {
    return (
      <div
        className="flex min-h-[420px] flex-col items-center justify-center gap-4 text-center"
        aria-busy="true"
        aria-live="polite"
      >
        <Loader2 className="h-10 w-10 animate-spin text-pink-froly" />
        <div className="space-y-1">
          <h2 className="font-serif text-2xl font-bold">Pedido creado</h2>
          <p className="text-muted-foreground">
            Estamos preparando los detalles de tu pedido.
          </p>
        </div>
      </div>
    );
  }

  const totalQuantity = activeItems.reduce(
    (sum, item) => sum + Number(item.quantity ?? 1),
    0,
  );

  const onSubmit = async (data: CheckoutFormValue): Promise<void> => {
    if (isSubmittingRef.current || status === "pending") return;
    isSubmittingRef.current = true;
    setIsPreparingSubmit(true);

    try {
      // Stock is re-checked right before creating the order so the customer
      // fixes quantities here instead of getting a server rejection.
      if (!customOrder) {
        const stockMap = await checkLiveStock(activeItems.map((i) => i.id));
        const conflicts: StockConflictItem[] = activeItems.flatMap((item) => {
          const live = stockMap?.[item.id];
          const requested = item.quantity ?? 1;
          if (!live || live.stock >= requested) return [];
          return [
            {
              productId: item.id,
              name: live.name || item.name,
              requested,
              available: Math.max(0, live.stock),
            },
          ];
        });
        if (conflicts.length > 0) {
          setStockConflicts(conflicts);
          trackCustomerEvent("checkout_stock_unavailable", {
            affected_items: conflicts.length,
            checkout_step: currentStep,
          });
          scrollToTop();
          return;
        }
      }

      const orderItems = activeItems.map((item) => ({
        productId: item.id,
        quantity: item.quantity ?? 1,
      }));
      const {
        fullName,
        email,
        telephone,
        address1,
        address2,
        neighborhood,
        addressReference,
        company,
        city,
        department,
        daneCode,
        documentId,
        saveAddress,
        savedAddressId,
        addressLabel,
        paymentMethod,
        shipping,
        shippingProvider,
        shippingOptionType,
        envioClickIdRate,
      } = data;
      const isUserLoggedIn = Boolean(userId);
      let guestUserId = guestId;
      if (!isUserLoggedIn && !guestUserId) {
        guestUserId = generateGuestId();
        setGuestId(guestUserId);
      }
      const analyticsClientId =
        analyticsClientIdRef.current ??
        (process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
          ? await getGoogleAnalyticsClientId(
              process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
            )
          : null);
      analyticsClientIdRef.current = analyticsClientId;
      const formattedData = {
        fullName: fullName.trim(),
        phone: telephone,
        email,
        orderItems,
        userId: isUserLoggedIn ? userId : null,
        guestId: isUserLoggedIn ? null : guestUserId,
        city,
        department,
        daneCode,
        address: address1,
        address2,
        neighborhood,
        addressReference,
        company,
        documentId,
        shippingProvider,
        shippingOptionType,
        envioClickIdRate,
        payment: {
          method: paymentMethod,
        },
        // The API re-applies the store rule; sending cost 0 keeps both sides
        // and the stored shipping record consistent.
        shipping: freeShipping ? { ...shipping, cost: 0 } : shipping,
        couponCode: couponState.coupon?.code ?? null,
        earlyAccessToken: readEarlyAccessCookie(),
        subtotal,
        total,
        customOrderToken: customOrder?.token, // Include token for conversion
        analyticsClientId,
        saveAddress: Boolean(saveAddress && isUserLoggedIn && !customOrder),
        savedAddressId: saveAddress ? savedAddressId || null : null,
        addressLabel: saveAddress ? addressLabel || null : null,
      };

      trackCustomerEvent("add_payment_info", {
        currency: "COP",
        items: analyticsItems,
        payment_type: paymentMethod,
        value: getAnalyticsValue(analyticsItems),
      });
      trackCustomerEvent("checkout_order_submitted", {
        currency: "COP",
        items: analyticsItems,
        payment_type: paymentMethod,
        value: getAnalyticsValue(analyticsItems),
      });
      setIsPreparingSubmit(false);
      await mutateAsync({
        data: formattedData,
        idempotencyKey: idempotencyKeyRef.current,
      }).catch(() => {
        // Already reported through onError.
      });
    } finally {
      isSubmittingRef.current = false;
      setIsPreparingSubmit(false);
    }
  };

  const submitLabel =
    paymentMethod === PaymentMethod.Bold ||
    paymentMethod === PaymentMethod.Wompi
      ? `Pagar ${currencyFormatter.format(total)}`
      : "Confirmar pedido";

  const submitFootnote =
    paymentMethod === PaymentMethod.Bold ||
    paymentMethod === PaymentMethod.Wompi ? (
      <>
        Vas a la pasarela segura para pagar; no se cobra nada hasta que
        confirmes allí. Al continuar aceptas las{" "}
        <Link
          href={STOREFRONT_ROUTES.shippingPolicy}
          className="underline underline-offset-4"
        >
          políticas de entrega y cambios
        </Link>
        .
      </>
    ) : paymentMethod === PaymentMethod.BankTransfer ? (
      <>
        Te mostraremos la cuenta y el valor exacto en la siguiente pantalla.
        Al continuar aceptas las{" "}
        <Link
          href={STOREFRONT_ROUTES.shippingPolicy}
          className="underline underline-offset-4"
        >
          políticas de entrega y cambios
        </Link>
        .
      </>
    ) : (
      <>
        Pagas al recibir. Al continuar aceptas las{" "}
        <Link
          href={STOREFRONT_ROUTES.shippingPolicy}
          className="underline underline-offset-4"
        >
          políticas de entrega y cambios
        </Link>
        .
      </>
    );

  const shippingSummary = (() => {
    if (shippingOptionType === "MEDELLIN_LOCAL") {
      return (
        <span className="text-sm text-muted-foreground">
          Se acuerda por WhatsApp
        </span>
      );
    }
    if (shippingOptionType === "CUSTOM_WHATSAPP") {
      return (
        <span className="text-sm text-muted-foreground">
          Se acuerda por WhatsApp
        </span>
      );
    }
    if (freeShipping) {
      return (
        <span className="rounded-full bg-kawaii-mint-light px-3 py-1 font-sans text-sm font-bold text-blue-yankees">
          Gratis
        </span>
      );
    }
    if ((shippingCost ?? 0) > 0) {
      return (
        <Currency className="text-base font-semibold" value={shippingCost} />
      );
    }
    return (
      <span className="text-sm text-muted-foreground">
        Se calcula en Entrega
      </span>
    );
  })();

  const summary = (
    <div className="flex w-full flex-col gap-4">
      <div className="flex w-full items-center justify-between">
        <h2 className="font-serif text-xl font-bold text-blue-yankees">
          Tu pedido{" "}
          <span className="font-quicksand text-sm font-semibold text-muted-foreground">
            ({totalQuantity})
          </span>
        </h2>
        {!customOrder && (
          <Link
            href={STOREFRONT_ROUTES.cart}
            className="text-sm font-semibold underline underline-offset-4"
          >
            Editar carrito
          </Link>
        )}
      </div>
      <ul className="flex w-full flex-col gap-3">
        {activeItems.map((item) => {
          const conflict = stockConflicts.find(
            (candidate) => candidate.productId === item.id,
          );
          return (
            <li
              key={item.id}
              className={cn(
                "grid grid-cols-[64px_1fr] gap-3 rounded-lg transition-colors",
                conflict ? "border border-destructive bg-destructive/10 p-2" : "",
              )}
            >
              <Link
                href={productPath(item.slug || item.id)}
                className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-md bg-gray-100"
              >
                {getProductImageUrl(item) ? (
                  <CloudinaryImage
                    src={getProductImageUrl(item)!}
                    alt={item.name ?? "Imagen del producto"}
                    width={64}
                    height={64}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <>
                    <ShoppingBag
                      aria-hidden="true"
                      className="h-6 w-6 text-gray-400"
                    />
                    <span className="sr-only">Sin imagen disponible</span>
                  </>
                )}
                <span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-yankees px-1 font-quicksand text-[11px] font-bold text-white">
                  {item.quantity}
                </span>
              </Link>
              <div className="flex min-w-0 flex-col justify-between gap-1">
                <div className="flex min-w-0 flex-col text-left text-sm">
                  <span className="line-clamp-2 font-semibold" title={item.name}>
                    {item.name}
                  </span>
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {[
                      item.design?.name ? `Diseño: ${item.design.name}` : null,
                      item.color?.name ? `Color: ${item.color.name}` : null,
                      ...getCustomerFacingProductOptions(item).map(
                        (option) => `${option.name}: ${option.value}`,
                      ),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {conflict && (
                    <span className="mt-1 text-xs font-bold text-destructive">
                      {conflict.available > 0
                        ? `Solo quedan ${conflict.available}`
                        : "Sin stock"}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2">
                  <Currency className="text-base font-bold" value={item.price} />
                  {item.hasDiscount ||
                  (item.originalPrice &&
                    item.originalPrice > Number(item.price)) ? (
                    <Currency
                      className="text-xs text-gray-500 line-through"
                      value={item.originalPrice}
                    />
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {!customOrder && (
        <FreeShippingProgress
          subtotal={subtotal}
          threshold={freeShippingThreshold}
          className="border-y py-3"
        />
      )}
      <dl className="flex w-full flex-col gap-2.5 text-sm">
        <div className="flex items-center justify-between">
          <dt>Subtotal</dt>
          <dd>
            <Currency className="text-base font-semibold" value={subtotal} />
          </dd>
        </div>
        {productSavings > 0 ? (
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Ahorros en ofertas</dt>
            <dd>
              <Currency
                className="text-base font-semibold text-success"
                value={productSavings}
              />
            </dd>
          </div>
        ) : null}
        {couponDiscount > 0 ? (
          <div className="flex items-center justify-between">
            <dt className="text-destructive">
              Cupón{" "}
              {couponState.coupon?.type === "PERCENTAGE"
                ? `(${couponState.coupon.amount}%)`
                : ""}
            </dt>
            <dd>
              <Currency
                className="text-base font-semibold text-destructive"
                value={couponDiscount}
                isNegative
              />
            </dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between">
          <dt>Envío</dt>
          <dd>{shippingSummary}</dd>
        </div>
        <div className="flex items-center justify-between border-t border-dashed pt-3">
          <dt className="text-base font-bold">Total a pagar</dt>
          <dd>
            <Currency className="font-quicksand text-2xl font-black text-pink-froly" value={total} />
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        IVA incluido. Sin cargos ocultos: el envío que ves es el que pagas.
      </p>
      <ul className="flex flex-col gap-2 border-t pt-3 text-xs text-foreground/80">
        <li className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
          Pago seguro: tus datos viajan cifrados.
        </li>
        <li className="flex items-center gap-2">
          <Undo2 className="h-3.5 w-3.5 shrink-0 text-blue-yankees" aria-hidden="true" />
          Cambios hasta 5 días después de recibir.
        </li>
        <li className="flex items-center gap-2">
          <Icons.whatsapp className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          ¿Dudas? Escríbenos por WhatsApp.
        </li>
      </ul>
    </div>
  );

  const showPendingOrder =
    !customOrder && isPendingOrderUsable(pendingOrder) && !completedOrderPath;

  return (
    <>
      {activeItems.length === 0 && (
        <div className="my-12">
          <NoResults
            message={`No hay productos en el carrito ${KAWAII_FACE_SAD}`}
          />
          <Button asChild className="mt-4 rounded-full">
            <Link href={STOREFRONT_ROUTES.shop}>
              <ArrowLeft className="mr-2 h-5 w-5" /> Regresar a la tienda
            </Link>
          </Button>
        </div>
      )}
      {activeItems.length > 0 && (
        <div className="mt-4 space-y-6 lg:mt-8 lg:grid lg:grid-cols-12 lg:items-start lg:gap-8 lg:space-y-0">
          <div className="space-y-4 lg:col-span-8" id="checkout-form">
            {showPendingOrder && pendingOrder && (
              <div
                className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between"
                role="status"
              >
                <p className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    <strong>
                      Tienes un pedido pendiente de pago (#
                      {pendingOrder.orderNumber})
                    </strong>{" "}
                    por {currencyFormatter.format(pendingOrder.total)}. Puedes
                    pagarlo ahora o crear uno nuevo con este carrito.
                  </span>
                </p>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button asChild size="sm" className="h-9 rounded-full">
                    <Link href={`${orderPath(pendingOrder.id)}?autoPay=true`}>
                      Pagar ahora
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-full"
                    onClick={() => setPendingOrder(null)}
                  >
                    Crear uno nuevo
                  </Button>
                </div>
              </div>
            )}

            {/* Mobile: collapsible summary so the total is never out of sight. */}
            <details className="group rounded-xl border border-blue-baby/60 bg-blue-purple/10 lg:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                  {totalQuantity} {totalQuantity === 1 ? "producto" : "productos"}
                  <span className="font-normal text-muted-foreground underline underline-offset-4">
                    Ver resumen
                  </span>
                  <ChevronDown
                    className="h-4 w-4 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </span>
                <Currency
                  className="font-quicksand text-lg font-black text-pink-froly"
                  value={total}
                />
              </summary>
              <div className="border-t border-blue-baby/60 bg-background p-4">
                {summary}
              </div>
            </details>

            <div className="rounded-xl border border-blue-baby/60 bg-card p-4 shadow-[20px_20px_30px_rgba(0,0,0,0.02)] sm:p-6">
              <MultiStepForm steps={FORM_STEPS} currentStep={currentStep}>
                <Form {...form}>
                  <form
                    ref={formRef}
                    onSubmit={form.handleSubmit(onSubmit, handleInvalidSubmit)}
                    className="space-y-6"
                    autoComplete="on"
                    noValidate
                    data-clarity-mask="true"
                  >
                    <div className="relative min-h-[300px]">
                      {currentStep === 1 && (
                        <BasicInfoStep form={form} isLoading={isPendingSubmit} />
                      )}
                      {currentStep === 2 && (
                        <ShippingInfoStep
                          form={form}
                          isLoading={isPendingSubmit}
                          allowSavedAddresses={!customOrder}
                          cartItems={activeItems.map((item) => ({
                            id: item.id,
                            quantity: item.quantity || 1,
                          }))}
                          orderTotal={subtotal}
                          freeShipping={freeShipping}
                        />
                      )}
                      {currentStep === 3 && (
                        <PaymentInfoStep
                          form={form}
                          isLoading={isPendingSubmit}
                          couponState={couponState}
                          setCouponState={setCouponState}
                          validateCouponMutate={validateCouponMutate}
                          validateCouponStatus={validateCouponStatus}
                          subtotal={subtotal}
                          shippingCost={shippingCost ?? 0}
                          freeShipping={freeShipping}
                          onEditStep={goToStep}
                          onApplyWelcomeBenefit={applyWelcomeBenefit}
                          stockConflicts={stockConflicts}
                          onAdjustStock={adjustStockConflict}
                          onDismissStockConflicts={() => setStockConflicts([])}
                        />
                      )}
                    </div>

                    <StepNavigation
                      ref={navigationRef}
                      currentStep={currentStep}
                      totalSteps={FORM_STEPS.length}
                      onNext={handleNext}
                      onBack={handleBack}
                      isNextDisabled={
                        currentStep === FORM_STEPS.length &&
                        stockConflicts.length > 0
                      }
                      isLoading={isPendingSubmit || isNavigating}
                      submitLabel={submitLabel}
                      footnote={
                        currentStep === FORM_STEPS.length
                          ? submitFootnote
                          : undefined
                      }
                    />
                  </form>
                </Form>
              </MultiStepForm>
            </div>
          </div>
          <aside className="hidden rounded-xl border border-blue-baby/60 bg-card p-5 shadow-[20px_20px_30px_rgba(0,0,0,0.02)] lg:sticky lg:top-24 lg:col-span-4 lg:block">
            {summary}
          </aside>
        </div>
      )}
      {/* Phone: the main action follows the customer once the in-form buttons scroll away. */}
      {activeItems.length > 0 && !isNavigationVisible && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-blue-baby/60 bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <div className="flex min-w-0 flex-col">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Total a pagar
              </span>
              <Currency
                className="text-lg font-black text-pink-froly"
                value={total}
              />
            </div>
            <Button
              type="button"
              disabled={
                isPendingSubmit ||
                isNavigating ||
                (currentStep === FORM_STEPS.length && stockConflicts.length > 0)
              }
              aria-busy={isPendingSubmit || undefined}
              className="ml-auto h-12 shrink-0 rounded-full px-6 text-base font-semibold"
              onClick={() => {
                if (currentStep === FORM_STEPS.length) {
                  formRef.current?.requestSubmit();
                } else {
                  void handleNext();
                }
              }}
            >
              {isPendingSubmit ? (
                <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
              ) : currentStep === FORM_STEPS.length ? (
                <Lock aria-hidden="true" className="mr-2 h-4 w-4" />
              ) : null}
              {currentStep === FORM_STEPS.length
                ? submitLabel
                : currentStep === 1
                  ? "Continuar a entrega"
                  : "Continuar al pago"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

const CheckoutFormSkeleton = () => (
  <div
    className="mt-4 space-y-6 lg:mt-8 lg:grid lg:grid-cols-12 lg:items-start lg:gap-8 lg:space-y-0"
    aria-busy="true"
    aria-live="polite"
  >
    <span className="sr-only">Cargando formulario de compra</span>
    <div className="space-y-6 rounded-xl border border-blue-baby/60 p-4 sm:p-6 lg:col-span-8">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-8 w-3/5" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
      <div className="flex justify-end pt-6">
        <Skeleton className="h-12 w-52 rounded-full" />
      </div>
    </div>
    <div className="hidden space-y-4 rounded-xl border border-blue-baby/60 p-5 lg:col-span-4 lg:block">
      <Skeleton className="h-7 w-40" />
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="flex gap-3">
          <Skeleton className="h-16 w-16 shrink-0" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
      <Skeleton className="h-px w-full" />
      <Skeleton className="h-7 w-full" />
    </div>
  </div>
);
