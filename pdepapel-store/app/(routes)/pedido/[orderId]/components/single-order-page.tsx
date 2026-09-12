"use client";

import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import { ArrowRight, MessageCircle, Printer, ShieldAlert, ShieldCheck, ShieldClose } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { OrderAccountClaimCard } from "@/components/order-account-claim-card";
import { OrderStageBadge } from "@/components/order-stage-badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { OrderStatus } from "@/constants";
import { useCart } from "@/hooks/use-cart";
import useCheckoutOrder from "@/hooks/use-checkout-order";
import { useCheckoutStore } from "@/hooks/use-checkout-store";
import { useConfetti } from "@/hooks/use-confetti";
import { useGuestUser } from "@/hooks/use-guest-user";
import { useToast } from "@/hooks/use-toast";
import useTrackShipment from "@/hooks/use-track-shipment";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import { formatOrderDate } from "@/lib/order-dates";
import {
  ORDER_STATUS_POLL_INTERVAL_MS,
  shouldPollOrderStatus,
} from "@/lib/order-status-polling";
import {
  countOrderUnits,
  formatUnits,
  getOrderStage,
  getOrderSupportWhatsAppUrl,
  getOrderTimeline,
  isAwaitingPayment,
} from "@/lib/order-status";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { Order, ShippingTrackingEvent } from "@/types";
import { OrderHelpCard } from "./order-help-card";
import { OrderItemsCard } from "./order-items-card";
import { OrderShippingCard } from "./order-shipping-card";
import { OrderSummaryCard } from "./order-summary-card";
import { OrderTimeline } from "./order-timeline";

interface SingleOrderPageProps {
  order: Order;
}

const SingleOrderPage: React.FC<SingleOrderPageProps> = ({ order }) => {
  const searchParams = useSearchParams();
  const { userId, getToken } = useAuth();
  const { toast } = useToast();
  const guestId = useGuestUser((state) => state.guestId ?? "");
  const [trackingEvents, setTrackingEvents] = useState<ShippingTrackingEvent[]>(
    [],
  );
  const removeAll = useCart((state) => state.removeAll);
  const pendingOrder = useCheckoutStore((state) => state.pendingOrder);
  const setPendingOrder = useCheckoutStore((state) => state.setPendingOrder);
  const resetCheckout = useCheckoutStore((state) => state.resetCheckout);
  const { fireConfetti } = useConfetti();
  const [currentOrder, setCurrentOrder] = useState(order);
  const activeOrder = currentOrder || order;

  // The checkout keeps the cart until the gateway confirms the payment. Once
  // this order is PAID, the cart and the saved checkout are cleared here —
  // whether the confirmation arrives by polling, by redirect or on a later
  // visit — and the conversion is reported once per order.
  useEffect(() => {
    if (activeOrder.status !== OrderStatus.PAID) return;

    if (pendingOrder?.id === order.id) {
      removeAll();
      resetCheckout();
      setPendingOrder(null);
    }

    const trackedKey = `pdepapel:purchase-tracked:${order.id}`;
    try {
      if (window.localStorage.getItem(trackedKey)) return;
      window.localStorage.setItem(trackedKey, new Date().toISOString());
    } catch {
      // Storage unavailable: report anyway.
    }
    trackCustomerEvent("purchase", {
      currency: "COP",
      transaction_id: order.orderNumber || order.id,
      value: Number(order.total) || 0,
      shipping: Number(order.shipping?.cost ?? 0) || 0,
      items: order.orderItems.map((orderItem) => ({
        item_id: orderItem.product?.id ?? orderItem.id,
        item_name:
          orderItem.name || orderItem.product?.name || "Producto sin nombre",
        quantity: orderItem.quantity || 1,
      })),
    });
  }, [
    activeOrder.status,
    order,
    pendingOrder?.id,
    removeAll,
    resetCheckout,
    setPendingOrder,
  ]);

  useEffect(() => {
    if (!shouldPollOrderStatus(currentOrder.status, true)) {
      return;
    }

    let isDisposed = false;
    let isRequestInFlight = false;

    const refreshOrder = async () => {
      if (
        isDisposed ||
        isRequestInFlight ||
        !shouldPollOrderStatus(
          currentOrder.status,
          document.visibilityState === "visible",
        )
      ) {
        return;
      }

      isRequestInFlight = true;
      try {
        const storeApiUrl = process.env.NEXT_PUBLIC_API_URL;
        if (!storeApiUrl) return;

        const response = await axios.get(`${storeApiUrl}/orders/${order.id}`);
        const fetchedOrder = response.data;
        if (
          !isDisposed &&
          fetchedOrder &&
          fetchedOrder.status !== currentOrder.status
        ) {
          setCurrentOrder(fetchedOrder);

          if (fetchedOrder.status === OrderStatus.PAID) {
            toast({
              title: "¡Pago confirmado!",
              description:
                "Recibimos tu pago. Tu pedido ya está en preparación.",
              variant: "success",
              icon: <ShieldCheck className="h-8 w-8 text-emerald-600" />,
              duration: 10000,
            });
            fireConfetti();
          } else if (fetchedOrder.status === OrderStatus.CANCELLED) {
            toast({
              title: "Intento de pago no procesado",
              description:
                "El intento de pago no fue completado. Puedes reintentar cuando desees.",
              variant: "destructive",
              duration: 8000,
            });
          }
        }
      } catch (e) {
        // Silent catch for background polling
      } finally {
        isRequestInFlight = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshOrder();
      }
    };

    const intervalId = window.setInterval(() => {
      void refreshOrder();
    }, ORDER_STATUS_POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    void refreshOrder();

    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentOrder.status, order.id, fireConfetti, toast]);

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
      if (data?.url) window.location.href = data.url;
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
          "No se realizó ningún cargo a tu cuenta. Tu carrito sigue intacto: intenta el pago de nuevo o usa otro método.",
        duration: 10000,
      });
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
    }
  }, [order, searchParams, toast, fireConfetti]);

  const stage = useMemo(() => getOrderStage(activeOrder), [activeOrder]);
  const timeline = useMemo(() => getOrderTimeline(activeOrder), [activeOrder]);
  const awaitingPayment = isAwaitingPayment(activeOrder);

  // Quién puede ver el pedido lo decide la API (`GET /orders/[id]` responde
  // 404 a quien no sea la clienta del pedido ni la dueña); aquí ya llegó.
  const orderNumber = order.orderNumber ?? order.id;
  const canRefreshTracking = Boolean(
    order.shipping?.envioClickIdOrder &&
      order.shipping?.provider === "ENVIOCLICK" &&
      !awaitingPayment,
  );
  const carrier = order.shipping?.carrierName || order.shipping?.courier;
  const summaryLine = [
    `Hecho el ${formatOrderDate(order.createdAt, "day")}`,
    formatUnits(countOrderUnits(order)),
    stage.stage === "shipped" && carrier ? `Enviado con ${carrier}` : null,
    stage.stage === "delivered" && order.shipping?.actualDeliveryDate
      ? `Entregado el ${formatOrderDate(order.shipping.actualDeliveryDate, "day")}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const heading =
    stage.stage === "paid" && searchParams.get("id")
      ? "¡Gracias por tu compra!"
      : `Pedido #${orderNumber}`;

  return (
    <div className="mx-auto flex max-w-screen-2xl flex-col gap-5 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <Breadcrumb
        items={
          userId && order.userId === userId
            ? [
                { label: "Mi cuenta", href: STOREFRONT_ROUTES.account },
                { label: "Mis pedidos", href: STOREFRONT_ROUTES.myOrders },
                { label: `Pedido #${orderNumber}`, isCurrent: true },
              ]
            : [{ label: `Pedido #${orderNumber}`, isCurrent: true }]
        }
        className="print:hidden"
      />

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2">
          <div>
            <OrderStageBadge stage={stage} />
          </div>
          <h1 className="text-balance font-serif text-3xl font-bold text-blue-yankees sm:text-4xl">
            {heading}
            {heading !== `Pedido #${orderNumber}` && (
              <span className="mt-1 block font-quicksand text-lg font-semibold text-muted-foreground sm:text-xl">
                Pedido #{orderNumber}
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">{summaryLine}</p>
          <p className="max-w-2xl text-[15px] text-foreground">{stage.description}</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.print()}
            className="gap-2 rounded-full border-[1.5px] border-blue-yankees font-sans font-semibold text-blue-yankees"
          >
            <Printer aria-hidden="true" className="h-4 w-4" />
            Recibo
          </Button>
          <Button
            asChild
            variant="secondary"
            className="gap-2 rounded-full font-sans font-semibold"
          >
            <a
              href={getOrderSupportWhatsAppUrl(orderNumber)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle aria-hidden="true" className="h-4 w-4" />
              Ayuda con el pedido
            </a>
          </Button>
        </div>
      </header>

      <section
        aria-label="Progreso del pedido"
        className="rounded-2xl border border-pink-shell/30 bg-white px-4 py-5 shadow-[0_4px_20px_hsl(280_30%_70%/0.15)] print:border-border print:shadow-none sm:px-6"
      >
        <OrderTimeline steps={timeline} />
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:gap-8">
        <div className="order-2 flex flex-col gap-5 lg:order-1">
          <OrderShippingCard
            order={activeOrder}
            awaitingPayment={awaitingPayment}
            trackingEvents={trackingEvents}
            canRefreshTracking={canRefreshTracking}
            isRefreshingTracking={trackingStatus === "pending"}
            onRefreshTracking={async () =>
              trackShipment({
                shippingId: order.shipping.id,
                guestId: guestId || null,
                sessionToken: await getToken(),
              })
            }
          />
          <OrderItemsCard
            order={activeOrder}
            allowReorder={stage.stage !== "unpaid" && stage.stage !== "verifying"}
          />
          <OrderHelpCard orderNumber={orderNumber} />
        </div>

        <div className="order-1 flex flex-col gap-5 lg:sticky lg:top-[calc(var(--storefront-header-offset)+16px)] lg:order-2">
          <OrderSummaryCard
            order={activeOrder}
            stage={stage}
            awaitingPayment={awaitingPayment}
            autoOpenPayment={searchParams.get("autoPay") === "true"}
            isStartingWompi={status === "pending"}
            onPayWithWompi={() => mutate()}
          />
          <div className="print:hidden">
            <OrderAccountClaimCard
              orderId={activeOrder.id}
              orderGuestId={activeOrder.guestId}
              orderUserId={activeOrder.userId}
              guestId={guestId}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-center pt-2 print:hidden">
        <Button
          asChild
          variant="ghost"
          className="gap-2 rounded-full font-sans font-semibold text-blue-yankees"
        >
          <Link href={STOREFRONT_ROUTES.shop}>
            Seguir comprando
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default SingleOrderPage;
