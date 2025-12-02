"use client";

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
import { KAWAII_FACE_SAD, PaymentMethod } from "@/constants";
import { useCart } from "@/hooks/use-cart";
import useCheckout from "@/hooks/use-checkout";
import { useCheckoutStore } from "@/hooks/use-checkout-store";
import { useConfetti } from "@/hooks/use-confetti";
import { useDebounce } from "@/hooks/use-debounce";
import { useGuestUser } from "@/hooks/use-guest-user";
import { useToast } from "@/hooks/use-toast";
import useValidateCoupon from "@/hooks/use-validate-coupon";
import { calculateTotals, generateGuestId } from "@/lib/utils";
import {
  CheckoutByOrderResponse,
  Coupon,
  Order,
  PayUFormState,
  WompiResponse,
} from "@/types";
import { useAuth } from "@clerk/nextjs";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  formatPhoneNumber,
  isValidPhoneNumber,
} from "react-phone-number-input";
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

const formSchema = z.object({
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
    .min(8, "La dirección debe tener al menos 8 caracteres")
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
    .max(25, "La referencia de tu domicilio debe tener menos de 25 caracteres")
    .optional()
    .or(z.literal("")),
  company: z
    .string()
    .min(2, "El nombre de tu empresa debe tener al menos 2 caracteres")
    .max(50, "El nombre de tu empresa debe tener menos de 50 caracteres")
    .optional()
    .or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  department: z.string().optional().or(z.literal("")),
  daneCode: z
    .string()
    .length(8, "El código DANE debe tener exactamente 8 caracteres")
    .optional()
    .or(z.literal("")),
  documentId: z.string().optional().or(z.literal("")),
  couponCode: z.string().optional().or(z.literal("")),
  paymentMethod: z
    .nativeEnum(PaymentMethod)
    .default(PaymentMethod.BankTransfer),
  shippingProvider: z.literal("ENVIOCLICK"),
  envioClickIdRate: z.number({
    required_error: "Escoge una tarifa para el envío",
    invalid_type_error: "La tarifa debe ser un número",
  }),
  shipping: shippingSchema,
});

export type CheckoutFormValue = z.infer<typeof formSchema>;

interface CheckoutFormProps {
  currentUser?: CheckoutFormUser | null;
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
}) => {
  const { userId } = useAuth();
  const router = useRouter();
  const payUFormRef = useRef<HTMLFormElement>(null);
  const [payUformData, setPayUformData] = useState<PayUFormState>();
  const [hasSubmittedPayU, setHasSubmittedPayU] = useState(false);
  const { guestId, setGuestId, clearGuestId } = useGuestUser();
  const cart = useCart();
  const [isMounted, setIsMounted] = useState(false);
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
    setStoredCouponState(couponState);
  }, [couponState, setStoredCouponState]);

  const form = useForm<CheckoutFormValue>({
    resolver: zodResolver(formSchema),
    defaultValues: async () => {
      const storedFormData = useCheckoutStore.getState().formData;
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
        couponCode: storedFormData.couponCode ?? "",
        shippingProvider: "ENVIOCLICK",
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

  useEffect(() => {
    setStoredFormData(debouncedFormData as Partial<CheckoutFormValue>);
  }, [debouncedFormData, setStoredFormData]);

  useEffect(() => {
    if (payUformData && payUFormRef.current && !hasSubmittedPayU) {
      setHasSubmittedPayU(true);
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        payUFormRef.current?.submit();
      }, 100);
    }
  }, [payUformData, hasSubmittedPayU]);

  const shippingCost = form.watch("shipping.cost");

  const { total, subtotal, couponDiscount } = useMemo(
    () => calculateTotals(cart.items, couponState.coupon, shippingCost),
    [cart.items, couponState.coupon, shippingCost],
  );

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

  const { mutate, status } = useCheckout({
    onError(err) {
      console.error(err);
      toast({
        title: "Error",
        description:
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
        window.location.href = url;
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
        router.push(`/order/${order.id}`);
        cart.removeAll();
        form.reset();
        resetCheckout();
        if (userId) clearGuestId();
      }
    },
  });

  const isPendingSubmit = useMemo(() => status === "pending", [status]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  const totalQuantity = cart.items.reduce(
    (total, item) => total + Number(item.quantity ?? 1),
    0,
  );

  const onSubmit = (data: CheckoutFormValue): void => {
    const orderItems = cart.items.map((item) => ({
      productId: item.id,
      quantity: item.quantity,
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
      paymentMethod,
      shipping,
      shippingProvider,
      envioClickIdRate,
    } = data;
    const isUserLoggedIn = Boolean(userId);
    let guestUserId = guestId;
    if (!isUserLoggedIn && !guestUserId) {
      guestUserId = generateGuestId();
      setGuestId(guestUserId);
    }
    const formattedData = {
      fullName: `${firstName} ${lastName}`,
      phone: formatPhoneNumber(telephone),
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
      envioClickIdRate,
      payment: {
        method: paymentMethod,
      },
      shipping,
      couponCode: couponState.coupon?.code ?? null,
      subtotal,
      total,
    };

    mutate(formattedData);
  };

  return (
    <>
      {cart.items.length === 0 && (
        <div className="my-12">
          <NoResults
            message={`No hay productos en el carrito ${KAWAII_FACE_SAD}`}
          />
          <Link href="/shop">
            <Button className="mt-4">
              {" "}
              <ArrowLeft className="mr-2 h-5 w-5" /> Regresar a la tienda
            </Button>
          </Link>
        </div>
      )}
      {cart.items.length > 0 && (
        <div className="mt-4 space-y-8 lg:mt-12 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6 lg:space-y-0">
          <div className="rounded-md border p-5 lg:col-span-8">
            <MultiStepForm steps={FORM_STEPS} currentStep={currentStep}>
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
                        cartItems={cart.items.map((item) => ({
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
              <Link href="/cart" className="text-sm underline">
                Editar
              </Link>
            </div>
            <Separator className="mt-6" />
            <div className="mt-6 flex w-full flex-col gap-4">
              {cart.items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[80px_1fr] gap-2.5"
                >
                  <Link
                    href={`/product/${item.id}`}
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
                  <div className="flex max-h-20 items-center justify-between">
                    <div className="flex h-full flex-col items-start justify-between">
                      <div className="flex flex-col text-left font-serif text-sm font-medium tracking-tight">
                        <span>{item.name}</span>
                        <span className="text-xs text-gray-400">{`Diseño: ${item.design.name}`}</span>
                        <span className="hidden text-xs text-gray-400 lg:block">{`Categoría: ${item.category.name}`}</span>
                      </div>
                      <Currency className="text-lg" value={item.price} />
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
              {couponDiscount > 0 && (
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
              )}
              {(shippingCost ?? 0) > 0 && (
                <div className="flex flex-1 items-center justify-between">
                  <span className="text-lg">Envío</span>
                  <Currency className="text-lg" value={shippingCost} />
                </div>
              )}
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
          products={cart.items.map((product) => ({
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
