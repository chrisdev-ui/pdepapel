"use client";

import { checkLiveStock } from "@/actions/check-live-stock";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { PayUForm } from "@/components/payu-form";
import { CldImage } from "@/components/ui/CldImage";
import { Button } from "@/components/ui/button";
import { Currency } from "@/components/ui/currency";
import { Form } from "@/components/ui/form";
import { NoResults } from "@/components/ui/no-results";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { KAWAII_FACE_SAD, PaymentMethod } from "@/constants";
import { useCart } from "@/hooks/use-cart";
import useCheckout from "@/hooks/use-checkout";
import { useCheckoutStore } from "@/hooks/use-checkout-store";
import { useConfetti } from "@/hooks/use-confetti";
import { useDebounce } from "@/hooks/use-debounce";
import { useGuestUser } from "@/hooks/use-guest-user";
import { useToast } from "@/hooks/use-toast";
import useValidateCoupon from "@/hooks/use-validate-coupon";
import { calculateTotals, cn, generateGuestId } from "@/lib/utils";
import { toBoldCheckoutConfig } from "@/lib/bold";
import {
  getAnalyticsValue,
  getGoogleAnalyticsClientId,
  toAnalyticsItem,
  trackCustomerEvent,
} from "@/lib/customer-analytics";
import { orderPath, productPath, STOREFRONT_ROUTES } from "@/lib/routes";
import {
  CheckoutByOrderResponse,
  Coupon,
  Order,
  PayUFormState,
  Product,
  WompiResponse,
} from "@/types";
import { UnifiedOrder } from "@/types/unified-order";
import { useAuth } from "@clerk/nextjs";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isValidPhoneNumber } from "react-phone-number-input";
import { MultiStepForm } from "./multi-step-form";
import { StepNavigation } from "./step-navigation";
import { BasicInfoStep } from "./steps/basic-info-step";
import { PaymentInfoStep } from "./steps/payment-info-step";
import { ReviewStep } from "./steps/review-step";
import { ShippingInfoStep } from "./steps/shipping-info-step";

type CheckoutFormUser = {
  firstName?: string | null;
  lastName?: string | null;
  telephone?: string | null;
  email?: string | null;
};

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

const formSchema = z
  .object({
    firstName: z
      .string()
      .min(1, "Por favor, escribe tu nombre")
      .max(50, "El nombre debe tener menos de 50 caracteres"),
    lastName: z
      .string()
      .min(1, "Por favor, escribe tus apellidos")
      .max(50, "Los apellidos deben tener menos de 50 caracteres"),
    email: z
      .string()
      .email("Por favor, escribe un correo válido")
      .min(8, "El correo debe tener al menos 8 caracteres")
      .max(60, "El correo debe tener menos de 60 caracteres"),
    telephone: z.string().refine(isValidPhoneNumber, {
      message: "Por favor, escribe un número de teléfono válido",
    }),
    address1: z
      .string()
      .min(2, "Por favor, escribe tu dirección principal")
      .max(50, "La dirección debe tener menos de 50 caracteres"),
    address2: z
      .string()
      .min(2, "La dirección adicional debe tener al menos 2 caracteres")
      .max(50, "La dirección adicional debe tener menos de 50 caracteres")
      .optional()
      .or(z.literal("")),
    neighborhood: z
      .string()
      .min(2, "El barrio debe tener al menos 2 caracteres")
      .max(30, "El barrio debe tener menos de 30 caracteres")
      .optional()
      .or(z.literal("")),
    addressReference: z
      .string()
      .min(2, "La referencia de tu domicilio debe tener al menos 2 caracteres")
      .max(
        25,
        "La referencia de tu domicilio debe tener menos de 25 caracteres",
      )
      .optional()
      .or(z.literal("")),
    company: z
      .string()
      .min(2, "El nombre de tu empresa debe tener al menos 2 caracteres")
      .max(50, "El nombre de tu empresa debe tener menos de 50 caracteres")
      .optional()
      .or(z.literal("")),
    city: z
      .string()
      .min(1, "Por favor, escribe tu ciudad")
      .max(50, "La ciudad debe tener menos de 50 caracteres"),
    department: z
      .string()
      .min(1, "Por favor, escribe tu departamento")
      .max(50, "El departamento debe tener menos de 50 caracteres"),
    daneCode: z
      .string({
        required_error:
          "Selecciona tu ciudad y departamento. Si no encuentras tu ciudad, comunica tu domicilio a nuestro WhatsApp.",
      })
      .length(
        8,
        "Selecciona tu ciudad y departamento. Si no encuentras tu ciudad, comunica tu domicilio a nuestro WhatsApp.",
      ),
    documentId: z
      .string()
      .min(1, "Por favor, escribe tu número de identificación")
      .max(15, "El número de identificación debe tener menos de 15 caracteres"),
    saveAddress: z.boolean().default(false),
    savedAddressId: z.string().max(191).optional().or(z.literal("")),
    addressLabel: z
      .string()
      .max(60, "El nombre debe tener menos de 60 caracteres")
      .optional()
      .or(z.literal("")),
    couponCode: z.string().optional().or(z.literal("")),
    paymentMethod: z
      .nativeEnum(PaymentMethod)
      .default(PaymentMethod.BankTransfer),
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
          message: "Por favor, calcula y selecciona una tarifa de envío",
          path: ["envioClickIdRate"],
        });
      }
    }
  });

export type CheckoutFormValue = z.infer<typeof formSchema>;

import { Season } from "@/types";

interface CheckoutFormProps {
  currentUser?: CheckoutFormUser | null;
  season?: Season;
  customOrder?: UnifiedOrder | null;
}

export interface CouponState {
  coupon: Coupon | null;
  isValid: boolean | null;
}

const FORM_STEPS = [
  {
    id: 1,
    name: "Información",
    description: "Datos básicos",
    logo: "basic-info.webp",
  },
  {
    id: 2,
    name: "Envío",
    description: "Dirección de entrega",
    logo: "shipping-info.webp",
  },
  {
    id: 3,
    name: "Pago",
    description: "Método de pago",
    logo: "payment-info.webp",
  },
  {
    id: 4,
    name: "Revisión",
    description: "Confirmar",
    logo: "review-info.webp",
  },
];

export const MultiStepCheckoutForm: React.FC<CheckoutFormProps> = ({
  currentUser,
  season = Season.Default,
  customOrder,
}) => {
  const { userId, getToken } = useAuth();
  const router = useRouter();
  const payUFormRef = useRef<HTMLFormElement>(null);
  const [payUformData, setPayUformData] = useState<PayUFormState>();
  const [hasSubmittedPayU, setHasSubmittedPayU] = useState(false);
  const { guestId, setGuestId, clearGuestId } = useGuestUser();
  const cart = useCart();
  const [isMounted, setIsMounted] = useState(false);
  const [outOfStockItems, setOutOfStockItems] = useState<string[]>([]); // Product IDs
  const { toast } = useToast();
  const { fireConfetti } = useConfetti();
  const setStoredStep = useCheckoutStore((state) => state.setCurrentStep);
  const setStoredFormData = useCheckoutStore((state) => state.setFormData);
  const setStoredCouponState = useCheckoutStore(
    (state) => state.setCouponState,
  );
  const resetCheckout = useCheckoutStore((state) => state.resetCheckout);

  // Initialize state from store only once on mount
  const [currentStep, setCurrentStep] = useState(() => {
    return useCheckoutStore.getState().currentStep || 1;
  });
  const [isNavigating, setIsNavigating] = useState(false);
  const [completedOrderPath, setCompletedOrderPath] = useState<string | null>(
    null,
  );
  const hasFinalizedCheckoutRef = useRef(false);
  const checkoutStartedRef = useRef(false);
  const analyticsClientIdRef = useRef<string | null>(null);

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
          title: "Actualización de Inventario",
          description:
            "Ajustamos las cantidades de tu pedido de acuerdo a la disponibilidad actual.",
          variant: "warning",
        });
      }
    });
  }, [customOrder, toast]);

  const form = useForm<CheckoutFormValue>({
    mode: "onChange",
    resolver: zodResolver(formSchema),
    defaultValues: async () => {
      const storedFormData = useCheckoutStore.getState().formData;
      if (customOrder) {
        return {
          firstName: customOrder.customerName
            ? customOrder.customerName.split(" ")[0]
            : "",
          lastName: customOrder.customerName
            ? customOrder.customerName.split(" ").slice(1).join(" ")
            : "",
          telephone: customOrder.customerPhone ?? "",
          email: customOrder.email ?? "",
          documentId: "", // Not usually in quotation but can be if added
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
          paymentMethod: PaymentMethod.BankTransfer,
          shippingProvider: "ENVIOCLICK",
          shippingOptionType: "ENVIOCLICK",
          envioClickIdRate: customOrder.shipping?.envioClickIdRate ?? 0,
          shipping: customOrder.shipping
            ? {
                carrieName: customOrder.shipping.carrierName,
                cost: customOrder.shipping.cost,
                status: customOrder.shipping.status,
                // Add other potential mappings if schema expects them
              }
            : {},
        };
      }

      return {
        firstName: storedFormData.firstName ?? currentUser?.firstName ?? "",
        lastName: storedFormData.lastName ?? currentUser?.lastName ?? "",
        telephone: storedFormData.telephone ?? currentUser?.telephone ?? "",
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
        savedAddressId: "",
        addressLabel: "",
        couponCode: storedFormData.couponCode ?? "",
        shippingProvider: storedFormData.shippingProvider ?? "ENVIOCLICK",
        shippingOptionType: storedFormData.shippingOptionType ?? "ENVIOCLICK",
        envioClickIdRate: storedFormData.envioClickIdRate ?? 0,
        paymentMethod:
          storedFormData.paymentMethod ?? PaymentMethod.BankTransfer,
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

  useEffect(() => {
    if (payUformData && payUFormRef.current && !hasSubmittedPayU) {
      setHasSubmittedPayU(true);
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        payUFormRef.current?.submit();
      }, 100);
    }
  }, [payUformData, hasSubmittedPayU]);

  const isCODShipment = form.watch("shipping.isCOD");
  const paymentMethod = form.watch("paymentMethod");

  useEffect(() => {
    if (!isCODShipment && paymentMethod === PaymentMethod.COD) {
      form.setValue("paymentMethod", PaymentMethod.BankTransfer, {
        shouldDirty: true,
      });
    }
  }, [isCODShipment, paymentMethod, form]);

  const shippingCost = form.watch("shipping.cost");

  const { total, subtotal, couponDiscount, productSavings } = useMemo(
    () => calculateTotals(activeItems, couponState.coupon, shippingCost),
    [activeItems, couponState.coupon, shippingCost],
  );

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
    const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    if (!measurementId) return;

    void getGoogleAnalyticsClientId(measurementId).then((clientId) => {
      analyticsClientIdRef.current = clientId;
    });
  }, []);

  const validateStep = async (step: number) => {
    let fieldsToValidate: (keyof CheckoutFormValue)[] = [];
    if (step === 1) {
      fieldsToValidate = [
        "firstName",
        "lastName",
        "email",
        "telephone",
        "documentId",
      ];
    } else if (step === 2) {
      fieldsToValidate = [
        "address1",
        "address2",
        "neighborhood",
        "addressReference",
        "company",
        "city",
        "department",
        "daneCode",
        "shippingOptionType",
        "envioClickIdRate",
      ];
    } else if (step === 3) {
      fieldsToValidate = ["paymentMethod"];
    }
    const result = await form.trigger(fieldsToValidate);
    return result;
  };

  const scrollToFirstError = () => {
    const { errors } = form.formState;
    const firstErrorKey = Object.keys(errors)[0];
    if (firstErrorKey) {
      const element = document.querySelector(
        `[name="${firstErrorKey}"]`,
      ) as HTMLElement;
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.focus();
      }
    }
  };

  const handleNext = async () => {
    if (isNavigating) return;
    setIsNavigating(true);
    try {
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

        if (currentStep === 3) {
          trackCustomerEvent("add_payment_info", {
            currency: "COP",
            items: analyticsItems,
            payment_type: form.getValues("paymentMethod"),
            value: getAnalyticsValue(analyticsItems),
          });
        }

        const nextStep = Math.min(currentStep + 1, FORM_STEPS.length);
        setCurrentStep(nextStep);
        setStoredStep(nextStep);
      } else {
        scrollToFirstError();
      }
    } finally {
      setTimeout(() => setIsNavigating(false), 500);
    }
  };

  const handleBack = () => {
    const prevStep = Math.max(currentStep - 1, 1);
    setCurrentStep(prevStep);
    setStoredStep(prevStep);
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
          title: "Cupón no válido ❌",
          description: "El código ingresado no es válido o ha expirado.",
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
          title: "Cupón validado 🎉",
          description: "El cupón es válido y se ha aplicado al pedido.",
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

  const { mutate, status } = useCheckout({
    getToken,
    onError(err: any) {
      console.error(err);

      if (err?.response?.status === 409) {
        toast({
          title: "Orden ya procesada ⚠️",
          description: "Esta orden ya fue generada o pagada previamente.",
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
          productName: string;
        }[];
        const ids = items.map((i) => i.productId);
        setOutOfStockItems(ids);
        trackCustomerEvent("checkout_stock_unavailable", {
          affected_items: ids.length,
          checkout_step: currentStep,
        });

        toast({
          title: "Stock insuficiente ⚠️",
          description:
            "Algunos productos marcados en rojo ya no tienen stock disponible. Por favor revísalos.",
          variant: "destructive",
        });
        // Do NOT redirect automatically, let user see the red items
        return;
      }

      const serverError =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message;

      toast({
        title: "Error al crear la orden",
        description:
          serverError ||
          "Ha ocurrido un error creando tu orden, intenta de nuevo más tarde.",
        variant: "destructive",
      });
    },
    onSuccess(data) {
      // Check for PayU response first
      if (
        (data as CheckoutByOrderResponse as PayUFormState).referenceCode !==
        undefined
      ) {
        const payUData = data as CheckoutByOrderResponse as PayUFormState;
        setPayUformData(payUData);
      }
      // Check for Wompi response second
      else if (
        (data as CheckoutByOrderResponse as WompiResponse).url !== undefined
      ) {
        const { url } = data as CheckoutByOrderResponse as WompiResponse;
        trackCustomerEvent("checkout_payment_redirect", {
          payment_type: PaymentMethod.Wompi,
        });
        window.location.href = url;
      }
      // Check for Bold response
      else if ((data as any)?.boldData !== undefined) {
        const { order, boldData } = data as any;
        trackCustomerEvent("checkout_payment_redirect", {
          payment_type: PaymentMethod.Bold,
        });
        fireConfetti();
        toast({
          title: "Orden creada",
          description: `Tu orden #${order.orderNumber || order.id} ha sido creada exitosamente. Redirigiendo al pago en línea...`,
          variant: "success",
        });

        cart.removeAll();
        form.reset();
        resetCheckout();
        if (userId) clearGuestId();

        // 🚀 Redirect to Bold directly from the checkout page
        if (window.BoldCheckout) {
          try {
            const boldCheckout = new window.BoldCheckout(
              toBoldCheckoutConfig(boldData),
            );
            boldCheckout.open();
            return; // Exit here, the browser will redirect
          } catch (e) {
            console.error("Error opening Bold checkout:", e);
          }
        }

        // Fallback: Navigate to order page where BoldCheckoutButton will auto-open
        router.push(`${orderPath(order.id)}?autoPay=true`);
      }
      // Finally check for direct order creation (COD/BankTransfer)
      else if ((data as Order).id !== undefined) {
        const order = data as Order;
        fireConfetti();
        toast({
          title: "Orden creada",
          description: `Tu orden #${order.id} ha sido creada exitosamente`,
          variant: "success",
        });
        setCompletedOrderPath(orderPath(order.id));
      }
    },
  });

  const isPendingSubmit = useMemo(() => status === "pending", [status]);

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
    (total, item) => total + Number(item.quantity ?? 1),
    0,
  );

  const onSubmit = async (data: CheckoutFormValue): Promise<void> => {
    const orderItems = activeItems.map((item) => ({
      productId: item.id,
      quantity: item.quantity ?? 1,
    }));
    const {
      firstName,
      lastName,
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
      fullName: `${firstName} ${lastName}`,
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
      shipping,
      couponCode: couponState.coupon?.code ?? null,
      subtotal,
      total,
      customOrderToken: customOrder?.token, // Include token for conversion
      analyticsClientId,
      saveAddress: Boolean(saveAddress && isUserLoggedIn && !customOrder),
      savedAddressId: saveAddress ? savedAddressId || null : null,
      addressLabel: saveAddress ? addressLabel || null : null,
    };

    trackCustomerEvent("checkout_order_submitted", {
      currency: "COP",
      items: analyticsItems,
      payment_type: paymentMethod,
      value: getAnalyticsValue(analyticsItems),
    });
    mutate(formattedData);
  };

  return (
    <>
      {activeItems.length === 0 && (
        <div className="my-12">
          <NoResults
            message={`No hay productos en el carrito ${KAWAII_FACE_SAD}`}
          />
          <Link href={STOREFRONT_ROUTES.shop}>
            <Button className="mt-4">
              {" "}
              <ArrowLeft className="mr-2 h-5 w-5" /> Regresar a la tienda
            </Button>
          </Link>
        </div>
      )}
      {activeItems.length > 0 && (
        <div className="mt-4 space-y-8 lg:mt-12 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6 lg:space-y-0">
          <div className="rounded-md border p-5 lg:col-span-8">
            <MultiStepForm
              steps={FORM_STEPS}
              currentStep={currentStep}
              season={season}
            >
              {/* Step Content */}
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-8"
                  autoComplete="off"
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
                      />
                    )}
                    {currentStep === 3 && (
                      <PaymentInfoStep
                        form={form}
                        isLoading={isPendingSubmit}
                      />
                    )}
                    {currentStep === 4 && (
                      <ReviewStep
                        form={form}
                        isLoading={isPendingSubmit}
                        couponState={couponState}
                        setCouponState={setCouponState}
                        validateCouponMutate={validateCouponMutate}
                        validateCouponStatus={validateCouponStatus}
                        subtotal={subtotal}
                        onEditStep={setCurrentStep}
                        onApplyWelcomeBenefit={applyWelcomeBenefit}
                      />
                    )}
                  </div>

                  {/* Navigation */}
                  <StepNavigation
                    currentStep={currentStep}
                    totalSteps={FORM_STEPS.length}
                    onNext={handleNext}
                    onBack={handleBack}
                    isNextDisabled={false}
                    isLoading={isPendingSubmit || isNavigating}
                  />
                </form>
              </Form>
            </MultiStepForm>
          </div>
          <div className="rounded-md border p-5 lg:col-span-4">
            <div className="flex w-full items-center justify-between">
              <h2 className="font-serif text-lg font-bold">
                ({totalQuantity}) Productos
              </h2>
              {!customOrder && (
                <Link
                  href={STOREFRONT_ROUTES.cart}
                  className="text-sm underline"
                >
                  Editar
                </Link>
              )}
            </div>
            <Separator className="mt-6" />
            <div className="mt-6 flex w-full flex-col gap-4">
              {activeItems.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "grid grid-cols-[80px_1fr] gap-2.5 rounded-md p-2 transition-colors",
                    outOfStockItems.includes(item.id)
                      ? "border border-destructive bg-destructive/10"
                      : "",
                  )}
                >
                  <Link
                    href={productPath(item.slug || item.id)}
                    className="relative h-20 w-20"
                  >
                    <CldImage
                      src={
                        item.images.find((image) => image.isMain)?.url ??
                        item.images[0].url
                      }
                      alt={item.name ?? "Imagen del producto"}
                      fill
                      sizes="(max-width: 640px) 80px, 120px"
                      className="rounded-md"
                    />
                    <span className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-blue-yankees font-serif text-xs text-white">
                      {item.quantity}
                    </span>
                  </Link>
                  <div className="flex min-w-0 items-center justify-between">
                    <div className="flex min-w-0 flex-1 flex-col items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-col text-left font-serif text-sm font-medium tracking-tight">
                        <span className="line-clamp-2" title={item.name}>
                          {item.name}
                        </span>
                        {item.design && (
                          <span className="line-clamp-1 text-xs text-gray-400">{`Diseño: ${item.design.name}`}</span>
                        )}
                        {item.color && (
                          <span className="line-clamp-1 text-xs text-gray-400">{`Color: ${item.color.name}`}</span>
                        )}
                        {item.size && (
                          <span className="line-clamp-1 text-xs text-gray-400">{`Talla: ${item.size.name}`}</span>
                        )}
                        {outOfStockItems.includes(item.id) && (
                          <span className="mt-1 font-bold text-destructive">
                            Sin Stock
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {item.hasDiscount ||
                        (item.originalPrice &&
                          item.originalPrice > Number(item.price)) ? (
                          <>
                            <Currency className="text-lg" value={item.price} />
                            <Currency
                              className="text-sm text-gray-500 line-through"
                              value={item.originalPrice}
                            />
                          </>
                        ) : (
                          <Currency className="text-lg" value={item.price} />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Separator className="my-6" />
            <div className="flex w-full flex-col gap-y-4">
              <div className="flex flex-1 items-center justify-between">
                <span className="text-lg">Subtotal</span>
                <Currency className="text-lg" value={subtotal} />
              </div>
              {productSavings > 0 ? (
                <div className="flex flex-1 items-center justify-between">
                  <span className="font-quicksand text-lg font-semibold text-gray-600">
                    Ahorros en ofertas
                  </span>
                  <Currency
                    className="font-quicksand text-lg font-bold text-success"
                    value={productSavings}
                  />
                </div>
              ) : null}
              {couponDiscount > 0 ? (
                <div className="flex flex-1 items-center justify-between">
                  <div className="ml-2 text-lg text-destructive">
                    Descuento{" "}
                    {couponState.coupon?.type === "PERCENTAGE" && (
                      <span className="text-destructive">
                        ({couponState.coupon.amount}%)
                      </span>
                    )}
                  </div>
                  <Currency
                    className="ml-2 text-lg text-destructive"
                    value={couponDiscount}
                  />
                </div>
              ) : null}
              {(shippingCost ?? 0) > 0 ? (
                <div className="flex flex-1 items-center justify-between">
                  <span className="text-lg">Envío</span>
                  <Currency className="text-lg" value={shippingCost} />
                </div>
              ) : null}
              <Separator />
              <div className="flex flex-1 items-center justify-between">
                <span className="text-xl font-black text-pink-froly">
                  Total a pagar
                </span>
                <Currency
                  className="text-xl font-black text-pink-froly"
                  value={total}
                />
              </div>
            </div>
          </div>
        </div>
      )}
      {payUformData ? (
        <PayUForm
          formRef={payUFormRef}
          referenceCode={payUformData.referenceCode}
          products={activeItems.map((product) => ({
            name: product.name,
            quantity: product.quantity || 1,
          }))}
          amount={payUformData.amount}
          tax={payUformData.tax}
          taxReturnBase={payUformData.taxReturnBase}
          currency={payUformData.currency}
          signature={payUformData.signature}
          test={payUformData.test}
          responseUrl={payUformData.responseUrl}
          confirmationUrl={payUformData.confirmationUrl}
          shippingAddress={payUformData.shippingAddress}
          shippingCity={payUformData.shippingCity}
          shippingCountry={payUformData.shippingCountry}
        />
      ) : null}
    </>
  );
};

const CheckoutFormSkeleton = () => (
  <div
    className="mt-4 space-y-8 lg:mt-12 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6 lg:space-y-0"
    aria-busy="true"
    aria-live="polite"
  >
    <span className="sr-only">Cargando formulario de compra</span>
    <div className="space-y-8 rounded-md border p-5 lg:col-span-8">
      <Skeleton className="h-8 w-3/5" />
      <div className="space-y-5">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
      <div className="flex justify-between pt-6">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-28" />
      </div>
    </div>
    <div className="space-y-6 rounded-md border p-5 lg:col-span-4">
      <Skeleton className="h-7 w-40" />
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="flex gap-3">
          <Skeleton className="h-20 w-20 shrink-0" />
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
