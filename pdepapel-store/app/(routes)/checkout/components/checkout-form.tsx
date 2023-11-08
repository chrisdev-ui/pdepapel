"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
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
import { KAWAII_FACE_SAD } from "@/constants";
import { useCart } from "@/hooks/use-cart";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { ArrowLeft, CreditCard } from "lucide-react";
import { BancolombiaButton } from "./bancolombia-button";
import { InfoCountryTooltip } from "./info-country-tooltip";

enum PaymentMethod {
  COD = "COD",
  Stripe = "Stripe",
  BankTransfer = "BankTransfer",
  Bancolombia = "Bancolombia",
}

type CheckoutFormUser = {
  id?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  telephone?: string | null;
};

const formSchema = z.object({
  firstName: z.string().min(1, "Por favor, escribe tu nombre").max(20),
  lastName: z.string().min(1, "Por favor, escribe tu apellido").max(20),
  telephone: z.string().min(10, "Por favor, escribe tu teléfono").max(14),
  address1: z.string().min(1, "Por favor, escribe tu dirección").max(50),
  address2: z.string().max(50).optional(),
  city: z.string().min(1, "Por favor, escribe tu ciudad").max(50),
  state: z.string().min(1, "Por favor, escribe tu departamento").max(30),
});

type CheckoutFormValue = z.infer<typeof formSchema>;

interface CheckoutFormProps {
  currentUser?: CheckoutFormUser | null;
}

export const CheckoutForm: React.FC<CheckoutFormProps> = ({ currentUser }) => {
  const cart = useCart();
  const [isMounted, setIsMounted] = useState(false);
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    PaymentMethod.BankTransfer,
  );
  const form = useForm<CheckoutFormValue>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: currentUser?.firstName ?? "",
      lastName: currentUser?.lastName ?? "",
      telephone: currentUser?.telephone ?? "",
      address1: "",
      address2: "",
      city: "",
      state: "",
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

  const totalPrice = cart.items.reduce(
    (total, item) =>
      total + Number(item.price ?? 0) * Number(item.quantity ?? 1),
    0,
  );

  const onSubmit = async (data: CheckoutFormValue) => {
    const userId = currentUser?.id ?? null;
    const orderItems = cart.items.map((item) => ({
      productId: item.id,
      quantity: item.quantity,
    }));
    const { firstName, lastName, telephone, address1, address2, city, state } =
      data;
    const formattedData = {
      fullName: `${firstName} ${lastName}`,
      phone: telephone,
      address: [address1, address2, city, state]
        .filter((a) => a !== null)
        .join(", "),
      userId,
      orderItems,
    };
    try {
      setIsLoading(true);
      if (
        paymentMethod === PaymentMethod.BankTransfer ||
        paymentMethod === PaymentMethod.COD
      ) {
        const order = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/orders`,
          formattedData,
        );
        toast({
          title: "Orden creada",
          description: `Tu orden #${order.data.id} ha sido creada exitosamente`,
          variant: "success",
        });
        cart.removeAll();
      } else if (paymentMethod === PaymentMethod.Stripe) {
        const response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/checkout/stripe`,
          {
            items: orderItems,
          },
        );
        window.location = response.data.url;
      } else if (paymentMethod === PaymentMethod.Bancolombia) {
        toast({
          description: `Aún estamos trabajando en la implementación de este método de pago, por favor utiliza otro.`,
          variant: "info",
        });
      }
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Ha ocurrido un error creando tu orden",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
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
                        className="bg-green-leaf/20 invalid:bg-pink-froly/20"
                        disabled={isLoading}
                        placeholder="Maria"
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
                    <FormLabel>Apellido</FormLabel>
                    <FormControl>
                      <Input
                        className="bg-green-leaf/20 invalid:bg-pink-froly/20"
                        disabled={isLoading}
                        placeholder="Dolores"
                        {...field}
                      />
                    </FormControl>
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
                        className="bg-green-leaf/20 invalid:bg-pink-froly/20"
                        disabled={isLoading}
                        placeholder="3XXXXXXXXX"
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
                        className="bg-green-leaf/20 invalid:bg-pink-froly/20"
                        disabled={isLoading}
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
                    <FormLabel>Dirección 2</FormLabel>
                    <FormControl>
                      <Input
                        className="bg-green-leaf/20 invalid:bg-pink-froly/20"
                        disabled={isLoading}
                        placeholder="Edificio, Apto, Casa, Lote, etc. (Opcional)"
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
                        className="bg-green-leaf/20 invalid:bg-pink-froly/20"
                        disabled={isLoading}
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
                        className="bg-green-leaf/20 invalid:bg-pink-froly/20"
                        disabled={isLoading}
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
            {paymentMethod === PaymentMethod.BankTransfer && (
              <>
                <h2 className="mt-10 font-serif text-lg font-bold">
                  Pagos por transferencia bancaria
                </h2>
                <Separator className="my-6" />
                <div className="w-full">
                  <ol className="flex flex-wrap">
                    <li className="flex flex-1 flex-col text-center before:relative before:z-[1] before:mx-auto before:mb-4 before:mt-0 before:block before:h-12 before:w-12 before:rounded-full before:bg-green-leaf before:content-[''] after:relative after:left-[calc(50%_+_calc(var(--circle-size)_/_2_+_var(--spacing)))] after:top-[calc(var(--circle-size)_/_2)] after:-order-1 after:h-0.5 after:w-[calc(100%_-_var(--circle-size)_-_calc(var(--spacing)_*_2))] after:bg-green-leaf/50 after:content-['']">
                      <h3 className="mb-2 text-base font-bold md:text-[4w]">
                        Paso 1
                      </h3>
                      <p className="md:2vw mx-auto max-w-xs pl-[var(--spacing)] text-xs">
                        Verifica el valor a transferir al{" "}
                        <strong>finalizar</strong> tu orden
                      </p>
                    </li>
                    <li className="flex flex-1 flex-col text-center before:relative before:z-[1] before:mx-auto before:mb-4 before:mt-0 before:block before:h-12 before:w-12 before:rounded-full before:bg-green-leaf before:content-[''] after:relative after:left-[calc(50%_+_calc(var(--circle-size)_/_2_+_var(--spacing)))] after:top-[calc(var(--circle-size)_/_2)] after:-order-1 after:h-0.5 after:w-[calc(100%_-_var(--circle-size)_-_calc(var(--spacing)_*_2))] after:bg-green-leaf/50 after:content-['']">
                      <h3 className="mb-2 text-base font-bold md:text-[4w]">
                        Paso 2
                      </h3>
                      <p className="md:2vw mx-auto max-w-xs pl-[var(--spacing)] text-xs">
                        Realiza una transferencia bancaria a la siguiente{" "}
                        <strong>Cuenta de Ahorros Bancolombia</strong>
                        <Icons.payments.bancolombiaButton className="mx-1 inline-flex h-3 w-3" />
                        <strong>236-000036-64</strong>
                      </p>
                    </li>
                    <li className="flex flex-1 flex-col text-center before:relative before:z-[1] before:mx-auto before:mb-4 before:mt-0 before:block before:h-12 before:w-12 before:rounded-full before:bg-green-leaf before:content-['']">
                      <h3 className="mb-2 text-base font-bold md:text-[4w]">
                        Paso 3
                      </h3>
                      <p className="md:2vw mx-auto max-w-xs pl-[var(--spacing)] text-xs">
                        Envíanos una imagen de la transferencia al siguiente
                        número
                        <Icons.whatsapp className="mx-1 inline-flex h-3 w-3 text-green-600" />
                        <strong>321-629-9845</strong>
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
                    <Image
                      src={item.images[0].url}
                      alt={item.id}
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
            <div className="flex w-full items-center justify-between text-xl">
              <span>Total a pagar</span>
              <Currency className="text-xl" value={totalPrice} />
            </div>
            <Separator className="my-6" />
            <RadioGroup
              defaultValue={PaymentMethod.BankTransfer}
              value={paymentMethod}
              disabled={cart.items.length === 0}
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
                  value={PaymentMethod.Stripe}
                  id={PaymentMethod.Stripe}
                  className="peer sr-only"
                />
                <Label
                  htmlFor={PaymentMethod.Stripe}
                  className="flex cursor-pointer items-center justify-start gap-4 rounded-md border border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-pink-shell peer-data-[state=checked]:bg-pink-shell/20 [&:has([data-state=checked])]:border-pink-shell [&:has([data-state=checked])]:bg-pink-shell/20"
                >
                  <Icons.payments.stripe className="h-6 w-6" />
                  Tarjeta de crédito o débito
                </Label>
              </div>
              <div>
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
              </div>
              <div>
                <RadioGroupItem
                  value={PaymentMethod.Bancolombia}
                  id={PaymentMethod.Bancolombia}
                  className="peer sr-only"
                />
                <Label
                  htmlFor={PaymentMethod.Bancolombia}
                  className="flex cursor-pointer items-center justify-start gap-4 rounded-md border border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-pink-shell peer-data-[state=checked]:bg-pink-shell/20 [&:has([data-state=checked])]:border-pink-shell [&:has([data-state=checked])]:bg-pink-shell/20"
                >
                  <Icons.payments.bancolombiaButton className="h-6 w-6" />
                  Botón Bancolombia
                </Label>
              </div>
            </RadioGroup>
            {paymentMethod !== PaymentMethod.Bancolombia ? (
              <Button
                type="submit"
                disabled={cart.items.length === 0 || isLoading}
                className="group relative mt-6 w-full overflow-hidden rounded-full bg-blue-yankees font-serif text-base font-bold uppercase text-white hover:bg-blue-yankees"
              >
                <CreditCard className="absolute left-0 h-5 w-5 -translate-x-full transform transition-transform duration-500 ease-out group-hover:translate-x-52" />
                <span className="transition-opacity duration-150 group-hover:opacity-0">
                  Finalizar compra
                </span>
              </Button>
            ) : (
              <div className="mt-6 w-full">
                <BancolombiaButton
                  disabled={cart.items.length === 0 || isLoading}
                />
              </div>
            )}
          </div>
        </form>
      )}
    </Form>
  );
};
