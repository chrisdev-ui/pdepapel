"use client";

import { useAuth } from "@clerk/nextjs";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Clock,
  CreditCard,
  Hourglass,
  MapPin,
  Phone,
  Printer,
  Receipt,
  SearchCheck,
  ShieldAlert,
  ShieldCheck,
  ShieldClose,
  Truck,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Forbidden } from "@/components/forbidden";
import { Icons } from "@/components/icons";
import { PayUForm } from "@/components/payu-form";
import { CldImage } from "@/components/ui/CldImage";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Currency } from "@/components/ui/currency";
import {
  ADMIN_USER_IDS,
  OrderStatus,
  PaymentMethod,
  ShippingStatus,
  steps,
} from "@/constants";
import { useCart } from "@/hooks/use-cart";
import useCheckoutOrder from "@/hooks/use-checkout-order";
import { useGuestUser } from "@/hooks/use-guest-user";
import { useToast } from "@/hooks/use-toast";
import useTrackShipment from "@/hooks/use-track-shipment";
import { cn, formatPhoneNumber } from "@/lib/utils";
import {
  Order,
  PayUFormState,
  ShippingTrackingEvent,
  WompiResponse,
} from "@/types";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Courier } from "./courier";

interface SingleOrderPageProps {
  order: Order;
}

const STATUS: {
  [key in OrderStatus]: {
    text: string;
    icon: React.ReactNode;
  };
} = {
  [OrderStatus.CREATED]: {
    text: "Estamos listos para procesar su pedido tan pronto como recibamos su pago.",
    icon: <Hourglass className="h-8 w-8" />,
  },
  [OrderStatus.PENDING]: {
    text: "Su pago está siendo procesado con la mayor seguridad y eficiencia.",
    icon: <SearchCheck className="h-8 w-8" />,
  },
  [OrderStatus.PAID]: {
    text: "Gracias por su pago. ¡Esperamos que disfrute su compra!",
    icon: <Receipt className="h-8 w-8" />,
  },
  [OrderStatus.CANCELLED]: {
    text: "Lamentamos cualquier inconveniente. Estamos aquí para ayudar con cualquier pregunta o inquietud.",
    icon: <X className="h-8 w-8" />,
  },
};

const SingleOrderPage: React.FC<SingleOrderPageProps> = ({ order }) => {
  const searchParams = useSearchParams();
  const payUFormRef = useRef<HTMLFormElement>(null);
  const { userId } = useAuth();
  const { toast } = useToast();
  const guestId = useGuestUser((state) => state.guestId ?? "");
  const [payUformData, setPayUformData] = useState<PayUFormState>();
  const [trackingEvents, setTrackingEvents] = useState<ShippingTrackingEvent[]>(
    [],
  );
  const removeAll = useCart((state) => state.removeAll);

  const { mutate, status } = useCheckoutOrder({
    orderId: order.id,
    onError(err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Ha ocurrido un error creando tu orden, intenta de nuevo",
        variant: "destructive",
      });
    },
    onSuccess(data) {
      if (data && order.payment.method === PaymentMethod.PayU) {
        setPayUformData(data as PayUFormState);
      } else if (data && order.payment.method === PaymentMethod.Wompi) {
        const { url } = data as WompiResponse;
        window.location.href = url;
      }
    },
  });

  const { mutate: trackShipment, status: trackingStatus } = useTrackShipment({
    onError(err) {
      console.error(err);
      toast({
        title: "Error",
        description: "No se pudo obtener el rastreo del envío",
        variant: "destructive",
      });
    },
    onSuccess(data) {
      setTrackingEvents(data.events);
      toast({
        title: "Rastreo actualizado",
        description: "Se ha actualizado la información de rastreo",
        variant: "success",
      });
    },
  });

  useEffect(() => {
    if (
      searchParams.get("id") &&
      searchParams.get("id") === order?.payment?.transactionId &&
      order?.status === OrderStatus.PAID
    ) {
      toast({
        title: "¡Gracias por tu compra!",
        variant: "success",
        icon: <ShieldCheck className="h-8 w-8" />,
        description: "Tu pago ha sido recibido.",
        duration: 10000,
      });
      removeAll();
    }

    if (
      searchParams.get("id") &&
      searchParams.get("id") === order?.payment?.transactionId &&
      order?.status === OrderStatus.CANCELLED
    ) {
      toast({
        title: "¡Hubo un fallo en tu intento de pago!",
        variant: "destructive",
        icon: <ShieldClose className="h-14 w-14" />,
        description:
          "No se realizó ningún cargo a tu cuenta, intenta el pago de nuevo más tarde o utiliza otro método.",
        duration: 10000,
      });
      removeAll();
    }

    if (
      searchParams.get("id") &&
      searchParams.get("id") === order?.payment?.transactionId &&
      order?.status === OrderStatus.PENDING
    ) {
      toast({
        title: "Pago pendiente",
        variant: "warning",
        icon: <ShieldAlert className="h-14 w-14" />,
        description:
          "¡Casi listo! Estamos confirmando tu pago. Te mantendremos informado y te avisaremos en cuanto tengamos todo confirmado.",
        duration: 10000,
      });
      removeAll();
    }
  }, [order, removeAll, searchParams, toast]);

  useEffect(() => {
    const transactionState = Number(searchParams.get("transactionState"));
    const transactionId = searchParams.get("transactionId");

    if (
      transactionId &&
      transactionState &&
      transactionId === order?.payment?.transactionId
    ) {
      switch (transactionState) {
        case 4: {
          toast({
            title: "¡Gracias por tu compra!",
            variant: "success",
            icon: <ShieldCheck className="h-8 w-8" />,
            description: "Tu pago ha sido recibido.",
            duration: 10000,
          });
          removeAll();
          break;
        }

        case 104: {
          toast({
            title: "¡Hubo un fallo en tu intento de pago!",
            variant: "destructive",
            icon: <ShieldClose className="h-14 w-14" />,
            description:
              "No se realizó ningún cargo a tu cuenta, intenta el pago de nuevo más tarde o utiliza otro método.",
            duration: 10000,
          });
          removeAll();
          break;
        }

        case 6: {
          toast({
            title: "¡La transacción ha sido rechazada!",
            variant: "destructive",
            icon: <ShieldClose className="h-14 w-14" />,
            description:
              "No se realizó ningún cargo a tu cuenta, intenta el pago de nuevo más tarde o utiliza otro método.",
            duration: 10000,
          });
          removeAll();
          break;
        }

        case 7: {
          toast({
            title: "Pago pendiente",
            variant: "warning",
            icon: <ShieldAlert className="h-14 w-14" />,
            description:
              "¡Casi listo! Estamos confirmando tu pago. Te mantendremos informado y te avisaremos en cuanto tengamos todo confirmado.",
            duration: 10000,
          });
          removeAll();
          break;
        }

        default: {
          toast({
            title: "Respuesta desconocida",
            variant: "destructive",
            icon: <ShieldClose className="h-14 w-14" />,
            description:
              "Hemos recibido una respuesta desconocida de PayU. Por favor, contacta a nuestro equipo de soporte para más información.",
            duration: 10000,
          });
          break;
        }
      }
    }
  }, [order, removeAll, searchParams, toast]);

  const shippingStatus = useMemo(
    () =>
      steps.slice(
        0,
        Object.values(ShippingStatus).indexOf(
          (order?.shipping?.status as ShippingStatus) ??
            ShippingStatus.Preparing,
        ) + 1,
      ),
    [order],
  );

  const getTrackingUrl = useCallback(() => {
    if (!order?.shipping?.trackingCode) return "#";
    return `https://www.envioclick.com/co/track/${order.shipping.trackingCode}`;
  }, [order?.shipping?.trackingCode]);

  const isAdmin = (user: string) => ADMIN_USER_IDS.includes(user);

  const hasAccess = userId
    ? userId === order?.userId || isAdmin(userId)
    : guestId === order?.guestId || isAdmin(guestId);

  return (
    <>
      {hasAccess && (
        <Container>
          <div className="mt-5 flex items-center justify-center gap-5">
            <div className="relative h-20 w-20">
              <Image
                src="/images/no-text-lightpink-bg.webp"
                alt="Logo Papelería P de Papel con fondo rosado"
                fill
                sizes="(max-width: 640px) 100vw, 640px"
                className="rounded-full object-cover"
                unoptimized
              />
            </div>
            <h1 className="font-serif text-3xl font-extrabold">
              ¡Muchas Gracias!
            </h1>
          </div>
          <div className="mt-8 inline-block text-center text-xl md:flex md:items-center md:justify-center md:text-2xl">
            Tu orden
            <strong className="mx-1 inline-block text-sm underline md:mx-2 md:block md:text-xl">{`#${order?.id}`}</strong>
            ha sido recibida.
          </div>
          <p className="my-8 px-10 text-center text-sm">
            Si creaste esta orden con tu usuario registrado en nuestra web,
            revisa tus órdenes en el botón de usuario arriba a la derecha y da
            click en <i>Administrar cuenta</i> &gt; <i>Mis órdenes</i> para ver
            los detalles de tu orden.
          </p>
          <div className="flex items-start justify-between text-sm md:items-center md:justify-evenly md:gap-1">
            <div className="flex gap-2">
              <Clock className="h-5 w-5" />
              <span>
                Hora de confirmación:{" "}
                {format(new Date(order.createdAt), "dd/MM/yyyy HH:mm")}
              </span>
            </div>
            <button className="flex gap-2">
              <Printer className="h-5 w-5" />
              <span className="underline">Imprimir</span>
            </button>
          </div>
          <div className="my-10 grid grid-flow-row grid-cols-1 gap-0 rounded-md border md:grid-cols-3">
            <div className="flex border-b p-7 md:border-b-0 md:border-r lg:p-14">
              <div className="flex flex-1 flex-col text-xs leading-5">
                <MapPin className="h-8 w-8" />
                <div className="mb-4 font-serif text-base">Dirección</div>
                <span className="font-medium">{order.fullName}</span>
                {order.company && (
                  <span className="text-muted-foreground">{order.company}</span>
                )}
                <span>{order.address}</span>
                {order.address2 && <span>{order.address2}</span>}
                {order.neighborhood && (
                  <span>Barrio: {order.neighborhood}</span>
                )}
                <span>
                  {order.city}, {order.department}
                </span>
                {order.addressReference && (
                  <span className="text-muted-foreground">
                    Ref: {order.addressReference}
                  </span>
                )}
                <span className="flex gap-1">
                  <Icons.flags.colombia className="h-4 w-4" /> Colombia
                </span>
                {order.phone && (
                  <span className="flex gap-1">
                    <Phone className="h-4 w-4" />
                    {`${formatPhoneNumber(`57${order.phone}`)}`}
                  </span>
                )}
              </div>
            </div>
            <div className="flex border-b p-7 md:border-b-0 md:border-r lg:p-14">
              <div className="flex w-full flex-col text-xs leading-5">
                <Truck className="h-8 w-8" />
                <div className="mb-4 font-serif text-base">
                  Estado del envío
                </div>
                <div className="flex flex-col space-y-3">
                  {/* Carrier Info */}
                  {order?.shipping?.carrierName && (
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">Transportadora:</span>
                      <div className="flex w-full flex-wrap items-center gap-2">
                        <Courier name={order.shipping.carrierName} />
                        {order.shipping.productName && (
                          <span className="text-xs text-muted-foreground">
                            {order.shipping.productName}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tracking Number */}
                  {order?.shipping?.trackingCode && (
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">No. Guía:</span>
                      <Link
                        href={
                          order.shipping.trackingUrl ||
                          order.shipping.guideUrl ||
                          getTrackingUrl()
                        }
                        className="text-primary hover:underline"
                        target="_blank"
                      >
                        {order.shipping.trackingCode}
                      </Link>
                    </div>
                  )}

                  {/* Delivery Estimate */}
                  {(order?.shipping?.deliveryDays ||
                    order?.shipping?.estimatedDeliveryDate) && (
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">Tiempo estimado:</span>
                      <span className="text-muted-foreground">
                        {order.shipping.estimatedDeliveryDate
                          ? format(
                              new Date(order.shipping.estimatedDeliveryDate),
                              "d 'de' MMMM, yyyy",
                              { locale: es },
                            )
                          : `${order.shipping.deliveryDays} días`}
                      </span>
                    </div>
                  )}

                  {/* Track Button */}
                  {order?.shipping?.envioClickIdOrder && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        trackShipment({
                          shippingId: order.shipping.id,
                          userId: userId || null,
                          guestId: guestId || null,
                        })
                      }
                      disabled={trackingStatus === "pending"}
                      className="mt-2 w-full"
                    >
                      {trackingStatus === "pending"
                        ? "Rastreando..."
                        : "Rastrear paquete"}
                    </Button>
                  )}

                  {/* Shipping Status Timeline */}
                  <div className="mt-4">
                    {shippingStatus.map((step, index) => (
                      <div
                        key={index}
                        className="flex h-[4.375rem] last:h-[2.5rem]"
                      >
                        <div className="relative mr-2">
                          <span className="block h-4 w-4 rounded-full bg-pink-shell" />
                          <span className="mx-auto my-0 block h-[4.375rem] w-0.5 bg-pink-shell" />
                        </div>
                        <div>
                          <p className="mb-1 mt-0 font-serif text-sm font-medium">
                            {step.value}
                          </p>
                          <span className="font-serif text-xs font-light">
                            {index === 0
                              ? format(
                                  new Date(order.createdAt),
                                  "d 'de' MMMM, yyyy",
                                  { locale: es },
                                )
                              : index === 1
                              ? format(
                                  new Date(order.shipping.createdAt),
                                  "d 'de' MMMM, yyyy",
                                  { locale: es },
                                )
                              : format(
                                  new Date(order.shipping.updatedAt),
                                  "d 'de' MMMM, yyyy",
                                  { locale: es },
                                )}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Tracking Events */}
                  {trackingEvents.length > 0 && (
                    <div className="mt-4 border-t pt-4">
                      <span className="mb-2 block text-sm font-medium">
                        Historial de rastreo:
                      </span>
                      <div className="max-h-64 space-y-3 overflow-y-auto">
                        {trackingEvents.map((event) => (
                          <div key={event.id} className="flex gap-2">
                            <div className="relative">
                              <span className="block h-3 w-3 rounded-full bg-primary" />
                            </div>
                            <div className="flex-1">
                              <p className="text-xs font-medium">
                                {event.description}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {event.location && `${event.location} - `}
                                {format(
                                  new Date(event.timestamp),
                                  "d MMM yyyy, HH:mm",
                                  { locale: es },
                                )}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex p-7 lg:p-14">
              <div className="flex w-full flex-col text-xs leading-5">
                <CreditCard className="h-8 w-8" />
                <div className="mb-4 font-serif text-base">Estado del pago</div>
                <div className="flex w-full flex-col gap-8">
                  <div
                    className={cn(
                      "flex flex-col items-center justify-center gap-2 rounded-md border border-l-8 p-5 text-sm opacity-100 transition-opacity duration-700 hover:opacity-80 lg:flex-row",
                      {
                        "border-info text-info":
                          order?.status === OrderStatus.CREATED,
                        "border-[#FFCC00] text-[#FFCC00]":
                          order?.status === OrderStatus.PENDING,
                        "border-success text-success":
                          order?.status === OrderStatus.PAID,
                        "border-destructive text-destructive":
                          order?.status === OrderStatus.CANCELLED,
                      },
                    )}
                  >
                    {STATUS[order?.status as OrderStatus].icon}
                    <span>{STATUS[order?.status as OrderStatus].text}</span>
                  </div>
                  {order.status !== OrderStatus.PAID &&
                    order?.payment?.method === PaymentMethod.Wompi && (
                      <Button
                        className="flex items-center justify-center gap-2 font-serif"
                        disabled={status === "pending"}
                        onClick={() => mutate()}
                      >
                        {status === "pending" ? "Pagando con..." : "Pagar con"}{" "}
                        <Icons.payments.wompi className="w-20" />
                      </Button>
                    )}
                  {order.status !== OrderStatus.PAID &&
                    order?.payment?.method === PaymentMethod.PayU && (
                      <Button
                        className="flex items-center justify-center gap-2 font-serif"
                        disabled={status === "pending"}
                        onClick={() => mutate()}
                      >
                        {status === "pending" ? "Pagando con..." : "Pagar con"}{" "}
                        <Icons.payments.payu className="w-10" />
                      </Button>
                    )}

                  {order.status !== OrderStatus.PAID && (
                    <small>
                      *** Recuerda que si pagas por transferencia bancaria debes
                      enviar un mensaje al número de WhatsApp
                      <Icons.whatsapp className="mx-1 inline-flex h-3 w-3 text-green-600" />
                      <strong className="font-serif">313-258-2293</strong> con
                      el comprobante de pago del depósito hecho a la cuenta
                      Bancolombia
                      <Icons.payments.bancolombia className="mx-1 inline-flex h-3 w-3" />
                      <strong className="font-serif">236-000036-64</strong> para
                      que podamos procesar tu orden lo más pronto posible.
                    </small>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4 md:gap-3 lg:gap-8">
            {/* Order Items */}
            <div className="md:col-span-2 lg:col-span-3 lg:pr-20">
              <div className="border-b pb-5 font-serif text-xl font-bold">
                Lista de productos
              </div>
              <div className="max-h-[15.188rem] w-full overflow-y-auto">
                {order?.orderItems.map(({ product, quantity }) => (
                  <div
                    key={product.id}
                    className="flex w-full items-start justify-between py-4 pl-0 pr-3"
                  >
                    <div className="flex items-start justify-start gap-2 lg:gap-8">
                      <Link href={`/product/${product.id}`}>
                        <div className="relative h-20 w-20">
                          <CldImage
                            src={
                              product.images.find((image) => image.isMain)
                                ?.url ?? product.images[0].url
                            }
                            alt={product.name ?? "Imagen del producto"}
                            fill
                            sizes="(max-width: 640px) 100vw, 640px"
                            priority
                            className="rounded-md object-cover"
                          />
                        </div>
                      </Link>
                      <div className="flex flex-col">
                        <p className="mb-2 mt-0 font-serif text-sm font-semibold">
                          {product.name}
                        </p>
                        <span className="text-xs text-gray-400">
                          {`#${product.sku} | Cantidad: ${quantity}`}
                        </span>
                      </div>
                    </div>
                    <Currency
                      className="text-base lg:text-lg"
                      value={Number(product.price) * quantity}
                    />
                  </div>
                ))}
              </div>
            </div>
            {/* Order Summary */}
            <div className="rounded-md border p-4 md:col-span-2 lg:col-start-4">
              <div className="border-b pb-4 font-serif text-xl font-bold">
                Resumen del pedido
              </div>
              <div className="flex w-full flex-col border-b px-0 py-6">
                <div className="flex w-full justify-between">
                  <span>Subtotal:</span>
                  <Currency
                    className="text-base lg:text-lg"
                    value={order.subtotal}
                  />
                </div>
                {order.shipping?.cost && (
                  <div className="flex w-full justify-between">
                    <span>Envío y manejo:</span>
                    <Currency
                      className="text-base lg:text-lg"
                      value={order.shipping.cost}
                    />
                  </div>
                )}
                {order.discount && order.discount > 0 ? (
                  <div className="flex w-full justify-between text-success">
                    <span>Descuento:</span>
                    <Currency
                      className="text-base lg:text-lg"
                      value={order.discount}
                      isNegative
                    />
                  </div>
                ) : null}
                {order.couponDiscount && order.couponDiscount > 0 ? (
                  <div className="flex w-full justify-between text-success">
                    <span>Descuento cupón:</span>
                    <Currency
                      className="text-base lg:text-lg"
                      value={order.couponDiscount}
                      isNegative
                    />
                  </div>
                ) : null}
              </div>
              <div className="flex w-full px-0 py-8 text-xl">
                <div className="flex w-full justify-between">
                  <span>Total</span>
                  <Currency
                    value={order.total + Number(order?.shipping?.cost ?? 0)}
                  />
                </div>
              </div>
            </div>
          </div>
          {payUformData && (
            <PayUForm
              formRef={payUFormRef}
              referenceCode={payUformData.referenceCode}
              products={order.orderItems.map((orderItem) => ({
                name: orderItem.product.name,
                quantity: orderItem.quantity || 1,
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
          )}
        </Container>
      )}
      {!hasAccess && <Forbidden />}
    </>
  );
};

export default SingleOrderPage;
