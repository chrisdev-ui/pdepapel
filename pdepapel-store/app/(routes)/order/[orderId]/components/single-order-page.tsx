"use client";

import { useAuth } from "@clerk/nextjs";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  Hourglass,
  Info,
  MapPin,
  Package,
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
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
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
import { useConfetti } from "@/hooks/use-confetti";
import { useGuestUser } from "@/hooks/use-guest-user";
import { useToast } from "@/hooks/use-toast";
import useTrackShipment from "@/hooks/use-track-shipment";
import { cn } from "@/lib/utils";
import {
  Order,
  PayUFormState,
  ShippingTrackingEvent,
  WompiResponse,
} from "@/types";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatPhoneNumber } from "react-phone-number-input";
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

const getStatusColor = (status: string) => {
  switch (status) {
    case "CREATED":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "PENDING":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "PAID":
      return "bg-green-100 text-green-700 border-green-200";
    case "CANCELLED":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  [PaymentMethod.COD]: "Contra entrega",
  [PaymentMethod.BankTransfer]: "Transferencia bancaria",
  [PaymentMethod.Wompi]: "Wompi",
  [PaymentMethod.PayU]: "PayU",
};

const normalizeText = (text: string): string => {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
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
  const { fireConfetti } = useConfetti();

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
      fireConfetti();
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
  }, [order, removeAll, searchParams, toast, fireConfetti]);

  useEffect(() => {
    if (payUformData && payUFormRef.current) {
      payUFormRef.current?.submit();
    }
  }, [payUformData]);

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
          fireConfetti();
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
  }, [order, removeAll, searchParams, toast, fireConfetti]);

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
    // Only use EnvioClick URL for ENVIOCLICK provider
    if (order?.shipping?.provider === "ENVIOCLICK") {
      return `https://www.envioclick.com/co/track/${order.shipping.trackingCode}`;
    }
    // For MANUAL provider, use stored trackingUrl if available
    if (order?.shipping?.trackingUrl) {
      return order.shipping.trackingUrl;
    }
    return "#";
  }, [
    order?.shipping?.trackingCode,
    order?.shipping?.provider,
    order?.shipping?.trackingUrl,
  ]);

  const isAdmin = (user: string) => ADMIN_USER_IDS.includes(user);

  const hasAccess = userId
    ? userId === order?.userId || isAdmin(userId)
    : guestId === order?.guestId || isAdmin(guestId);

  return (
    <>
      {hasAccess && (
        <div className="min-h-screen bg-gradient-to-br from-pink-50/50 via-white to-purple-50/30">
          <div className="container mx-auto max-w-7xl px-4 py-8">
            <Breadcrumb
              items={[
                {
                  label: `Pedido #${order.orderNumber ?? order.id}`,
                  isCurrent: true,
                },
              ]}
              className="mb-6"
            />

            {/* Hero Section */}
            <div className="mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-500 p-1 shadow-2xl">
              <div className="rounded-xl bg-white p-8 md:p-12">
                <div className="flex flex-col items-center gap-6 text-center">
                  <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 p-1 shadow-xl">
                    <div className="relative h-full w-full overflow-hidden rounded-full bg-white">
                      <Image
                        src="/images/no-text-lightpink-bg.webp"
                        alt="Logo Papelería P de Papel"
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border-2 px-6 py-2 text-base font-semibold",
                        getStatusColor(order.status),
                      )}
                    >
                      {order.status === "PAID"
                        ? "✓ Pago Completado"
                        : order.status === "PENDING"
                        ? "⏳ Pago Pendiente"
                        : order.status === "CANCELLED"
                        ? "✕ Orden Cancelada"
                        : "⏳ Esperando Pago"}
                    </span>

                    <h1 className="text-balance font-serif text-4xl font-black leading-tight md:text-5xl lg:text-6xl">
                      ¡Gracias por tu orden!
                    </h1>

                    <div className="mx-auto max-w-2xl space-y-2">
                      <p className="text-xl text-muted-foreground md:text-2xl">
                        Tu pedido{" "}
                        <span className="font-serif font-bold text-foreground">
                          #{order.orderNumber ?? order.id}
                        </span>{" "}
                        ha sido recibido correctamente
                      </p>
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>
                          {format(
                            new Date(order.createdAt),
                            "EEEE, d 'de' MMMM 'del' yyyy 'a las' HH:mm",
                            { locale: es },
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Button
                    size="lg"
                    variant="outline"
                    className="gap-2 bg-transparent font-semibold print:hidden"
                    onClick={() => window.print()}
                  >
                    <Printer className="h-5 w-5" />
                    Imprimir Orden
                  </Button>
                </div>
              </div>
            </div>

            {/* Info Banner */}
            <div className="mb-8 rounded-xl border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50 p-6 shadow-sm">
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="rounded-full bg-purple-100 p-2">
                    <Info className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
                <p className="text-pretty leading-relaxed text-foreground">
                  Si creaste esta orden con tu cuenta registrada, puedes ver
                  todos los detalles en{" "}
                  <span className="font-bold text-purple-700">
                    Mi Cuenta → Mis Órdenes
                  </span>
                  . Allí encontrarás el seguimiento completo y podrás descargar
                  tu factura.
                </p>
              </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid gap-8 lg:grid-cols-3">
              {/* Left Column - Details */}
              <div className="space-y-6 lg:col-span-2">
                {/* Shipping Status Card */}
                <div className="group overflow-hidden rounded-2xl border-2 bg-card shadow-lg transition-all hover:shadow-xl">
                  <div className="bg-gradient-to-r from-indigo-500 to-purple-500 p-6">
                    <div className="flex items-center gap-3 text-white">
                      <div className="rounded-full bg-white/20 p-3 backdrop-blur">
                        <Truck className="h-6 w-6" />
                      </div>
                      <div>
                        <h2 className="font-serif text-2xl font-bold">
                          Estado del Envío
                        </h2>
                        <p className="text-sm text-white/90">
                          Seguimiento en tiempo real
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6 p-6">
                    {/* Store Pickup - for NONE provider */}
                    {order?.shipping?.provider === "NONE" ? (
                      <div className="rounded-xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 text-center">
                        <div className="mb-4 flex justify-center">
                          <div className="rounded-full bg-amber-100 p-4">
                            <MapPin className="h-8 w-8 text-amber-600" />
                          </div>
                        </div>
                        <h3 className="mb-2 font-serif text-xl font-bold text-amber-800">
                          Retiro en Tienda
                        </h3>
                        <p className="mb-4 text-sm text-amber-700">
                          Tu pedido estará listo para retirar en nuestra tienda
                          física. Te notificaremos cuando esté disponible.
                        </p>
                        <div className="rounded-lg bg-white/80 p-4">
                          <p className="text-sm font-medium text-muted-foreground">
                            Estado actual:
                          </p>
                          <p className="font-serif text-lg font-bold text-foreground">
                            {shippingStatus[shippingStatus.length - 1]?.value ??
                              "En preparación"}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Carrier Badge */}
                        {order?.shipping?.carrierName && (
                          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 p-4">
                            <Courier name={order.shipping.carrierName} />
                            {order.shipping.carrierName ||
                              (order.shipping.courier && (
                                <span className="text-sm font-medium text-muted-foreground">
                                  {order.shipping.courier ??
                                    order.shipping.carrierName}
                                </span>
                              ))}
                          </div>
                        )}

                        {/* Tracking Info Grid */}
                        <div className="grid gap-4 sm:grid-cols-2">
                          {order?.shipping?.trackingCode && (
                            <div className="rounded-lg border-2 bg-gradient-to-br from-gray-50 to-white p-4">
                              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Número de Guía
                              </p>
                              <Link
                                href={getTrackingUrl()}
                                className="group/link flex items-center gap-2 font-serif text-lg font-bold text-indigo-600 transition-colors hover:text-indigo-700"
                                target="_blank"
                              >
                                {order.shipping.trackingCode}
                                <ExternalLink className="h-4 w-4 transition-transform group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5" />
                              </Link>
                            </div>
                          )}

                          {(order?.shipping?.estimatedDeliveryDate ||
                            order?.shipping?.deliveryDays) && (
                            <div className="rounded-lg border-2 bg-gradient-to-br from-green-50 to-emerald-50 p-4">
                              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Fecha Estimada
                              </p>
                              <div className="flex items-center gap-2">
                                <Calendar className="h-5 w-5 text-green-600" />
                                <p className="font-serif font-bold text-foreground">
                                  {order.shipping.estimatedDeliveryDate
                                    ? format(
                                        new Date(
                                          order.shipping.estimatedDeliveryDate,
                                        ),
                                        "d 'de' MMMM",
                                        { locale: es },
                                      )
                                    : `${order.shipping.deliveryDays} días hábiles`}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Shipping Progress Timeline */}
                        <div className="rounded-xl bg-gradient-to-br from-purple-50/50 to-pink-50/50 p-6">
                          <h3 className="mb-6 font-serif text-lg font-bold">
                            Progreso del Envío
                          </h3>
                          <div className="space-y-0">
                            {shippingStatus.map((step, index) => (
                              <div
                                key={index}
                                className="flex gap-4 pb-8 last:pb-0"
                              >
                                <div className="relative flex flex-col items-center">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-emerald-500 shadow-lg">
                                    <CheckCircle2 className="h-5 w-5 text-white" />
                                  </div>
                                  {index < shippingStatus.length - 1 && (
                                    <div className="my-2 h-full w-1 flex-1 rounded-full bg-gradient-to-b from-green-400 to-emerald-500" />
                                  )}
                                </div>
                                <div className="flex-1 pt-1">
                                  <p className="text-lg font-bold leading-tight">
                                    {step.value}
                                  </p>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {index === 0
                                      ? format(
                                          new Date(order.createdAt),
                                          "EEEE d 'de' MMMM, yyyy",
                                          { locale: es },
                                        )
                                      : order.shipping?.createdAt
                                      ? format(
                                          new Date(order.shipping.createdAt),
                                          "EEEE d 'de' MMMM, yyyy",
                                          { locale: es },
                                        )
                                      : "Fecha pendiente"}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Track Button - only for ENVIOCLICK provider */}
                        {order?.shipping?.envioClickIdOrder &&
                          order?.shipping?.provider === "ENVIOCLICK" && (
                            <Button
                              size="lg"
                              className="w-full gap-2 text-base font-bold shadow-lg"
                              onClick={() =>
                                trackShipment({
                                  shippingId: order.shipping.id,
                                  userId: userId || null,
                                  guestId: guestId || null,
                                })
                              }
                              disabled={trackingStatus === "pending"}
                            >
                              <Package className="h-5 w-5" />
                              {trackingStatus === "pending"
                                ? "Rastreando..."
                                : "Rastrear Mi Paquete"}
                              <ArrowRight className="h-5 w-5" />
                            </Button>
                          )}

                        {/* EnvioClick tracking link - only for ENVIOCLICK provider */}
                        {order?.shipping?.trackingCode &&
                          order?.shipping?.provider === "ENVIOCLICK" && (
                            <Button
                              size="lg"
                              variant="outline"
                              className="w-full gap-2 text-base font-bold"
                              asChild
                            >
                              <Link href={getTrackingUrl()} target="_blank">
                                <ExternalLink className="h-5 w-5" />
                                Ver en EnvioClick
                              </Link>
                            </Button>
                          )}

                        {/* Generic tracking link - for MANUAL provider with tracking URL */}
                        {order?.shipping?.trackingCode &&
                          order?.shipping?.provider === "MANUAL" &&
                          order?.shipping?.trackingUrl && (
                            <Button
                              size="lg"
                              variant="outline"
                              className="w-full gap-2 text-base font-bold"
                              asChild
                            >
                              <Link
                                href={order.shipping.trackingUrl}
                                target="_blank"
                              >
                                <ExternalLink className="h-5 w-5" />
                                Rastrear Envío
                              </Link>
                            </Button>
                          )}

                        {/* Tracking Events History */}
                        {trackingEvents.length > 0 && (
                          <div className="rounded-xl border-2 bg-white p-4">
                            <p className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              Historial Detallado
                            </p>
                            <div className="max-h-72 space-y-3 overflow-y-auto pr-2">
                              {trackingEvents.map((event) => (
                                <div
                                  key={event.id}
                                  className="flex gap-3 rounded-lg border bg-gradient-to-r from-gray-50 to-white p-3"
                                >
                                  <div className="pt-1">
                                    <span className="block h-2.5 w-2.5 rounded-full bg-indigo-500 shadow-sm" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold leading-tight">
                                      {normalizeText(event.description)}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {event.location && (
                                        <span className="font-medium">
                                          {event.location}
                                        </span>
                                      )}
                                      {event.location && " • "}
                                      {format(
                                        new Date(event.timestamp),
                                        "d MMM, HH:mm",
                                        { locale: es },
                                      )}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Delivery Address Card */}
                <div className="overflow-hidden rounded-2xl border-2 bg-card shadow-lg">
                  <div className="bg-gradient-to-r from-pink-500 to-rose-500 p-6">
                    <div className="flex items-center gap-3 text-white">
                      <div className="rounded-full bg-white/20 p-3 backdrop-blur">
                        <MapPin className="h-6 w-6" />
                      </div>
                      <div>
                        <h2 className="font-serif text-2xl font-bold">
                          Dirección de Entrega
                        </h2>
                        <p className="text-sm text-white/90">
                          Donde recibirás tu pedido
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 p-6">
                    <div className="rounded-xl border-2 bg-gradient-to-br from-rose-50 to-pink-50 p-6">
                      <div className="space-y-2 text-base leading-relaxed">
                        <p className="text-xl font-bold text-foreground">
                          {order.fullName}
                        </p>
                        {order.company && (
                          <p className="font-medium text-muted-foreground">
                            {order.company}
                          </p>
                        )}
                        <div className="my-3 h-px bg-gradient-to-r from-pink-200 to-transparent" />
                        <p className="font-medium">{order.address}</p>
                        {order.address2 && (
                          <p className="font-medium">{order.address2}</p>
                        )}
                        {order.neighborhood && (
                          <p className="text-muted-foreground">
                            📍 Barrio: {order.neighborhood}
                          </p>
                        )}
                        <p className="font-medium">
                          {order.city}, {order.department}
                        </p>
                        {order.addressReference && (
                          <p className="border-l-4 border-pink-300 py-1 pl-3 text-sm italic text-muted-foreground">
                            {order.addressReference}
                          </p>
                        )}
                        <div className="flex items-center gap-2 pt-2">
                          <Icons.flags.colombia className="h-5 w-5" />
                          <span className="font-semibold">Colombia</span>
                        </div>
                        {order.phone && (
                          <div className="flex items-center gap-2 rounded-lg border bg-white p-3">
                            <Phone className="h-5 w-5 text-pink-600" />
                            <span className="font-serif font-bold">
                              {formatPhoneNumber(order.phone) || order.phone}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Products Ordered Card */}
                <div className="overflow-hidden rounded-2xl border-2 bg-card shadow-lg">
                  <div className="bg-gradient-to-r from-purple-500 to-indigo-500 p-6">
                    <div className="flex items-center gap-3 text-white">
                      <div className="rounded-full bg-white/20 p-3 backdrop-blur">
                        <Package className="h-6 w-6" />
                      </div>
                      <div>
                        <h2 className="font-serif text-2xl font-bold">
                          Productos Ordenados
                        </h2>
                        <p className="text-sm text-white/90">
                          {order.orderItems.length}{" "}
                          {order.orderItems.length === 1
                            ? "artículo"
                            : "artículos"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 p-6">
                    {order.orderItems.map(({ product, quantity }) => (
                      <div
                        key={product.id}
                        className="group flex gap-4 overflow-hidden rounded-xl border-2 bg-gradient-to-br from-white to-gray-50 p-4 transition-all hover:border-indigo-200 hover:shadow-lg"
                      >
                        <Link
                          href={`/product/${product.id}`}
                          className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-white shadow-md"
                        >
                          <CldImage
                            src={
                              product.images.find((image) => image.isMain)
                                ?.url ?? product.images[0].url
                            }
                            alt={product.name ?? "Imagen del producto"}
                            fill
                            sizes="(max-width: 640px) 100vw, 640px"
                            priority
                            className="object-cover transition-transform group-hover:scale-110"
                          />
                        </Link>
                        <div className="flex min-w-0 flex-1 flex-col justify-between">
                          <div>
                            <h3 className="text-lg font-bold leading-tight">
                              {product.name}
                            </h3>
                            <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                              {product.design && (
                                <p>Diseño: {product.design.name}</p>
                              )}
                              {product.color && (
                                <p>Color: {product.color.name}</p>
                              )}
                              {product.size && (
                                <p>Talla: {product.size.name}</p>
                              )}
                              <p>
                                #{product.sku} | Cantidad:{" "}
                                <span className="font-bold text-foreground">
                                  {quantity}
                                </span>
                              </p>
                            </div>
                          </div>
                          <Currency
                            className="text-xl font-bold text-indigo-600"
                            value={Number(product.price) * quantity}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column - Summary Sidebar */}
              <div className="space-y-6">
                <div className="sticky top-32 overflow-hidden rounded-2xl border-2 bg-card shadow-xl">
                  <div className="bg-gradient-to-r from-emerald-500 to-green-500 p-6">
                    <div className="flex items-center gap-3 text-white">
                      <div className="rounded-full bg-white/20 p-3 backdrop-blur">
                        <CreditCard className="h-6 w-6" />
                      </div>
                      <div>
                        <h2 className="font-serif text-2xl font-bold">Pago</h2>
                        <p className="text-sm text-white/90">Estado actual</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6 p-6">
                    {/* Payment Status */}
                    <div
                      className={cn(
                        "flex flex-col items-center gap-4 rounded-xl border-2 p-6 text-center transition-all",
                        getStatusColor(order.status),
                      )}
                    >
                      <div className="bg-current/10 rounded-full p-4">
                        {STATUS[order?.status as OrderStatus].icon}
                      </div>
                      <p className="text-pretty text-sm font-medium leading-relaxed">
                        {STATUS[order?.status as OrderStatus].text}
                      </p>
                    </div>

                    {/* Payment Details */}
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between rounded-lg bg-gray-50 p-3">
                        <span className="font-medium text-muted-foreground">
                          Método:
                        </span>
                        <span className="font-bold">
                          {PAYMENT_METHOD_LABELS[order.payment.method] ??
                            order.payment.method}
                        </span>
                      </div>
                      {order.payment.transactionId && (
                        <div className="flex justify-between rounded-lg bg-gray-50 p-3">
                          <span className="font-medium text-muted-foreground">
                            ID:
                          </span>
                          <span className="font-serif text-xs font-bold">
                            {order.payment.transactionId}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Order Summary */}
                    <div className="rounded-xl border-2 bg-gradient-to-br from-purple-50 to-pink-50 p-6">
                      <h3 className="mb-4 font-serif text-lg font-bold">
                        Resumen de Orden
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between text-base">
                          <span className="text-muted-foreground">
                            Subtotal
                          </span>
                          <Currency
                            className="font-semibold"
                            value={order.subtotal}
                          />
                        </div>
                        {order.shipping?.cost && (
                          <div className="flex justify-between text-base">
                            <span className="text-muted-foreground">Envío</span>
                            <Currency
                              className="font-semibold"
                              value={order.shipping.cost}
                            />
                          </div>
                        )}
                        {order.discount && order.discount > 0 ? (
                          <div className="flex justify-between text-base text-success">
                            <span>Descuento</span>
                            <Currency
                              className="font-semibold"
                              value={order.discount}
                              isNegative
                            />
                          </div>
                        ) : null}
                        {order.couponDiscount && order.couponDiscount > 0 ? (
                          <div className="flex justify-between text-base text-success">
                            <span>Descuento cupón</span>
                            <Currency
                              className="font-semibold"
                              value={order.couponDiscount}
                              isNegative
                            />
                          </div>
                        ) : null}
                        <div className="h-px bg-gradient-to-r from-purple-200 via-pink-200 to-purple-200" />
                        <div className="flex justify-between text-2xl font-black">
                          <span>Total</span>
                          <Currency
                            className="text-indigo-600"
                            value={order.total}
                          />
                        </div>
                        <p className="text-center text-xs text-muted-foreground">
                          COP - Pesos Colombianos
                        </p>
                      </div>
                    </div>

                    {/* Payment Buttons */}
                    {order.status !== OrderStatus.PAID &&
                      order?.payment?.method === PaymentMethod.Wompi && (
                        <Button
                          className="flex w-full items-center justify-center gap-2 font-serif"
                          disabled={status === "pending"}
                          onClick={() => mutate()}
                        >
                          {status === "pending"
                            ? "Pagando con..."
                            : "Pagar con"}{" "}
                          <Icons.payments.wompi className="w-20" />
                        </Button>
                      )}

                    {order.status !== OrderStatus.PAID &&
                      order?.payment?.method === PaymentMethod.PayU && (
                        <Button
                          className="flex w-full items-center justify-center gap-2 font-serif"
                          disabled={status === "pending"}
                          onClick={() => mutate()}
                        >
                          {status === "pending"
                            ? "Pagando con..."
                            : "Pagar con"}{" "}
                          <Icons.payments.payu className="w-10" />
                        </Button>
                      )}

                    {order.status !== OrderStatus.PAID && (
                      <div className="rounded-lg border-2 border-amber-200 bg-amber-50 p-4 text-xs">
                        <p className="leading-relaxed text-amber-800">
                          *** Recuerda que si pagas por transferencia bancaria
                          debes enviar un mensaje al número de WhatsApp
                          <Icons.whatsapp className="mx-1 inline-flex h-3 w-3 text-green-600" />
                          <strong className="font-serif">313-258-2293</strong>{" "}
                          con el comprobante de pago del depósito hecho a la
                          cuenta Bancolombia
                          <Icons.payments.bancolombia className="mx-1 inline-flex h-3 w-3" />
                          <strong className="font-serif">236-000036-64</strong>{" "}
                          para que podamos procesar tu orden lo más pronto
                          posible.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* PayU Form (hidden) */}
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
          </div>
        </div>
      )}
      {!hasAccess && <Forbidden />}
    </>
  );
};

export default SingleOrderPage;
