"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { LogIn, MapPinned, PackageCheck, Store } from "lucide-react";
import Link from "next/link";

import { getOrders } from "@/actions/get-orders";
import { OrderHistorySkeleton } from "@/components/order-history-skeleton";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Currency } from "@/components/ui/currency";
import { NoResults } from "@/components/ui/no-results";
import { KAWAII_FACE_SAD, OrderStatus, ShippingStatus } from "@/constants";
import { accountAccessPath, orderPath, STOREFRONT_ROUTES } from "@/lib/routes";
import { Order } from "@/types";

export const OrderHistory: React.FC<{}> = () => {
  const { userId, isLoaded, getToken } = useAuth();

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

  // Same skeleton the route-level loading state uses, so the transition from
  // navigation to client fetch is seamless.
  if (!isLoaded || (userId && isPending)) {
    return <OrderHistorySkeleton />;
  }

  if (!userId) {
    return (
      <Container className="space-y-6">
        <div className="rounded-2xl border-2 border-purple-100 bg-gradient-to-br from-purple-50 to-pink-50 p-6 text-center shadow-sm">
          <h1 className="font-serif text-2xl font-extrabold">
            Tus pedidos, siempre a la mano
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Inicia sesión o crea una cuenta gratis para consultar tus pedidos,
            guardar direcciones para futuras compras y conservar tus favoritos.
            Si compraste como invitado, abre el detalle desde tu correo para
            guardar ese pedido en tu cuenta.
          </p>
          <ul className="mx-auto mt-5 grid max-w-xl gap-2 text-left text-sm text-muted-foreground sm:grid-cols-2">
            <li className="flex items-center gap-2">
              <PackageCheck className="h-4 w-4 shrink-0 text-purple-600" />
              Consulta y sigue tus pedidos
            </li>
            <li className="flex items-center gap-2">
              <MapPinned className="h-4 w-4 shrink-0 text-purple-600" />
              Elige direcciones guardadas
            </li>
          </ul>
          <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild>
              <Link
                href={accountAccessPath(
                  STOREFRONT_ROUTES.signIn,
                  STOREFRONT_ROUTES.myOrders,
                )}
              >
                <LogIn className="mr-2 h-5 w-5" /> Iniciar sesión
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link
                href={accountAccessPath(
                  STOREFRONT_ROUTES.signUp,
                  STOREFRONT_ROUTES.myOrders,
                )}
              >
                Crear cuenta
              </Link>
            </Button>
          </div>
        </div>
      </Container>
    );
  }

  if (isError) {
    return (
      <Container className="space-y-6">
        <NoResults message="No pudimos cargar tus pedidos. Inténtalo de nuevo en unos minutos." />
        <div>
          <Button
            className="w-full"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching ? "Reintentando…" : "Reintentar"}
          </Button>
        </div>
      </Container>
    );
  }

  if (!orders?.length) {
    return (
      <Container className="space-y-10">
        <NoResults message={`No hay ordenes a tu nombre ${KAWAII_FACE_SAD}`} />
        <div>
          <Button asChild className="w-full">
            <Link href={STOREFRONT_ROUTES.shop}>
              <Store className="mr-2 h-5 w-5" /> Ir a la tienda
            </Link>
          </Button>
        </div>
      </Container>
    );
  }

  const shippingStatus = (status: ShippingStatus) => {
    switch (status) {
      case ShippingStatus.Preparing:
        return "En preparación";
      case ShippingStatus.Shipped:
        return "Enviado";
      case ShippingStatus.InTransit:
        return "En tránsito";
      case ShippingStatus.Delivered:
        return "Entregado";
      case ShippingStatus.Returned:
        return "Devuelto";
    }
  };

  return (
    <Container className="space-y-10">
      <h2 className="text-center font-serif text-2xl font-extrabold">
        Historial de órdenes
      </h2>
      <div className="flex h-full w-full flex-col gap-4">
        {orders.map((order) => (
          <Card key={order.id}>
            <CardHeader>
              <CardTitle className="flex w-full flex-wrap items-center justify-between font-serif text-lg">
                <div className="flex gap-1">{order.orderNumber}</div>
                <Currency
                  value={order.total + Number(order?.shipping?.cost ?? 0)}
                />
              </CardTitle>
              <CardDescription className="flex flex-wrap items-center justify-between gap-y-2 text-xs">
                <span>
                  Creada el{" "}
                  {format(new Date(order.createdAt), "PPP", { locale: es })}
                </span>
                <span>
                  Estado de la orden:{" "}
                  {order.status === OrderStatus.PAID
                    ? "Pagada"
                    : order.status === OrderStatus.CANCELLED
                      ? "Cancelada"
                      : "Pendiente de pago"}
                </span>
                <span>
                  Estado del envío:{" "}
                  {order?.shipping?.status
                    ? shippingStatus(order.shipping.status as ShippingStatus)
                    : shippingStatus(ShippingStatus.Preparing)}
                </span>
                <span>Número de productos: {order.orderItems.length}</span>
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <div className="w-full">
                <Button asChild className="w-full">
                  <Link href={orderPath(order.id)}>Ver detalles</Link>
                </Button>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>
    </Container>
  );
};
