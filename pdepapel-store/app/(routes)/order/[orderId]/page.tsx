import { SignedIn, SignedOut, auth } from "@clerk/nextjs";
import { format } from "date-fns";
import { Clock, MapPin, Phone, Printer, Truck } from "lucide-react";
import Image from "next/image";

import { getOrder } from "@/actions/get-order";
import { Icons } from "@/components/icons";
import { Container } from "@/components/ui/container";
import { ShippingStatus, steps } from "@/constants";
import { es } from "date-fns/locale";

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
  return (
    <>
      <SignedIn>
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
              <span className="underline">Print</span>
            </button>
          </div>
          <div className="my-10 grid grid-flow-row grid-cols-1 gap-0 border border-solid md:grid-cols-3">
            <div className="border-input-border-color flex border-b border-solid p-7 md:border-b-0 md:border-r lg:p-14">
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
            <div className="flex border-b border-solid p-7 md:border-b-0 md:border-r lg:p-14">
              <div className="flex flex-col text-xs leading-5">
                <Truck className="h-8 w-8" />
                <div className="mb-4 font-serif text-base">
                  Estado del envío
                </div>
                <div className="flex flex-col">
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
                            : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Container>
      </SignedIn>
      <SignedOut></SignedOut>
    </>
  );
}
