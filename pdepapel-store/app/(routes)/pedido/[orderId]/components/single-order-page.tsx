"use client";

import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import { ArrowRight, Loader2, MessageCircle, Printer, ShieldCheck, ShieldClose } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { OrderAccountClaimCard } from "@/components/order-account-claim-card";
import { OrderGiftNotice } from "@/components/order-gift-notice";
import { OrderGiftCardPurchaseNotice } from "@/components/order-gift-card-purchase-notice";
import { OrderStageBadge } from "@/components/order-stage-badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { OrderStatus } from "@/constants";
import { useCapsulePack } from "@/hooks/use-capsule-pack";
import { useCart } from "@/hooks/use-cart";
import useCheckoutOrder from "@/hooks/use-checkout-order";
import { useCheckoutStore } from "@/hooks/use-checkout-store";
import { useConfetti } from "@/hooks/use-confetti";
import { useGuestUser } from "@/hooks/use-guest-user";
import { useToast } from "@/hooks/use-toast";
import useTrackShipment from "@/hooks/use-track-shipment";
import { cartMatchesOrder } from "@/lib/cart-matches-order";
import { formatOrderDate } from "@/lib/order-dates";
import {
  mergePolledOrder,
  ORDER_STATUS_POLL_INTERVAL_MS,
  shouldPollOrderStatus,
} from "@/lib/order-status-polling";
import {
  isCashOnDelivery,
  isPaymentReturn,
  PAYMENT_RETURN_POLL_INTERVAL_MS,
  PAYMENT_RETURN_WINDOW_MS,
  rememberPaymentNotice,
  resolvePaymentResult,
  wasPaymentNoticeShown,
} from "@/lib/payment-return";
import {
  countOrderUnits,
  formatUnits,
  getOrderStage,
  getOrderSupportWhatsAppUrl,
  getOrderTimeline,
  isAwaitingPayment,
  isGiftCardPurchase,
} from "@/lib/order-status";
import { isDepositOrder } from "@/lib/presale-checkout";
import {
  onlinePaymentResult,
  onlinePaymentReturn,
  preorderMoneyChanged,
  returnedPayment,
  shouldPollPreorderPayment,
} from "@/lib/preorder-online-payment";
import { PREORDER_PAY_COPY } from "@/lib/preorder-payment-copy";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { Order, ShippingTrackingEvent } from "@/types";
import { OrderHelpCard } from "./order-help-card";
import { OrderCapsuleCard } from "./order-capsule-card";
import { OrderItemsCard } from "./order-items-card";
import { OrderShippingCard } from "./order-shipping-card";
import { OrderSummaryCard } from "./order-summary-card";
import { OrderTimeline } from "./order-timeline";
import { ANALYTICS_CONSENT_CHANGED_EVENT } from "@/lib/analytics-consent";
import { isTikTokCompletePayment, trackTikTokCompletePayment } from "@/lib/analytics/tiktok";

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
  const clearCapsulePack = useCapsulePack((state) => state.removeAll);
  const cartItems = useCart((state) => state.items);
  const pendingOrder = useCheckoutStore((state) => state.pendingOrder);
  const setPendingOrder = useCheckoutStore((state) => state.setPendingOrder);
  const resetCheckout = useCheckoutStore((state) => state.resetCheckout);
  const { fireConfetti } = useConfetti();
  const [currentOrder, setCurrentOrder] = useState(order);
  const activeOrder = currentOrder || order;
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const returnedFromGateway = useMemo(() => isPaymentReturn(searchParams), [searchParams]);
  // Un abono o el saldo pagado desde esta página vuelve con `?pago=<referencia>`:
  // el estado sigue «Anticipo recibido», así que se juzga por ese cobro.
  const onlineReturn = useMemo(() => onlinePaymentReturn(searchParams), [searchParams]);
  const onlineResult = onlineReturn ? onlinePaymentResult(activeOrder, onlineReturn) : null;
  const onlinePayment = onlineReturn ? returnedPayment(activeOrder, onlineReturn) : null;
  const paymentResult = resolvePaymentResult(activeOrder);
  const paymentReturn = returnedFromGateway && !onlineReturn && !isCashOnDelivery(activeOrder);
  const confirmingReturn = (paymentReturn && paymentResult === "pending") || onlineResult === "pending";
  const [returnWindowOver, setReturnWindowOver] = useState(false);
  const fastPolling = confirmingReturn && !returnWindowOver;
  // Volver de la pasarela con el anticipo de una preventa: otro aviso, no «gracias por tu compra».
  const depositReturn = isDepositOrder(activeOrder) && activeOrder.status === OrderStatus.DEPOSIT_PAID;

  useEffect(() => {
    if (!confirmingReturn) return;
    const timeoutId = window.setTimeout(() => setReturnWindowOver(true), PAYMENT_RETURN_WINDOW_MS);
    return () => window.clearTimeout(timeoutId);
  }, [confirmingReturn]);

  // Abono o saldo aprobado: un aviso por cobro en la pestaña.
  useEffect(() => {
    if (!onlineReturn || onlineResult !== "approved") return;
    const key = `${order.id}:${onlineReturn}`;
    if (wasPaymentNoticeShown(key, "approved")) return;
    rememberPaymentNotice(key, "approved");
    const balancePaid = activeOrder.status === OrderStatus.PAID;
    toast({
      title: balancePaid ? PREORDER_PAY_COPY.balancePaidTitle : PREORDER_PAY_COPY.installmentReceivedTitle,
      variant: "success",
      icon: <ShieldCheck className="h-8 w-8" />,
      description: balancePaid ? PREORDER_PAY_COPY.balancePaid : PREORDER_PAY_COPY.installmentReceived(onlinePayment?.amount ?? 0),
      duration: 10000,
    });
    fireConfetti();
  }, [onlineReturn, onlineResult, onlinePayment?.amount, activeOrder.status, order.id, toast, fireConfetti]);

  // Un aviso por resultado y por pedido en la pestaña: ni el sondeo ni una
  // recarga lo repiten. Una visita sin marca de la pasarela no avisa nada.
  useEffect(() => {
    if (!paymentReturn || paymentResult === "pending") return;
    if (wasPaymentNoticeShown(order.id, paymentResult)) return;
    rememberPaymentNotice(order.id, paymentResult);

    if (paymentResult === "approved") {
      toast({
        title: depositReturn ? "¡Listo! Recibimos tu anticipo" : "¡Gracias por tu compra!",
        variant: "success",
        icon: <ShieldCheck className="h-8 w-8" />,
        description: depositReturn
          ? "Tu preventa quedó apartada. Te escribimos cuando llegue para coordinar el pago del saldo."
          : "Recibimos tu pago.",
        duration: 10000,
      });
      fireConfetti();
      return;
    }
    toast({
      title: "¡Hubo un fallo en tu intento de pago!",
      variant: "destructive",
      icon: <ShieldClose className="h-14 w-14" />,
      description:
        "No se realizó ningún cargo a tu cuenta. Tu carrito sigue intacto: intenta el pago de nuevo o usa otro método.",
      duration: 10000,
    });
  }, [paymentReturn, paymentResult, order.id, toast, fireConfetti, depositReturn]);

  // TikTok «CompletePayment»: pagado por pasarela o cubierto entero por una
  // tarjeta de regalo; nunca transferencia ni contra entrega. Una vez por
  // pedido (lib/analytics/tiktok.ts); si «Publicidad» llega con la página
  // abierta, se intenta otra vez.
  useEffect(() => {
    if (!isTikTokCompletePayment(activeOrder)) return;
    const send = () =>
      trackTikTokCompletePayment(
        activeOrder,
        activeOrder.orderItems.map((item) => ({
          item_id: item.sku || item.product?.sku || item.productId || item.id,
          item_name: item.name ?? item.product?.name ?? "",
          quantity: item.quantity,
          price: Number(item.price ?? 0),
        })),
      );
    send();
    window.addEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, send);
    return () => window.removeEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, send);
  }, [activeOrder]);

  // The checkout keeps the cart until the gateway confirms the payment. Once
  // this order is PAID, the cart and the saved checkout are cleared here —
  // whether the confirmation arrives by polling, by redirect or on a later
  // visit. The purchase itself is reported by the admin once payment is verified.
  useEffect(() => {
    // El anticipo de una preventa también cierra el carrito: la reserva ya está hecha.
    if (activeOrder.status !== OrderStatus.PAID && activeOrder.status !== OrderStatus.DEPOSIT_PAID) return;

    // El camino normal: este navegador arrancó el pedido y lo recuerda.
    // El segundo: se pagó en otro navegador —pasa al abrir el enlace desde
    // Instagram o WhatsApp— y aquí quedó el mismo carrito sin vaciar.
    const isRememberedOrder = pendingOrder?.id === order.id;
    // Un pack de cápsulas se pagó desde su propio carrito: el de la tienda queda como estaba.
    const isCapsulePack = Boolean(activeOrder.capsule);
    const leftoverCartWasPaid = !isCapsulePack && cartMatchesOrder(cartItems, order.orderItems);
    if (!isRememberedOrder && !leftoverCartWasPaid) return;

    if (isCapsulePack) clearCapsulePack();
    else removeAll();
    resetCheckout();
    if (isRememberedOrder) setPendingOrder(null);
  }, [
    activeOrder.status,
    activeOrder.capsule,
    cartItems,
    clearCapsulePack,
    order.id,
    order.orderItems,
    pendingOrder?.id,
    removeAll,
    resetCheckout,
    setPendingOrder,
  ]);

  const pollsPreorder = shouldPollPreorderPayment(currentOrder, onlineReturn, true);
  useEffect(() => {
    if (!shouldPollOrderStatus(currentOrder.status, true) && !pollsPreorder) {
      return;
    }

    let isDisposed = false;
    let isRequestInFlight = false;

    const refreshOrder = async () => {
      if (
        isDisposed ||
        isRequestInFlight ||
        (!shouldPollOrderStatus(currentOrder.status, document.visibilityState === "visible") &&
          !(pollsPreorder && document.visibilityState === "visible"))
      ) {
        return;
      }

      isRequestInFlight = true;
      try {
        const storeApiUrl = process.env.NEXT_PUBLIC_API_URL;
        if (!storeApiUrl) return;

        // Sin la sesión, un pedido de cuenta responde 404 y la página dejaba
        // de actualizarse.
        const sessionToken = await getTokenRef.current().catch(() => null);
        const response = await axios.get(`${storeApiUrl}/orders/${order.id}`, {
          headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
        });
        const fetchedOrder = response.data as Order | null;
        if (
          !isDisposed &&
          fetchedOrder &&
          (fetchedOrder.status !== currentOrder.status || preorderMoneyChanged(currentOrder, fetchedOrder))
        ) {
          setCurrentOrder((previous) => mergePolledOrder(previous, fetchedOrder));
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

    const intervalId = window.setInterval(
      () => {
        void refreshOrder();
      },
      fastPolling ? PAYMENT_RETURN_POLL_INTERVAL_MS : ORDER_STATUS_POLL_INTERVAL_MS,
    );
    document.addEventListener("visibilitychange", handleVisibilityChange);

    void refreshOrder();

    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentOrder, order.id, fastPolling, pollsPreorder]);

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
  const digital = isGiftCardPurchase(order);
  const summaryLine = [
    `Hecho el ${formatOrderDate(order.createdAt, "day")}`,
    digital ? "Tarjeta de regalo" : formatUnits(countOrderUnits(order)),
    stage.stage === "shipped" && carrier ? `Enviado con ${carrier}` : null,
    stage.stage === "delivered" && order.shipping?.actualDeliveryDate
      ? `Entregado el ${formatOrderDate(order.shipping.actualDeliveryDate, "day")}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const heading =
    onlineResult === "approved"
      ? activeOrder.status === OrderStatus.PAID
        ? PREORDER_PAY_COPY.balancePaidTitle
        : PREORDER_PAY_COPY.installmentReceivedTitle
      : paymentReturn && paymentResult === "approved"
        ? depositReturn
          ? "¡Listo! Recibimos tu anticipo"
          : "¡Gracias por tu compra!"
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
          {confirmingReturn ? (
            <div
              role="status"
              data-testid="payment-return-status"
              className="flex max-w-2xl items-start gap-3 rounded-xl border border-kawaii-blue bg-kawaii-blue-light/60 p-3 text-[15px] text-sky-950"
            >
              {returnWindowOver ? (
                <p>
                  <strong>Tu pago sigue en confirmación.</strong> La pasarela
                  aún no nos responde. Apenas llegue la confirmación te avisamos
                  por WhatsApp o correo; no tienes que pagar de nuevo.{" "}
                  <a
                    href={getOrderSupportWhatsAppUrl(orderNumber)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold underline underline-offset-4"
                  >
                    ¿Tienes dudas? Escríbenos por WhatsApp
                  </a>
                </p>
              ) : (
                <>
                  <Loader2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                  <p>
                    <strong>Estamos confirmando tu pago…</strong> Suele tardar
                    unos segundos; esta página se actualiza sola.
                  </p>
                </>
              )}
            </div>
          ) : (
            <p className="max-w-2xl text-[15px] text-foreground">{stage.description}</p>
          )}
          <OrderGiftNotice order={activeOrder} />
          <OrderGiftCardPurchaseNotice order={activeOrder} />
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
          {!digital && order.shipping && (
            <OrderShippingCard
              order={activeOrder}
              awaitingPayment={awaitingPayment}
              trackingEvents={trackingEvents}
              canRefreshTracking={canRefreshTracking}
              isRefreshingTracking={trackingStatus === "pending"}
              onRefreshTracking={async () =>
                trackShipment({
                  orderId: order.id,
                  sessionToken: await getToken(),
                })
              }
            />
          )}
          {activeOrder.capsule && <OrderCapsuleCard capsule={activeOrder.capsule} />}
          <OrderItemsCard
            order={activeOrder}
            allowReorder={!digital && !activeOrder.capsule && stage.stage !== "unpaid" && stage.stage !== "verifying"}
          />
          <OrderHelpCard orderNumber={orderNumber} />
        </div>

        <div className="order-1 flex flex-col gap-5 lg:sticky lg:top-[calc(var(--storefront-header-offset)+16px)] lg:order-2">
          <OrderSummaryCard
            order={activeOrder}
            stage={stage}
            // Volviendo de la pasarela con el pago sin confirmar, ofrecer pagar
            // otra vez invitaría a un doble cobro.
            awaitingPayment={awaitingPayment && !confirmingReturn}
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
