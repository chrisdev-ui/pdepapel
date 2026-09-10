"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  ChevronRight,
  ExternalLink,
  Lock,
  MapPinned,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { getOrders } from "@/actions/get-orders";
import { OrderHistorySkeleton } from "@/components/order-history-skeleton";
import { OrderStageBadge } from "@/components/order-stage-badge";
import { CldImage } from "@/components/ui/CldImage";
import { Button } from "@/components/ui/button";
import { Currency } from "@/components/ui/currency";
import { PaymentMethod } from "@/constants";
import { formatOrderDate } from "@/lib/order-dates";
import {
  countOrderUnits,
  formatUnits,
  getOrderStage,
  getTrackingUrl,
  type OrderStage,
} from "@/lib/order-status";
import { accountAccessPath, orderPath, STOREFRONT_ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { Order } from "@/types";

type HistoryFilter = "all" | "unpaid" | "active" | "delivered" | "closed";

const FILTERS: { id: HistoryFilter; label: string; stages: OrderStage[] }[] = [
  { id: "all", label: "Todos", stages: [] },
  { id: "unpaid", label: "Por pagar", stages: ["unpaid", "verifying"] },
  { id: "active", label: "En proceso", stages: ["cod", "paid", "shipped", "issue"] },
  { id: "delivered", label: "Entregados", stages: ["delivered"] },
  { id: "closed", label: "Cancelados", stages: ["cancelled"] },
];

const PILL_CLASS =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 font-sans text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2";

function PageHeader({ children }: { children?: React.ReactNode }) {
  return (
    <section className="bg-kawaii-pink-light/15 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-3xl font-bold text-blue-yankees sm:text-4xl">
            Mis pedidos
          </h1>
          {children}
        </div>
        <Button
          asChild
          variant="outline"
          className="gap-2 self-start rounded-full border-[1.5px] border-blue-yankees font-sans font-semibold text-blue-yankees sm:self-auto"
        >
          <Link href={STOREFRONT_ROUTES.shop}>
            Ir a la tienda
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

function orderThumbnails(order: Order) {
  return order.orderItems
    .map(
      (item) =>
        item.imageUrl ||
        item.product?.images?.find((image) => image.isMain)?.url ||
        item.product?.images?.[0]?.url ||
        "",
    )
    .filter(Boolean)
    .slice(0, 3);
}

function OrderCard({ order }: { order: Order }) {
  const stage = getOrderStage(order);
  const href = orderPath(order.id);
  const thumbnails = orderThumbnails(order);
  const units = countOrderUnits(order);
  const carrier = order.shipping?.carrierName || order.shipping?.courier;
  const trackingUrl = getTrackingUrl(order.shipping);

  const detail =
    stage.stage === "shipped" && carrier
      ? `Enviado con ${carrier}`
      : stage.stage === "delivered" && order.shipping?.actualDeliveryDate
        ? `Entregado el ${formatOrderDate(order.shipping.actualDeliveryDate, "day")}`
        : stage.stage === "verifying" && order.payment?.method === PaymentMethod.BankTransfer
          ? "Esperando tu comprobante"
          : null;

  const primaryAction =
    stage.stage === "unpaid"
      ? {
          label: "Pagar ahora",
          href:
            order.payment?.method === PaymentMethod.Bold
              ? `${href}?autoPay=true`
              : href,
          icon: Lock,
          primary: true,
        }
      : stage.stage === "verifying"
        ? { label: "Ver instrucciones", href, icon: ChevronRight, primary: true }
        : stage.stage === "shipped" && trackingUrl
          ? { label: "Rastrear", href: trackingUrl, icon: ExternalLink, external: true }
          : null;

  return (
    <article className="grid gap-4 rounded-2xl border border-pink-shell/30 bg-white p-4 shadow-[0_4px_20px_hsl(280_30%_70%/0.15)] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-5">
      <Link
        href={href}
        aria-hidden="true"
        tabIndex={-1}
        className="hidden sm:flex"
      >
        {thumbnails.length > 0 ? (
          thumbnails.map((url, index) => (
            <span
              key={`${url}-${index}`}
              className={cn(
                "relative h-12 w-12 overflow-hidden rounded-lg border-2 border-white bg-muted",
                index > 0 && "-ml-3",
              )}
            >
              <CldImage src={url} alt="" fill sizes="48px" className="object-cover" />
            </span>
          ))
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-kawaii-lavender-light text-blue-yankees">
            <ShoppingBag aria-hidden="true" className="h-5 w-5" />
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={href}
            className="font-quicksand text-[15px] font-bold text-blue-yankees hover:underline"
          >
            #{order.orderNumber}
          </Link>
          <OrderStageBadge stage={stage} size="sm" />
        </div>
        <p className="text-[13px] text-muted-foreground">
          <time dateTime={order.createdAt}>{formatOrderDate(order.createdAt, "day")}</time>
          {" · "}
          {formatUnits(units)}
          {detail && ` · ${detail}`}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
        <Currency value={order.total} className="text-lg font-bold text-blue-yankees" />
        <div className="flex gap-2">
          {primaryAction && (
            <Button
              asChild
              size="sm"
              variant={primaryAction.primary ? "default" : "outline"}
              className={cn(
                "h-9 gap-1.5 rounded-full px-3.5 font-sans text-[13px] font-semibold",
                !primaryAction.primary && "border-[1.5px] border-blue-yankees text-blue-yankees",
              )}
            >
              {primaryAction.external ? (
                <a href={primaryAction.href} target="_blank" rel="noopener noreferrer">
                  <primaryAction.icon aria-hidden="true" className="h-4 w-4" />
                  {primaryAction.label}
                </a>
              ) : (
                <Link href={primaryAction.href}>
                  <primaryAction.icon aria-hidden="true" className="h-4 w-4" />
                  {primaryAction.label}
                </Link>
              )}
            </Button>
          )}
          <Button
            asChild
            size="sm"
            variant="secondary"
            className="h-9 gap-1 rounded-full px-3.5 font-sans text-[13px] font-semibold"
          >
            <Link href={href} aria-label={`Ver pedido ${order.orderNumber}`}>
              Ver pedido
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

export const OrderHistory: React.FC<{}> = () => {
  const { userId, isLoaded, getToken } = useAuth();
  const [filter, setFilter] = useState<HistoryFilter>("all");

  const {
    data: orders,
    isPending,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["orders", userId],
    queryFn: async () => {
      const sessionToken = await getToken();
      if (!sessionToken) throw new Error("No session token available");

      return getOrders(sessionToken);
    },
    enabled: isLoaded && Boolean(userId),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const sorted = useMemo(
    () =>
      [...(orders ?? [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [orders],
  );

  const counts = useMemo(() => {
    const byFilter = new Map<HistoryFilter, number>();
    for (const item of FILTERS) byFilter.set(item.id, 0);
    for (const order of sorted) {
      const { stage } = getOrderStage(order);
      byFilter.set("all", (byFilter.get("all") ?? 0) + 1);
      for (const item of FILTERS) {
        if (item.stages.includes(stage)) {
          byFilter.set(item.id, (byFilter.get(item.id) ?? 0) + 1);
        }
      }
    }
    return byFilter;
  }, [sorted]);

  const visible = useMemo(() => {
    const active = FILTERS.find((item) => item.id === filter);
    if (!active || active.stages.length === 0) return sorted;
    return sorted.filter((order) => active.stages.includes(getOrderStage(order).stage));
  }, [filter, sorted]);

  // Same skeleton the route-level loading state uses, so the transition from
  // navigation to client fetch is seamless.
  if (!isLoaded || (userId && isPending)) {
    return <OrderHistorySkeleton />;
  }

  if (!userId) {
    return (
      <div className="mx-auto max-w-screen-2xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-3xl border border-pink-shell/30 bg-white p-8 text-center shadow-[0_4px_20px_hsl(280_30%_70%/0.15)]">
          <span
            aria-hidden="true"
            className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-kawaii-lavender-light text-blue-yankees"
          >
            <UserRound className="h-7 w-7" />
          </span>
          <h1 className="font-serif text-3xl font-bold text-blue-yankees">
            Tus pedidos, siempre a la mano
          </h1>
          <p className="text-muted-foreground">
            Inicia sesión o crea una cuenta gratis para ver el estado, la guía y
            el recibo de cada pedido, y usar tus direcciones guardadas.
          </p>
          <ul className="grid w-full gap-2 text-left text-sm text-muted-foreground sm:grid-cols-2">
            <li className="flex items-center gap-2">
              <PackageCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-blue-yankees" />
              Estado y rastreo de cada pedido
            </li>
            <li className="flex items-center gap-2">
              <MapPinned aria-hidden="true" className="h-4 w-4 shrink-0 text-blue-yankees" />
              Direcciones listas para tu próxima compra
            </li>
          </ul>
          <div className="flex w-full flex-col justify-center gap-2 sm:flex-row">
            <Button asChild className="rounded-full font-sans font-bold">
              <Link href={accountAccessPath(STOREFRONT_ROUTES.signIn, STOREFRONT_ROUTES.myOrders)}>
                Iniciar sesión
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="rounded-full border-[1.5px] border-blue-yankees font-sans font-semibold text-blue-yankees"
            >
              <Link href={accountAccessPath(STOREFRONT_ROUTES.signUp, STOREFRONT_ROUTES.myOrders)}>
                Crear cuenta gratis
              </Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            ¿Compraste como invitada? Abre el enlace del correo de confirmación
            para guardar ese pedido en tu cuenta.
          </p>
        </section>
      </div>
    );
  }

  if (isError) {
    return (
      <>
        <PageHeader />
        <div className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8">
          <section
            role="alert"
            className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-3xl border border-pink-shell/30 bg-white p-8 text-center shadow-[0_4px_20px_hsl(280_30%_70%/0.15)]"
          >
            <AlertCircle aria-hidden="true" className="h-8 w-8 text-pink-froly" />
            <h2 className="font-serif text-2xl font-bold text-blue-yankees">
              No pudimos cargar tus pedidos
            </h2>
            <p className="text-muted-foreground">
              Suele ser momentáneo. Tus pedidos están a salvo.
            </p>
            <Button
              variant="outline"
              disabled={isFetching}
              onClick={() => void refetch()}
              className="gap-2 rounded-full border-[1.5px] border-blue-yankees font-sans font-semibold text-blue-yankees"
            >
              <RefreshCw aria-hidden="true" className={cn("h-4 w-4", isFetching && "animate-spin")} />
              {isFetching ? "Reintentando…" : "Reintentar"}
            </Button>
          </section>
        </div>
      </>
    );
  }

  if (sorted.length === 0) {
    return (
      <>
        <PageHeader />
        <div className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8">
          <section className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-3xl border border-pink-shell/30 bg-white p-8 text-center shadow-[0_4px_20px_hsl(280_30%_70%/0.15)]">
            <span
              aria-hidden="true"
              className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-kawaii-yellow-light text-blue-yankees"
            >
              <ShoppingBag className="h-7 w-7" />
            </span>
            <h2 className="font-serif text-2xl font-bold text-blue-yankees">
              Todavía no tienes pedidos
            </h2>
            <p className="text-muted-foreground">
              Cuando compres, aquí verás cada pedido con su estado y su guía.
            </p>
            <Button asChild className="rounded-full font-sans font-bold">
              <Link href={STOREFRONT_ROUTES.shop}>Explorar la tienda</Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              ¿Compraste como invitada? Abre el enlace del correo de confirmación
              para guardar ese pedido en tu cuenta.
            </p>
          </section>
        </div>
      </>
    );
  }

  const oldest = sorted[sorted.length - 1];

  return (
    <>
      <PageHeader>
        <p className="text-muted-foreground">
          {sorted.length === 1
            ? "1 pedido"
            : `${sorted.length} pedidos desde ${formatOrderDate(oldest.createdAt, "day")}`}
          . Aquí ves el estado, la guía y el recibo de cada uno.
        </p>
      </PageHeader>
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div
          role="group"
          aria-label="Filtrar pedidos por estado"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {FILTERS.map((item) => {
            const count = counts.get(item.id) ?? 0;
            const active = filter === item.id;
            if (item.id !== "all" && count === 0) return null;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(item.id)}
                className={cn(
                  PILL_CLASS,
                  active
                    ? "border-blue-yankees bg-blue-yankees text-white"
                    : "border-border bg-white text-blue-yankees hover:border-blue-yankees",
                )}
              >
                {item.label}
                <span className={cn("text-xs", active ? "text-white/80" : "text-muted-foreground")}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <ul className="flex flex-col gap-3" aria-live="polite">
          {visible.map((order) => (
            <li key={order.id}>
              <OrderCard order={order} />
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground">
          ¿Compraste como invitada? Abre el enlace del correo de confirmación
          para guardar ese pedido en tu cuenta.
        </p>
      </div>
    </>
  );
};
