import { Scale } from "lucide-react";
import { Metadata } from "next";
import Link from "next/link";

import { PolicyPage, POLICY_CONTACT, type PolicySection } from "@/components/policy/policy-page";
import { BASE_URL, DEFAULT_SHARE_IMAGE } from "@/constants";
import { LEGAL_VERSIONS } from "@/lib/legal-versions";
import { PRESALE_EXCESS_REFUND, PRESALE_NON_REFUNDABLE } from "@/lib/presale-copy";
import { STOREFRONT_ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description:
    "Términos y condiciones de Papelería P de Papel: quiénes somos, uso del sitio, precios y disponibilidad, pedidos y pagos, envíos, cambios y derecho de retracto, datos personales y propiedad intelectual.",
  alternates: {
    canonical: STOREFRONT_ROUTES.termsPolicy,
  },
  openGraph: {
    url: `${BASE_URL}${STOREFRONT_ROUTES.termsPolicy}`,
    images: [DEFAULT_SHARE_IMAGE],
  },
};

const sections: PolicySection[] = [
  {
    id: "quienes-somos",
    title: "Quiénes somos",
    content: (
      <>
        <p>
          P de Papel es una tienda de papelería con sede en Medellín, Colombia,
          que vende a través de papeleriapdepapel.com, WhatsApp (313 258 2293) y
          redes sociales.
        </p>
        <p data-testid="responsable">
          Responsable: Paula Fernanda Morales Rodriguez (nombre comercial:
          Papelería P de Papel), NIT 1030579584-5. Dirección de notificación:
          Calle 12 AA Sur #55D-30, Medellín, Antioquia. Contacto:{" "}
          {POLICY_CONTACT.email}.
        </p>
      </>
    ),
  },
  {
    id: "uso-del-sitio",
    title: "Uso del sitio",
    content: (
      <p>
        Al navegar o comprar en papeleriapdepapel.com aceptas estos términos.
        Usa el sitio solo para consultar productos y hacer pedidos de forma
        lícita.
      </p>
    ),
  },
  {
    id: "productos-precios",
    title: "Productos, precios y disponibilidad",
    content: (
      <>
        <p>
          Los precios están en pesos colombianos e incluyen los impuestos
          aplicables. Antes de pagar ves el valor total de tu pedido: los
          productos, el envío y, si eliges contra entrega, el costo de recaudo.
          Las fotos son de nuestros
          productos reales, pero los colores pueden variar según la pantalla. La
          disponibilidad depende del inventario; si un producto se agota después
          de tu compra, te ofrecemos un cambio o la devolución total de lo
          pagado. En kits y productos sorpresa, cada publicación indica qué
          incluyen o qué puedes esperar recibir.
        </p>
        <p>
          Las cápsulas sorpresa tienen sus condiciones en la página de cada
          edición (<Link href={STOREFRONT_ROUTES.capsules}>/capsulas</Link>).
        </p>
      </>
    ),
  },
  {
    id: "pedidos-y-pagos",
    title: "Pedidos y pagos",
    content: (
      <p>
        Tu pedido queda confirmado cuando recibimos el pago o, si eliges contra
        entrega, cuando confirmamos el pedido contigo. Puedes pagar en línea, por
        transferencia o contra entrega donde esté disponible. En contra entrega
        el costo de recaudo se suma al envío.
      </p>
    ),
  },
  // Sección en revisión legal (preventa con anticipo, 2026-10-28): redacción
  // provisional de output/audits/preventa-fase0-2026-10-28.md §8.2, pendiente
  // de Paula (plazo del saldo, canal y tiempo del reembolso) y del abogado
  // (retracto frente al anticipo, arras, plazo de entrega).
  {
    id: "preventas",
    title: "Preventas y anticipos",
    content: (
      <>
        <p>
          <strong>Preventas con anticipo.</strong> Algunos productos se venden
          antes de que lleguen a nuestra bodega. Al reservar pagas un anticipo
          (por ejemplo, $30.000 por unidad) y el saldo del precio más el envío
          cuando el producto llegue; te avisamos para que lo pagues dentro del
          plazo que te indiquemos al avisarte.
        </p>
        <p>
          <strong>Precio.</strong> El precio del producto queda fijo desde que
          reservas.
        </p>
        <p>
          <strong>Fecha estimada.</strong> La fecha que mostramos es una
          estimación del proveedor. Si cambia, te avisamos.
        </p>
        <p>
          <strong>Si el producto no llega.</strong> Si no podemos entregarte el
          producto, te devolvemos el 100 % de lo que pagaste, incluido el
          anticipo.
        </p>
        <p>
          <strong>Si desistes o no pagas el saldo.</strong>{" "}
          <strong>{PRESALE_NON_REFUNDABLE}</strong> si decides no continuar con la
          compra o si no pagas el saldo en el plazo indicado,{" "}
          <strong>salvo el derecho de retracto de ley o si el producto no llega</strong>;{" "}
          {PRESALE_EXCESS_REFUND}.
        </p>
        <p>
          <strong>Derecho de retracto.</strong> Como en toda compra por
          internet, puedes retractarte dentro de los cinco (5) días hábiles
          siguientes a la entrega, en los términos del artículo 47 de la Ley 1480
          de 2011; en ese caso te devolvemos el total pagado.
        </p>
        <p>
          <strong>Envío.</strong> El envío se cotiza y se paga con el saldo.
        </p>
      </>
    ),
  },
  {
    id: "envios",
    title: "Envíos",
    content: (
      <p>
        Despachamos a toda Colombia. Los costos, tiempos y condiciones están en
        nuestra <Link href={STOREFRONT_ROUTES.shippingPolicy}>Política de envíos</Link>.
      </p>
    ),
  },
  {
    id: "cambios-y-retracto",
    title: "Cambios, devoluciones y derecho de retracto",
    content: (
      <>
        <p>
          Las condiciones están en nuestra{" "}
          <Link href={STOREFRONT_ROUTES.returnsPolicy}>Política de cambios y devoluciones</Link>, sin
          perjuicio de los derechos que te otorga el Estatuto del Consumidor (Ley
          1480 de 2011), incluido el derecho de retracto en compras a distancia.
        </p>
        <p>
          Puedes retractarte de tu compra dentro de los cinco (5) días hábiles
          siguientes a la entrega del producto (art. 47). Avísanos por correo o
          WhatsApp y devuélvenos el producto por los mismos medios y en las mismas
          condiciones en que lo recibiste; los costos de transporte de la
          devolución corren por tu cuenta. Te devolvemos todo lo que pagaste, sin
          descuentos ni retenciones, en un plazo máximo de treinta (30) días
          calendario desde que ejerces el derecho.
        </p>
        <p>
          Como dice la ley, el retracto no aplica a productos confeccionados
          según tus especificaciones o claramente personalizados, a bienes que
          por su naturaleza no puedan devolverse o se deterioren con rapidez, a
          bienes perecederos ni a bienes de uso personal.
        </p>
      </>
    ),
  },
  {
    id: "garantia-legal",
    title: "Garantía legal",
    content: (
      <p>
        Todos nuestros productos tienen la garantía legal del Estatuto del
        Consumidor (Ley 1480 de 2011, arts. 7 a 11): si un producto llega
        defectuoso o no corresponde a lo ofrecido, respondemos por su calidad,
        idoneidad y seguridad, y según lo que fija la ley lo reparamos, lo
        cambiamos o te devolvemos el dinero, sin costo para ti. Cómo pedirla:{" "}
        <Link href={STOREFRONT_ROUTES.returnsPolicy}>Política de cambios y devoluciones</Link>.
      </p>
    ),
  },
  {
    id: "reversion-del-pago",
    title: "Reversión del pago",
    content: (
      <>
        <p>
          Si pagaste en línea con tarjeta de crédito, débito u otro medio de pago
          electrónico, puedes pedir la reversión del pago (Ley 1480 de 2011, art.
          51) cuando:
        </p>
        <ul>
          <li>fuiste víctima de fraude;</li>
          <li>la operación no fue solicitada por ti;</li>
          <li>el producto no te llegó;</li>
          <li>el producto que recibiste no corresponde a lo que pediste o está defectuoso.</li>
        </ul>
        <p>
          Preséntanos tu queja dentro de los cinco (5) días hábiles siguientes a
          la fecha en que supiste del fraude o de la operación no solicitada, o
          en que recibiste el producto o debiste recibirlo, y avisa en el mismo
          plazo a la entidad que emitió tu tarjeta o medio de pago. Escríbenos
          por correo o WhatsApp (ver{" "}
          <Link href="#peticiones-quejas-reclamos">Peticiones, quejas y reclamos</Link>) con tu
          número de pedido y el motivo. Si la reversión es por el producto,
          debes devolvérnoslo en las condiciones en que lo recibiste.
        </p>
      </>
    ),
  },
  {
    id: "peticiones-quejas-reclamos",
    title: "Peticiones, quejas y reclamos",
    content: (
      <p>
        Escríbenos a {POLICY_CONTACT.email} o por WhatsApp (313 258 2293)
        con tu nombre, el número de pedido y lo que necesitas. Respondemos en un
        máximo de quince (15) días hábiles; normalmente lo hacemos en 12 a 24
        horas. Si no quedas conforme con la respuesta, puedes acudir a la
        Superintendencia de Industria y Comercio.
      </p>
    ),
  },
  {
    id: "datos-personales",
    title: "Datos personales",
    content: (
      <p>
        Tratamos tus datos según nuestra{" "}
        <Link href={STOREFRONT_ROUTES.dataPolicy}>Política de tratamiento de datos personales</Link>.
      </p>
    ),
  },
  {
    id: "propiedad-intelectual",
    title: "Propiedad intelectual",
    content: (
      <p>
        Los textos, fotos, videos y la marca P de Papel son de nuestra propiedad
        o se usan con autorización. No puedes copiarlos ni usarlos con fines
        comerciales sin permiso. Las marcas y personajes de los productos que
        revendemos pertenecen a sus titulares.
      </p>
    ),
  },
  {
    id: "cambios-a-estos-terminos",
    title: "Cambios a estos términos",
    content: (
      <p>
        Podemos actualizar estos términos; la versión vigente es siempre la
        publicada en esta página.
      </p>
    ),
  },
  {
    id: "ley-aplicable",
    title: "Ley aplicable",
    content: <p>Estos términos se rigen por las leyes de la República de Colombia.</p>,
  },
];

export default function TermsPage() {
  return (
    <PolicyPage
      eyebrow="Términos y condiciones"
      eyebrowIcon={Scale}
      eyebrowClassName="bg-kawaii-blue-light text-sky-900"
      title="Términos y condiciones de P de Papel"
      lede="Lo que aplica cuando navegas o compras en papeleriapdepapel.com."
      updatedAt={LEGAL_VERSIONS.terms}
      sections={sections}
      contactPrompt="¿Tienes dudas sobre estos términos?"
      currentRoute={STOREFRONT_ROUTES.termsPolicy}
    />
  );
}
