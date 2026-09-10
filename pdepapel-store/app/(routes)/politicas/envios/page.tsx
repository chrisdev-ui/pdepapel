import { Clock, Gift, PackageCheck, Truck } from "lucide-react";
import { Metadata } from "next";
import Link from "next/link";

import { getStorefrontSettings } from "@/actions/get-storefront-settings";
import { PolicyPage, type PolicyFact, type PolicySection } from "@/components/policy/policy-page";
import { BASE_URL, DELIVERY_WINDOW } from "@/constants";
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
  const { freeShippingThreshold } = await getStorefrontSettings();
  const freeShippingLabel = freeShippingThreshold
    ? currencyFormatter.format(freeShippingThreshold)
    : null;

  const facts: PolicyFact[] = [
    {
      icon: Clock,
      tint: "bg-kawaii-blue-light",
      value: DELIVERY_WINDOW,
      label: "después de confirmar el pago",
    },
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
            Preparamos y despachamos los pedidos desde Medellín después de
            confirmar el pago. A partir de ahí, la transportadora entrega en{" "}
            <strong>{DELIVERY_WINDOW}</strong> en la mayoría de ciudades de
            Colombia; en municipios lejanos puede tomar un poco más. En el
            checkout ves el tiempo estimado de cada transportadora antes de
            pagar.
          </p>
          <ul>
            <li>
              En Medellín y el Valle de Aburrá buscamos entregar en un máximo
              de 48 horas hábiles después de la compra.
            </li>
            <li>
              Los pedidos pagados el sábado después de la 1:00 p. m., los
              domingos o en días festivos se despachan el siguiente día hábil.
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
          <p>
            El costo lo calcula la transportadora según tu ciudad y el tamaño
            del paquete, y lo ves en el checkout antes de pagar.{" "}
            <strong>Sin cargos ocultos: el envío que ves es el que pagas.</strong>
          </p>
          {freeShippingLabel ? (
            <p>
              Cuando el valor de los productos alcanza{" "}
              <strong>{freeShippingLabel}</strong>, el envío es gratis a
              cualquier ciudad con cobertura. El descuento se aplica solo en
              el checkout.
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
      updatedAt="2026-09-09"
      facts={facts}
      sections={sections}
      contactPrompt="¿Tienes una duda sobre tu envío?"
      currentRoute={STOREFRONT_ROUTES.shippingPolicy}
    />
  );
}
