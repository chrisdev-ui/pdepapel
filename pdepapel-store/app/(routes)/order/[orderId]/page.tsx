import { auth } from "@clerk/nextjs";
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
  Truck,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { getOrder } from "@/actions/get-order";
import { Icons } from "@/components/icons";
import { Container } from "@/components/ui/container";
import { Currency } from "@/components/ui/currency";
import { OrderStatus, ShippingStatus, steps } from "@/constants";
import { cn } from "@/lib/utils";
import { Courier } from "./components/courier";

export const revalidate = 0;

export default async function OrderPage({
  params,
}: {
  params: { orderId: string };
}) {
  const order = await getOrder(params.orderId);
  const { userId } = auth();
  const addresses = order?.address.split(",");
  const shippingStatus = steps.slice(
    0,
    Object.values(ShippingStatus).indexOf(
      (order?.shipping?.status as ShippingStatus) ?? ShippingStatus.Preparing,
    ) + 1,
  );
  const status: {
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

  const orderItemsTotal = order?.orderItems?.reduce(
    (sum, item) => sum + Number(item.product.price) * item.quantity,
    0,
  );

  return (
    <>
      {userId === order?.userId && (
        <Container>
          <div className="mt-5 flex items-center justify-center gap-5">
            <div className="relative h-20 w-20">
              <Image
                src="/images/no-text-lightpink-bg.webp"
                alt="Logo P de Papel No Text"
                fill
                sizes="(max-width: 640px) 100vw, 640px"
                quality={100}
                className="rounded-full object-cover"
              />
            </div>
            <h1 className="font-serif text-3xl font-extrabold">
              ¡Muchas Gracias!
            </h1>
          </div>
          <div className="mt-8 inline-block text-center text-xl md:flex md:items-center md:justify-center md:text-2xl">
            Tu orden
            <strong className="mx-1 inline-block text-sm underline md:mx-2 md:block md:text-xl">{`#${params.orderId}`}</strong>
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
                <span>{order.fullName}</span>
                {addresses?.map((address, index) => (
                  <span key={`${address}+${index}`}>{address}</span>
                ))}
                <span className="flex gap-1">
                  {" "}
                  <Icons.flags.colombia className="h-4 w-4" /> Colombia
                </span>
                {order.phone && (
                  <span className="flex gap-1">
                    <Phone className="h-4 w-4" />
                    {`+57${order.phone}`}
                  </span>
                )}
              </div>
            </div>
            <div className="flex border-b p-7 md:border-b-0 md:border-r lg:p-14">
              <div className="flex flex-col text-xs leading-5">
                <Truck className="h-8 w-8" />
                <div className="mb-4 font-serif text-base">
                  Estado del envío
                </div>
                <div className="flex flex-col space-y-3">
                  {(order?.shipping?.courier ||
                    order?.shipping?.trackingCode) && (
                    <div className="flex flex-col gap-1">
                      <span>Empresa transportadora:</span>
                      <div className="flex w-full flex-wrap items-center gap-2">
                        <Courier name={order.shipping?.courier ?? ""} />
                        <span>
                          No. guía: {order.shipping?.trackingCode ?? "N/D"}
                        </span>
                      </div>
                    </div>
                  )}
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
                    {status[order?.status as OrderStatus].icon}
                    <span>{status[order?.status as OrderStatus].text}</span>
                  </div>
                  {order.status !== OrderStatus.PAID && (
                    <small>
                      *** Recuerda que si pagas por transferencia bancaria debes
                      enviar un mensaje al número de WhatsApp
                      <Icons.whatsapp className="mx-1 inline-flex h-3 w-3 text-green-600" />
                      <strong className="font-serif">321-629-9845</strong> con
                      el comprobante de pago del depósito hecho a la cuenta
                      Bancolombia
                      <Icons.payments.bancolombiaButton className="mx-1 inline-flex h-3 w-3" />
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
                {order?.orderItems.map(({ product, quantity, id }) => (
                  <div
                    key={product.id}
                    className="flex w-full items-start justify-between py-4 pl-0 pr-3"
                  >
                    <div className="flex items-start justify-start gap-2 lg:gap-8">
                      <Link href={`/product/${product.id}`}>
                        <div className="relative h-20 w-20">
                          <Image
                            src={product.images?.[0].url}
                            alt={product.images?.[0].id}
                            fill
                            sizes="(max-width: 640px) 100vw, 640px"
                            quality={100}
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
                    value={orderItemsTotal}
                  />
                </div>
                {order.shipping && (
                  <div className="flex w-full justify-between">
                    <span>Envío y manejo:</span>
                    <Currency
                      className="text-base lg:text-lg"
                      value={order.shipping.cost}
                    />
                  </div>
                )}
                <div className="flex w-full justify-between">
                  <span>Otros impuestos:</span>
                  <Currency className="text-base lg:text-lg" value={0} />
                </div>
              </div>
              <div className="flex w-full px-0 py-8 text-xl">
                <div className="flex w-full justify-between">
                  <span>Total</span>
                  <Currency
                    value={orderItemsTotal + Number(order.shipping?.cost ?? 0)}
                  />
                </div>
              </div>
            </div>
          </div>
        </Container>
      )}
      {userId !== order?.userId && (
        <Container>
          <div></div>
        </Container>
      )}
      {!userId && order?.userId === "guest" && (
        <Container>
          <div></div>
        </Container>
      )}
      {!userId && !order && (
        <Container>
          <div></div>
        </Container>
      )}
    </>
  );
}
