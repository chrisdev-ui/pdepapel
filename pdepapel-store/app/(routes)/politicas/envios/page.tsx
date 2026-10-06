import { Clock, Gift, PackageCheck, Truck } from "lucide-react";
import { Metadata } from "next";
import Link from "next/link";

import { getStorefrontSettings } from "@/actions/get-storefront-settings";
import { PolicyPage, type PolicyFact, type PolicySection } from "@/components/policy/policy-page";
import { BASE_URL } from "@/constants";
import { STANDARD_SHIPPING_RATE, TRANSIT_DAYS } from "@/lib/commerce-policies";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { currencyFormatter } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Política de envíos",
  description:
    "Cómo, cuándo y cuánto cuesta recibir tu pedido de Papelería P de Papel: tiempos de entrega, costo del envío, transportadoras, guía de rastreo y qué hacer si no estás en casa.",
  alternates: {
    canonical: STOREFRONT_ROUTES.shippingPolicy,
  },
  openGraph: {
    url: `${BASE_URL}${STOREFRONT_ROUTES.shippingPolicy}`,
  },
};

export const revalidate = 300;

export default async function ShippingPolicyPage() {
  const { freeShippingThreshold, deliveryEstimate } = await getStorefrontSettings();
  const freeShippingLabel = freeShippingThreshold
    ? currencyFormatter.format(freeShippingThreshold)
    : null;

  const facts: PolicyFact[] = [
    ...(deliveryEstimate
      ? [
          {
            icon: Clock,
            tint: "bg-kawaii-blue-light",
            value: deliveryEstimate,
            label: "desde que se confirma el pago",
          } satisfies PolicyFact,
        ]
      : []),
    freeShippingLabel
      ? {
          icon: Gift,
          tint: "bg-kawaii-mint-light",
          value: `Envío gratis desde ${freeShippingLabel}`,
          label: "en productos, a toda Colombia",
        }
      : {
          icon: Gift,
          tint: "bg-kawaii-mint-light",
          value: "Sin cargos ocultos",
          label: "el envío que ves es el que pagas",
        },
    {
      icon: Truck,
      tint: "bg-kawaii-yellow-light",
      value: "Guía y rastreo",
      label: "en Mis pedidos y en tu correo",
    },
  ];

  const sections: PolicySection[] = [
    {
      id: "tiempos-de-entrega",
      title: "Tiempos de entrega",
      content: (
        <>
          <p>
            Preparamos y despachamos los pedidos desde Medellín el mismo día si
            el pago se confirma antes de las 12:00 m. (hora de Colombia), de
            lunes a viernes; si no, el siguiente día hábil.{" "}
            {deliveryEstimate ? (
              <>
                Desde que se confirma el pago, el pedido llega en{" "}
                <strong>{deliveryEstimate}</strong>, según el destino.
              </>
            ) : (
              <>
                A partir del despacho, el tiempo depende de la ciudad de destino
                y de la transportadora.
              </>
            )}{" "}
            En el checkout ves el tiempo estimado de cada transportadora antes
            de pagar.
          </p>
          <ul>
            <li>
              En Medellín y el área metropolitana el pedido normalmente llega en
              1 a 2 días hábiles.
            </li>
            <li>
              En Bogotá y el resto del país, la transportadora entrega en{" "}
              {TRANSIT_DAYS.min} a {TRANSIT_DAYS.max} días hábiles después del
              despacho. En algunos municipios con menos cobertura puede tardar
              un poco más.
            </li>
            <li>
              Los pedidos pagados el fin de semana o en días festivos se
              despachan el siguiente día hábil.
            </li>
            <li>
              Si necesitas una entrega urgente, escríbenos antes de comprar y
              te decimos si podemos acelerarla.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "costo-del-envio",
      title: "Costo del envío",
      content: (
        <>
          {/* La tarifa de referencia es la misma de Merchant Center y del
              marcado (lib/commerce-policies.ts); no se escribe a mano. */}
          <p>
            El costo lo calcula la transportadora según tu ciudad y el tamaño
            del paquete, y lo ves en el checkout antes de pagar. La tarifa
            nacional de referencia ronda los{" "}
            <strong>{currencyFormatter.format(STANDARD_SHIPPING_RATE)}</strong>;
            en Medellín y el área metropolitana suele ser menor, entre $ 7.000
            y $ 10.000.{" "}
            <strong>Sin cargos ocultos: el envío que ves es el que pagas.</strong>
          </p>
          {freeShippingLabel ? (
            <p>
              Cuando el valor de los productos llega a{" "}
              <strong>{freeShippingLabel}</strong> o más, el envío es gratis a
              cualquier ciudad con cobertura. Cuenta el valor de los productos
              antes de aplicar cupones, y el descuento se aplica solo en el
              checkout.
            </p>
          ) : null}
        </>
      ),
    },
    {
      id: "transportadoras-y-guia",
      title: "Transportadoras y guía de rastreo",
      content: (
        <>
          <p>
            Enviamos con transportadoras nacionales según la cobertura de tu
            ciudad. Cuando el pedido sale, generamos la guía y te la enviamos
            por correo; también puedes verla y rastrearla desde{" "}
            <Link href={STOREFRONT_ROUTES.myOrders}>Mis pedidos</Link> o desde
            el enlace del pedido que recibiste al comprar.
          </p>
          <p>
            Algunas transportadoras admiten pago contra entrega en ciertas
            ciudades; cuando está disponible, lo verás como opción en el
            checkout.
          </p>
        </>
      ),
    },
    {
      id: "si-no-estas-en-casa",
      title: "Si no estás en casa",
      content: (
        <ul>
          <li>
            Cualquier persona presente en la dirección puede recibir el pedido
            en tu nombre.
          </li>
          <li>
            Si nadie puede recibirlo, la transportadora reprograma la entrega.
            En entregas propias en Medellín esperamos hasta 15 minutos antes de
            reprogramar.
          </li>
          <li>
            Si en el segundo intento tampoco hay quien reciba, un tercer intento
            puede tener costo adicional.
          </li>
        </ul>
      ),
    },
    {
      id: "recibir-el-pedido",
      title: "Al recibir el pedido",
      content: (
        <>
          <p>
            Revisa el paquete al recibirlo. Si llegó con daños, falta algo o no
            es lo que pediste, escríbenos el mismo día con una foto y lo
            resolvemos: mira{" "}
            <Link href={STOREFRONT_ROUTES.returnsPolicy}>cambios y devoluciones</Link>.
          </p>
        </>
      ),
    },
  ];

  return (
    <PolicyPage
      eyebrow="Política de envíos"
      eyebrowIcon={PackageCheck}
      eyebrowClassName="bg-kawaii-mint-light text-emerald-900"
      title="Envíos y entregas"
      lede="Cómo, cuándo y cuánto cuesta recibir tu pedido. Lo que dice aquí es lo mismo que ves en el checkout."
      updatedAt="2026-10-05"
      facts={facts}
      sections={sections}
      contactPrompt="¿Tienes una duda sobre tu envío?"
      currentRoute={STOREFRONT_ROUTES.shippingPolicy}
    />
  );
}
