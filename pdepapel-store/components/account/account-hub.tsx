"use client";

import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Bookmark,
  ChevronRight,
  Gift,
  Heart,
  Lock,
  LogOut,
  MapPin,
  MessageCircle,
  Package,
  Settings,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { getSavedSearches } from "@/actions/account-saved-searches";
import { deleteCustomerAddress, getCustomerAddresses, type CustomerAddress } from "@/actions/customer-addresses";
import { getOrders } from "@/actions/get-orders";
import { getWelcomeBenefit } from "@/actions/get-welcome-benefit";
import { AccountHubSkeleton } from "@/components/account/account-hub-skeleton";
import { OrderStageBadge } from "@/components/order-stage-badge";
import { Button } from "@/components/ui/button";
import { Currency } from "@/components/ui/currency";
import { PaymentMethod } from "@/constants";
import { useWishlist } from "@/hooks/use-wishlist";
import { useToast } from "@/hooks/use-toast";
import { formatOrderDate } from "@/lib/order-dates";
import { getOrderStage, isAwaitingPayment } from "@/lib/order-status";
import { orderPath, STOREFRONT_ROUTES } from "@/lib/routes";
import { cn, currencyFormatter } from "@/lib/utils";
import { Icons } from "@/components/icons";

const SUPPORT_WHATSAPP_URL =
  "https://wa.me/573132582293?text=" +
  encodeURIComponent("¡Hola! Tengo una duda sobre mi cuenta en la tienda.");

function Tile({
  icon: Icon,
  tint,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  tint: string;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 rounded-2xl border border-pink-shell/30 bg-white p-5 shadow-[0_4px_20px_hsl(280_30%_70%/0.15)]"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-blue-yankees", tint)}
        >
          <Icon className="h-5 w-5" />
        </span>
        <h2 className="font-serif text-lg font-bold text-blue-yankees">{title}</h2>
      </div>
      <div className="flex flex-1 flex-col gap-2 text-sm text-muted-foreground">{children}</div>
      {action && <div className="pt-1">{action}</div>}
    </section>
  );
}

function TileLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-[40px] items-center gap-1 font-sans text-sm font-semibold text-blue-yankees underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink focus-visible:ring-offset-2"
    >
      {children}
      <ChevronRight aria-hidden="true" className="h-4 w-4" />
    </Link>
  );
}

function formatAddress(address: CustomerAddress) {
  return [
    [address.address, address.address2].filter(Boolean).join(", "),
    [address.city, address.department].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function AccountHub() {
  const { user, isLoaded: userLoaded } = useUser();
  const { userId, isLoaded, getToken } = useAuth();
  const { openUserProfile, signOut } = useClerk();
  const wishlistItems = useWishlist((state) => state.items);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const enabled = isLoaded && Boolean(userId);
  const token = async () => {
    const sessionToken = await getToken();
    if (!sessionToken) throw new Error("No session token available");
    return sessionToken;
  };

  const orders = useQuery({
    queryKey: ["orders", userId],
    queryFn: async () => getOrders(await token()),
    enabled,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const addresses = useQuery({
    queryKey: ["customer-addresses", userId],
    queryFn: async () => getCustomerAddresses(await token()),
    enabled,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const searches = useQuery({
    queryKey: ["saved-searches", userId],
    queryFn: async () => getSavedSearches(await token()),
    enabled,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const benefit = useQuery({
    queryKey: ["welcome-benefit", userId],
    queryFn: async () => getWelcomeBenefit(await token()),
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const removeAddress = useMutation({
    mutationFn: async (addressId: string) => {
      await deleteCustomerAddress(addressId, await token());
      return addressId;
    },
    onSuccess: (addressId) => {
      queryClient.setQueryData<CustomerAddress[]>(["customer-addresses", userId], (current) =>
        current?.filter((address) => address.id !== addressId) ?? [],
      );
      toast({ variant: "success", description: "Dirección eliminada." });
    },
    onError: () =>
      toast({ variant: "destructive", description: "No pudimos eliminar la dirección. Inténtalo de nuevo." }),
  });

  const sortedOrders = useMemo(
    () =>
      [...(orders.data ?? [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [orders.data],
  );
  const pendingOrder = sortedOrders.find((order) => isAwaitingPayment(order));
  const latestOrder = sortedOrders[0];

  if (!isLoaded || !userLoaded || (enabled && orders.isPending)) {
    return <AccountHubSkeleton />;
  }

  // The middleware already redirects signed-out visitors; this only covers a
  // session that expired while the page was open.
  if (!userId) {
    return <AccountHubSkeleton />;
  }

  const firstName = user?.firstName?.trim();
  const email = user?.primaryEmailAddress?.emailAddress;
  const since = user?.createdAt ? formatOrderDate(user.createdAt, "day") : null;
  const defaultAddress = addresses.data?.find((address) => address.isDefault) ?? addresses.data?.[0];
  const priceDrops = wishlistItems.filter(
    (item) => item.originalPrice && Number(item.originalPrice) > Number(item.price),
  ).length;

  return (
    <>
      <section className="bg-kawaii-pink-light/15 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {user?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.imageUrl}
                alt=""
                width={56}
                height={56}
                className="h-14 w-14 rounded-full border-2 border-white object-cover shadow-sm"
              />
            ) : (
              <span
                aria-hidden="true"
                className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-kawaii-pink-light font-serif text-xl font-bold text-blue-yankees"
              >
                {(firstName ?? email ?? "?").charAt(0).toUpperCase()}
              </span>
            )}
            <div>
              <h1 className="font-serif text-3xl font-bold text-blue-yankees sm:text-4xl">
                {firstName ? `Hola, ${firstName}` : "Mi cuenta"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {[email, since ? `cliente desde ${since}` : null].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => openUserProfile()}
              className="gap-2 rounded-full border-[1.5px] border-blue-yankees font-sans font-semibold text-blue-yankees"
            >
              <Settings aria-hidden="true" className="h-4 w-4" />
              Editar mis datos
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => signOut({ redirectUrl: STOREFRONT_ROUTES.home })}
              className="gap-2 rounded-full font-sans font-semibold"
            >
              <LogOut aria-hidden="true" className="h-4 w-4" />
              Cerrar sesión
            </Button>
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-screen-2xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {pendingOrder && (
          <section
            role="status"
            aria-label="Pedido por pagar"
            className="flex flex-col gap-3 rounded-2xl border border-kawaii-yellow bg-kawaii-yellow-light/50 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-yellow-800"
              >
                <Lock className="h-5 w-5" />
              </span>
              <p className="text-sm text-yellow-950">
                <strong>Tienes un pedido por pagar</strong> · #{pendingOrder.orderNumber} ·{" "}
                {currencyFormatter.format(pendingOrder.total)} · {getOrderStage(pendingOrder).label}
              </p>
            </div>
            <Button asChild className="rounded-full font-sans font-bold">
              <Link
                href={
                  pendingOrder.payment?.method === PaymentMethod.Bold
                    ? `${orderPath(pendingOrder.id)}?autoPay=true`
                    : orderPath(pendingOrder.id)
                }
              >
                {pendingOrder.payment?.method === PaymentMethod.BankTransfer ? "Ver instrucciones" : "Pagar ahora"}
              </Link>
            </Button>
          </section>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Tile
            icon={Package}
            tint="bg-kawaii-blue-light"
            title="Mis pedidos"
            action={<TileLink href={STOREFRONT_ROUTES.myOrders}>Ver pedidos</TileLink>}
          >
            {orders.isError ? (
              <p>No pudimos cargar tus pedidos ahora mismo.</p>
            ) : sortedOrders.length === 0 ? (
              <p>Todavía no tienes pedidos. Cuando compres, aquí verás el estado y la guía de cada uno.</p>
            ) : (
              <>
                <p>
                  {sortedOrders.length === 1 ? "1 pedido" : `${sortedOrders.length} pedidos`}
                  {latestOrder && ` · el último el ${formatOrderDate(latestOrder.createdAt, "day")}`}
                </p>
                {latestOrder && (
                  <Link
                    href={orderPath(latestOrder.id)}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-foreground hover:border-blue-yankees"
                  >
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="font-quicksand text-sm font-bold text-blue-yankees">#{latestOrder.orderNumber}</span>
                      <OrderStageBadge stage={getOrderStage(latestOrder)} size="sm" className="w-fit" />
                    </span>
                    <Currency value={latestOrder.total} className="text-sm font-bold text-blue-yankees" />
                  </Link>
                )}
              </>
            )}
          </Tile>

          <Tile
            icon={MapPin}
            tint="bg-kawaii-mint-light"
            title="Direcciones guardadas"
            action={
              <p className="text-xs text-muted-foreground">
                Las direcciones se guardan al comprar; en el checkout eliges cuál usar.
              </p>
            }
          >
            {addresses.isPending ? (
              <p>Cargando…</p>
            ) : addresses.isError ? (
              <p>No pudimos cargar tus direcciones ahora mismo.</p>
            ) : !addresses.data || addresses.data.length === 0 ? (
              <p>Aún no tienes direcciones guardadas. Se guardan cuando compras con tu cuenta.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {addresses.data.map((address) => (
                  <li
                    key={address.id}
                    className="flex items-start justify-between gap-2 rounded-xl border border-border p-3 text-foreground"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2 font-sans text-sm font-semibold text-blue-yankees">
                        {address.label || address.fullName || "Dirección"}
                        {address.id === defaultAddress?.id && (
                          <span className="rounded-full bg-kawaii-mint-light px-2 py-0.5 text-[11px] font-bold text-emerald-900">
                            Principal
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatAddress(address)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAddress.mutate(address.id)}
                      disabled={removeAddress.isPending}
                      aria-label={`Eliminar la dirección ${address.label || address.address}`}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink"
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Tile>

          <Tile
            icon={Heart}
            tint="bg-kawaii-pink-light"
            title="Favoritos"
            action={<TileLink href={STOREFRONT_ROUTES.wishlist}>Ver favoritos</TileLink>}
          >
            <p>
              {wishlistItems.length === 0
                ? "Todavía no has guardado favoritos. Toca el corazón de un producto para tenerlo aquí."
                : `${wishlistItems.length === 1 ? "1 producto" : `${wishlistItems.length} productos`}${
                    priceDrops > 0
                      ? ` · ${priceDrops === 1 ? "1 bajó de precio" : `${priceDrops} bajaron de precio`}`
                      : ""
                  }`}
            </p>
          </Tile>

          <Tile
            icon={Bookmark}
            tint="bg-kawaii-lavender-light"
            title="Búsquedas guardadas"
            action={<TileLink href={STOREFRONT_ROUTES.savedSearches}>Ver búsquedas</TileLink>}
          >
            {searches.isPending ? (
              <p>Cargando…</p>
            ) : searches.isError ? (
              <p>No pudimos cargar tus búsquedas ahora mismo.</p>
            ) : !searches.data || searches.data.length === 0 ? (
              <p>Guarda una combinación de filtros desde la tienda y vuelve a ella en un clic.</p>
            ) : (
              <p>
                {searches.data.length === 1 ? "1 búsqueda guardada" : `${searches.data.length} búsquedas guardadas`}
                {" · "}
                la más reciente: <strong className="text-foreground">{searches.data[0].name}</strong>
              </p>
            )}
          </Tile>

          <Tile icon={Bell} tint="bg-kawaii-yellow-light" title="Boletín">
            <p>
              Novedades y ofertas por correo, solo si te suscribes desde el formulario al pie de cualquier
              página. Cada correo trae su enlace para cancelar sin iniciar sesión.
            </p>
          </Tile>

          <Tile
            icon={Gift}
            tint="bg-kawaii-peach"
            title="Beneficio de bienvenida"
            action={
              benefit.data ? (
                <TileLink href={STOREFRONT_ROUTES.shop}>Ir a comprar</TileLink>
              ) : undefined
            }
          >
            {benefit.isPending ? (
              <p>Cargando…</p>
            ) : benefit.data ? (
              <p className="text-foreground">
                <strong>
                  {benefit.data.type === "PERCENTAGE"
                    ? `${benefit.data.amount} % de descuento`
                    : `${currencyFormatter.format(benefit.data.amount)} de descuento`}
                </strong>{" "}
                en tu primera compra con esta cuenta
                {benefit.data.minOrderValue && benefit.data.minOrderValue > 0
                  ? ` (desde ${currencyFormatter.format(benefit.data.minOrderValue)})`
                  : ""}
                . Se aplica con el código <span className="font-quicksand font-bold">{benefit.data.code}</span> en el
                checkout hasta el {formatOrderDate(benefit.data.endDate, "day")}.
              </p>
            ) : (
              <p>Ya usaste tu beneficio de bienvenida, o no hay uno activo en este momento.</p>
            )}
          </Tile>
        </div>

        <section className="flex flex-col gap-3 rounded-2xl border border-pink-shell/30 bg-white p-5 shadow-[0_4px_20px_hsl(280_30%_70%/0.15)] sm:flex-row sm:items-center">
          <span
            aria-hidden="true"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-kawaii-mint-light text-green-700"
          >
            <MessageCircle className="h-5 w-5" />
          </span>
          <div className="flex-1 text-sm">
            <p className="font-sans font-semibold text-blue-yankees">¿Necesitas ayuda?</p>
            <p className="text-muted-foreground">
              Respondemos en 12 a 24 horas, todos los días de 8:00 a. m. a 8:00 p. m. Políticas de{" "}
              <Link href={STOREFRONT_ROUTES.shippingPolicy} className="font-semibold text-blue-yankees underline underline-offset-4">
                envíos
              </Link>
              ,{" "}
              <Link href={STOREFRONT_ROUTES.returnsPolicy} className="font-semibold text-blue-yankees underline underline-offset-4">
                cambios
              </Link>{" "}
              y{" "}
              <Link href={STOREFRONT_ROUTES.dataPolicy} className="font-semibold text-blue-yankees underline underline-offset-4">
                datos
              </Link>
              .
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            className="gap-2 rounded-full border-[1.5px] border-blue-yankees font-sans font-semibold text-blue-yankees"
          >
            <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
              <Icons.whatsapp className="h-4 w-4" aria-hidden="true" />
              WhatsApp
            </a>
          </Button>
        </section>
      </div>
    </>
  );
}
