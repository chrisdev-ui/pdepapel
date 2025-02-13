"use client";

import { useAuth } from "@clerk/nextjs";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Store } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { getOrders } from "@/actions/get-orders";
import { Loader } from "@/components/loader";
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
import { Order } from "@/types";

export const OrderHistory: React.FC<{}> = () => {
  const { userId } = useAuth();
  const [orders, setOrders] = useState<Order[]>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getOrderHistory = async () => {
      if (userId) {
        const orders = await getOrders({ userId });
        setOrders(orders);
        setLoading(false);
      }
    };
    getOrderHistory();
  }, [userId]);

  if (loading) {
    return <Loader label="Cargando tus órdenes" />;
  }

  if (!orders?.length) {
    return (
      <Container className="space-y-10">
        <NoResults message={`No hay ordenes a tu nombre ${KAWAII_FACE_SAD}`} />
        <div>
          <Link href="/shop">
            <Button className="w-full">
              {" "}
              <Store className="mr-2 h-5 w-5" /> Ir a la tienda
            </Button>
          </Link>
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
                <Link href={`/order/${order.id}`}>
                  <Button className="w-full">Ver detalles</Button>
                </Link>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>
    </Container>
  );
};
