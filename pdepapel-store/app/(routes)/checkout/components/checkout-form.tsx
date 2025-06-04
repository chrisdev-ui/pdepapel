"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Icons } from "@/components/icons";
import { PayUForm } from "@/components/payu-form";
import { Button } from "@/components/ui/button";
import { CldImage } from "@/components/ui/CldImage";
import { Currency } from "@/components/ui/currency";
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
import { NoResults } from "@/components/ui/no-results";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { KAWAII_FACE_SAD, PaymentMethod } from "@/constants";
import { useCart } from "@/hooks/use-cart";
import useCheckout from "@/hooks/use-checkout";
import { useGuestUser } from "@/hooks/use-guest-user";
import { useToast } from "@/hooks/use-toast";
import useValidateCoupon from "@/hooks/use-validate-coupon";
import { calculateTotals, cn, generateGuestId } from "@/lib/utils";
import {
  CheckoutByOrderResponse,
  Coupon,
  Order,
  PayUFormState,
  WompiResponse,
} from "@/types";
import { useAuth } from "@clerk/nextjs";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CreditCard, Info, Loader2, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { InfoCountryTooltip } from "./info-country-tooltip";

type CheckoutFormUser = {
  firstName?: string | null;
  lastName?: string | null;
  telephone?: string | null;
};

const formSchema = z.object({
  firstName: z.string().min(1, "Por favor, escribe tu nombre").max(20),
  lastName: z.string().min(1, "Por favor, escribe tu apellido").max(20),
  email: z.string().email("Por favor, escribe un correo válido").optional(),
  telephone: z.string().min(10, "Por favor, escribe tu teléfono").max(14),
  address1: z.string().min(1, "Por favor, escribe tu dirección").max(50),
  address2: z.string().max(50).optional(),
  city: z.string().min(1, "Por favor, escribe tu ciudad").max(50),
  state: z.string().min(1, "Por favor, escribe tu departamento").max(30),
  documentId: z.string().optional(),
  couponCode: z.string().optional(),
});

type CheckoutFormValue = z.infer<typeof formSchema>;

interface CheckoutFormProps {
  currentUser?: CheckoutFormUser | null;
}

interface CouponState {
  coupon: Coupon | null;
  isValid: boolean | null;
}

export const CheckoutForm: React.FC<CheckoutFormProps> = ({ currentUser }) => {
  const { userId } = useAuth();
  const router = useRouter();
  const payUFormRef = useRef<HTMLFormElement>(null);
  const [payUformData, setPayUformData] = useState<PayUFormState>();
  const { guestId, setGuestId, clearGuestId } = useGuestUser();
  const cart = useCart();
  const [isMounted, setIsMounted] = useState(false);
  const { toast } = useToast();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    PaymentMethod.BankTransfer,
  );

  const [couponState, setCouponState] = useState<CouponState>({
    coupon: null,
    isValid: null,
  });

  const form = useForm<CheckoutFormValue>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: currentUser?.firstName ?? "",
      lastName: currentUser?.lastName ?? "",
      telephone: currentUser?.telephone ?? "",
      documentId: "",
      address1: "",
      address2: "",
      city: "",
      state: "",
      couponCode: "",
    },
  });

  const { total, subtotal, couponDiscount } = useMemo(
    () => calculateTotals(cart.items, couponState.coupon),
    [cart.items, couponState.coupon],
  );

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
      if ((data as Order).id !== undefined) {
        const order = data as Order;
        toast({
          title: "Orden creada",
          description: `Tu orden #${order.id} ha sido creada exitosamente`,
          variant: "success",
        });
        router.push(`/order/${order.id}`);
        cart.removeAll();
        form.reset();
        if (userId) clearGuestId();
      } else if (
        (data as CheckoutByOrderResponse as WompiResponse).url !== undefined
      ) {
        const { url } = data as CheckoutByOrderResponse as WompiResponse;
        window.location.href = url;
      } else if (
        (data as CheckoutByOrderResponse as PayUFormState).referenceCode !==
        undefined
      ) {
        const payUData = data as CheckoutByOrderResponse as PayUFormState;
        setPayUformData(payUData);
      }
    },
  });

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

  const onSubmit = (data: CheckoutFormValue) => {
    const orderItems = cart.items.map((item) => ({
      productId: item.id,
      quantity: item.quantity,
    }));
    const {
      firstName,
      lastName,
      telephone,
      address1,
      address2,
      city,
      state,
      email,
      documentId,
    } = data;
    const isUserLoggedIn = Boolean(userId);
    let guestUserId = guestId;
    if (!isUserLoggedIn && !guestUserId) {
      guestUserId = generateGuestId();
      setGuestId(guestUserId);
    }
    const formattedData = {
      fullName: `${firstName} ${lastName}`,
      phone: telephone,
      email,
      address: [address1, address2, city, state]
        .filter((a) => a !== null)
        .join(", "),
      userId: isUserLoggedIn ? userId : null,
      guestId: isUserLoggedIn ? null : guestUserId,
      documentId,
      orderItems,
      payment: {
        method: paymentMethod,
      },
      couponCode: couponState.coupon?.code ?? null,
      subtotal,
      total,
    };

    mutate(formattedData);
  };

  return (
    <>
      <Form {...form}>
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
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="mt-4 space-y-8 lg:mt-12 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6 lg:space-y-0"
          >
            <div className="rounded-md border p-5 lg:col-span-8">
              <h2 className="font-serif text-lg font-bold">
                Información para tu envío
              </h2>
              <Separator className="my-6" />
              <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre</FormLabel>
                      <FormControl>
                        <Input
                          className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                          disabled={status === "pending"}
                          placeholder="Nombres"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Apellidos</FormLabel>
                      <FormControl>
                        <Input
                          className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                          disabled={status === "pending"}
                          placeholder="Apellidos"
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
                          className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                          disabled={status === "pending"}
                          placeholder="CC, DNI, Pasaporte, etc."
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>Este campo es opcional</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Correo electrónico</FormLabel>
                      <FormControl>
                        <Input
                          className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                          disabled={status === "pending"}
                          placeholder="ejemplo@correo.com"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>Este campo es opcional</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="telephone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teléfono</FormLabel>
                      <FormControl>
                        <Input
                          className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                          disabled={status === "pending"}
                          placeholder="3132582293"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address1"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dirección</FormLabel>
                      <FormControl>
                        <Input
                          className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                          disabled={status === "pending"}
                          placeholder="Calle 1 # 2 - 3"
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
                      <FormLabel>Dirección detallada</FormLabel>
                      <FormControl>
                        <Input
                          className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                          disabled={status === "pending"}
                          placeholder="Edificio, Apto, Casa, Lote, Barrio, etc."
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>Este campo es opcional</FormDescription>
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
                          className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                          disabled={status === "pending"}
                          placeholder="ex: Medellín"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Departamento</FormLabel>
                      <FormControl>
                        <Input
                          className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                          disabled={status === "pending"}
                          placeholder="ex: Antioquia"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex flex-col space-y-4">
                  <div className="flex items-center gap-2">
                    <FormLabel>País</FormLabel>
                    <InfoCountryTooltip />
                  </div>
                  <div className="flex items-center gap-3">
                    <Icons.flags.colombia className="h-6 w-6" />
                    <span className="text-sm font-medium text-gray-700">
                      Colombia
                    </span>
                  </div>
                </div>
              </div>
              <div className="mx-auto my-4 w-full max-w-md space-y-4">
                <FormField
                  control={form.control}
                  name="couponCode"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="flex items-center gap-2 text-base font-semibold">
                        Redime un cupón de descuento
                      </FormLabel>
                      <div
                        className={cn(
                          "group relative flex items-center gap-x-2 rounded-lg shadow-[0_2px_10px_rgba(0,0,0,0.06)] transition-all duration-300 hover:shadow-[0_2px_10px_rgba(0,0,0,0.1)]",
                          {
                            "shadow-success/40": couponState.isValid === true,
                            "shadow-destructive/40":
                              couponState.isValid === false,
                          },
                        )}
                      >
                        <Tag className="absolute left-3 top-3 h-6 w-6 text-pink-froly" />
                        <FormControl>
                          <Input
                            className={cn(
                              "h-12 px-4 pl-12 text-lg transition-colors duration-200 focus-visible:outline-none focus-visible:ring-0",
                              {
                                "border-success focus:border-success focus:ring-success/20":
                                  couponState.isValid === true,
                                "border-destructive focus:border-destructive focus:ring-destructive/20":
                                  couponState.isValid === false,
                              },
                            )}
                            disabled={
                              status === "pending" ||
                              validateCouponStatus === "pending"
                            }
                            placeholder="Escribe tu código de cupón"
                            maxLength={15}
                            {...field}
                            autoComplete="off"
                            autoCorrect="off"
                            onChange={(e) => {
                              setCouponState((prev) => ({
                                ...prev,
                                isValid: null,
                              }));
                              field.onChange(e.target.value.toUpperCase());
                            }}
                          />
                        </FormControl>
                        <div className="absolute right-2 top-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={
                              validateCouponStatus === "pending" || !field.value
                            }
                            className={cn(
                              "h-8 px-3 font-medium transition-all duration-200 hover:bg-blue-purple/20",
                              {
                                "text-success hover:bg-success/50 hover:text-success/80":
                                  couponState.isValid === true,
                                "text-destructive hover:bg-destructive/50 hover:text-destructive/80":
                                  couponState.isValid === false,
                                "text-lg": field.value,
                              },
                            )}
                            onClick={() => {
                              if (!field.value) return;

                              if (couponState.isValid && couponState.coupon) {
                                form.resetField("couponCode");
                                setCouponState((prev) => ({
                                  ...prev,
                                  coupon: null,
                                  isValid: false,
                                }));
                                return;
                              }

                              validateCouponMutate({
                                code: field.value.toUpperCase(),
                                subtotal,
                              });
                            }}
                          >
                            {validateCouponStatus === "pending" ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : couponState.coupon ? (
                              "Remover"
                            ) : (
                              "Validar"
                            )}
                          </Button>
                        </div>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {paymentMethod === PaymentMethod.BankTransfer && (
                <>
                  <h2 className="mt-10 font-serif text-lg font-bold">
                    Pagos por transferencia bancaria
                  </h2>
                  <Separator className="my-6" />
                  <div className="w-full">
                    <ol className="flex flex-wrap">
                      <li className="flex flex-1 flex-col text-center before:relative before:z-[1] before:mx-auto before:mb-4 before:mt-0 before:block before:h-12 before:w-12 before:rounded-full before:bg-blue-purple before:content-[''] after:relative after:left-[calc(50%_+_calc(var(--circle-size)_/_2_+_var(--spacing)))] after:top-[calc(var(--circle-size)_/_2)] after:-order-1 after:h-0.5 after:w-[calc(100%_-_var(--circle-size)_-_calc(var(--spacing)_*_2))] after:bg-blue-purple/50 after:content-['']">
                        <h3 className="mb-2 text-base font-bold md:text-[4w]">
                          Paso 1
                        </h3>
                        <p className="md:2vw mx-auto max-w-xs pl-[var(--spacing)] text-xs">
                          Verifica el valor a transferir al{" "}
                          <strong>finalizar</strong> tu orden
                        </p>
                      </li>
                      <li className="flex flex-1 flex-col text-center before:relative before:z-[1] before:mx-auto before:mb-4 before:mt-0 before:block before:h-12 before:w-12 before:rounded-full before:bg-blue-purple before:content-[''] after:relative after:left-[calc(50%_+_calc(var(--circle-size)_/_2_+_var(--spacing)))] after:top-[calc(var(--circle-size)_/_2)] after:-order-1 after:h-0.5 after:w-[calc(100%_-_var(--circle-size)_-_calc(var(--spacing)_*_2))] after:bg-blue-purple/50 after:content-['']">
                        <h3 className="mb-2 text-base font-bold md:text-[4w]">
                          Paso 2
                        </h3>
                        <p className="md:2vw mx-auto max-w-xs pl-[var(--spacing)] text-xs">
                          Realiza una transferencia bancaria a la siguiente{" "}
                          <strong>Cuenta de Ahorros Bancolombia</strong>
                          <Icons.payments.bancolombia className="mx-1 inline-flex h-3 w-3" />
                          <strong>236-000036-64</strong>
                        </p>
                      </li>
                      <li className="flex flex-1 flex-col text-center before:relative before:z-[1] before:mx-auto before:mb-4 before:mt-0 before:block before:h-12 before:w-12 before:rounded-full before:bg-blue-purple before:content-['']">
                        <h3 className="mb-2 text-base font-bold md:text-[4w]">
                          Paso 3
                        </h3>
                        <p className="md:2vw mx-auto max-w-xs pl-[var(--spacing)] text-xs">
                          Envíanos una imagen de la transferencia al siguiente
                          número
                          <Icons.whatsapp className="mx-1 inline-flex h-3 w-3 text-green-600" />
                          <strong>313-258-2293</strong>
                        </p>
                      </li>
                    </ol>
                  </div>
                </>
              )}
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
              <span className="text-xxs text-green-500">
                Los productos demoran entre 1 - 4 días hábiles en llegar a
                destino.
              </span>
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
              <Separator className="my-6" />
              <div className="mb-5 flex w-full items-center">
                <h2 className="font-serif text-lg font-bold">Método de pago</h2>
              </div>
              <RadioGroup
                defaultValue={PaymentMethod.BankTransfer}
                value={paymentMethod}
                disabled={cart.items.length === 0 || status === "pending"}
                onValueChange={(value) =>
                  setPaymentMethod(value as PaymentMethod)
                }
                className="flex flex-col gap-2"
              >
                <div>
                  <RadioGroupItem
                    value={PaymentMethod.BankTransfer}
                    id={PaymentMethod.BankTransfer}
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor={PaymentMethod.BankTransfer}
                    className="flex cursor-pointer items-center justify-start gap-4 rounded-md border border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-pink-shell peer-data-[state=checked]:bg-pink-shell/20 [&:has([data-state=checked])]:border-pink-shell [&:has([data-state=checked])]:bg-pink-shell/20"
                  >
                    <Icons.payments.transfer className="h-6 w-6" />
                    Transferencia bancaria a Bancolombia
                  </Label>
                </div>
                <div>
                  <RadioGroupItem
                    value={PaymentMethod.PayU}
                    id={PaymentMethod.PayU}
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor={PaymentMethod.PayU}
                    className="relative flex cursor-pointer items-center justify-start gap-4 rounded-md border border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-pink-shell peer-data-[state=checked]:bg-pink-shell/20 [&:has([data-state=checked])]:border-pink-shell [&:has([data-state=checked])]:bg-pink-shell/20"
                  >
                    <Icons.payments.payu className="h-6" />
                    Paga a través de PayU
                  </Label>
                </div>
                {/* <div>
                  <RadioGroupItem
                    value={PaymentMethod.COD}
                    id={PaymentMethod.COD}
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor={PaymentMethod.COD}
                    className="flex cursor-pointer items-center justify-start gap-4 rounded-md border border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-pink-shell peer-data-[state=checked]:bg-pink-shell/20 [&:has([data-state=checked])]:border-pink-shell [&:has([data-state=checked])]:bg-pink-shell/20"
                  >
                    <Icons.payments.cashOnDelivery className="h-6 w-6" />
                    Pago contraentrega
                  </Label>
                </div> */}
                <div>
                  <RadioGroupItem
                    value={PaymentMethod.Wompi}
                    id={PaymentMethod.Wompi}
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor={PaymentMethod.Wompi}
                    className="relative flex cursor-pointer items-center justify-start gap-4 rounded-md border border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-pink-shell peer-data-[state=checked]:bg-pink-shell/20 [&:has([data-state=checked])]:border-pink-shell [&:has([data-state=checked])]:bg-pink-shell/20"
                  >
                    <Icons.payments.wompi className="h-6" fill="#2C2A29" />
                    Paga a través de Wompi
                  </Label>
                </div>
              </RadioGroup>
              <Button
                type="submit"
                disabled={cart.items.length === 0 || status === "pending"}
                className="group relative mt-6 w-full overflow-hidden rounded-full bg-blue-yankees font-serif text-base font-bold uppercase text-white hover:bg-blue-yankees"
              >
                <CreditCard className="absolute left-0 h-5 w-5 -translate-x-full transform transition-transform duration-500 ease-out group-hover:translate-x-52" />
                <span className="transition-opacity duration-150 group-hover:opacity-0">
                  {`${
                    status === "pending" ? "Finalizando" : "Finalizar"
                  } compra`}
                </span>
                {status === "pending" && (
                  <Loader2 className="ml-3 h-5 w-5 animate-spin" />
                )}
              </Button>
              <div className="mt-5">
                <small className="text-xxs">
                  <Info className="inline-flex h-4 w-4 text-success" /> ¡Hola!
                  Solo queremos recordarte que el costo de envío no está
                  incluido en este total. El costo exacto de envío se calculará
                  y te será informado al finalizar tu compra, justo después de
                  confirmar el pago de tu pedido. ¡Estamos aquí para ayudarte
                  con cualquier duda que tengas!
                </small>
              </div>
            </div>
          </form>
        )}
      </Form>
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
