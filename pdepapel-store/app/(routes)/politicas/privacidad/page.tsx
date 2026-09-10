import { ShieldCheck } from "lucide-react";
import { Metadata } from "next";

import { PolicyPage, POLICY_CONTACT, type PolicySection } from "@/components/policy/policy-page";
import { BASE_URL } from "@/constants";
import { STOREFRONT_ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Política de tratamiento de datos",
  description:
    "Qué datos personales recoge Papelería P de Papel, para qué los usa, con qué proveedores los procesa y cómo ejercer tus derechos de habeas data conforme a la Ley 1581 de 2012.",
  alternates: {
    canonical: STOREFRONT_ROUTES.dataPolicy,
  },
  openGraph: {
    url: `${BASE_URL}${STOREFRONT_ROUTES.dataPolicy}`,
  },
};

const sections: PolicySection[] = [
  {
    id: "quienes-somos",
    title: "Quiénes somos y qué cubre esta política",
    content: (
      <p>
        Papelería P de Papel, tienda en línea de papelería kawaii con operación
        en Medellín, Colombia, es responsable del tratamiento de los datos
        personales de sus clientes, proveedores y demás personas que se
        relacionan con la tienda. Esta política sigue la Ley 1581 de 2012 y
        sus decretos reglamentarios, y aplica a los datos que recogemos por la
        página web, el correo, WhatsApp, llamadas y cualquier otro canal.
      </p>
    ),
  },
  {
    id: "que-datos-recogemos",
    title: "Qué datos recogemos",
    content: (
      <>
        <ul>
          <li>
            <strong>Para procesar un pedido:</strong> nombre, teléfono, correo,
            dirección de entrega y, si lo indicas, documento de identidad o
            empresa para la factura.
          </li>
          <li>
            <strong>Si creas una cuenta:</strong> nombre y correo, más las
            direcciones, favoritos y búsquedas que decidas guardar.
          </li>
          <li>
            <strong>Si te suscribes al boletín:</strong> tu correo y la fecha y
            origen de tu autorización.
          </li>
          <li>
            <strong>Al navegar:</strong> datos técnicos y de uso agregados,
            solo con tu autorización (ver analítica más abajo).
          </li>
        </ul>
        <p>
          Puedes comprar sin crear una cuenta. En ese caso solo pedimos lo
          necesario para registrar la venta, procesar el pedido y hacer
          seguimiento a la entrega. No usamos datos sensibles.
        </p>
      </>
    ),
  },
  {
    id: "para-que-los-usamos",
    title: "Para qué los usamos",
    content: (
      <ul>
        <li>Registrar, preparar, enviar y hacer seguimiento a tus pedidos.</li>
        <li>Responder tus mensajes y atender cambios, devoluciones y garantías.</li>
        <li>Emitir la factura cuando la solicitas.</li>
        <li>
          Mejorar la tienda con estadísticas agregadas y enviarte novedades
          solo cuando lo autorizas.
        </li>
        <li>Cumplir obligaciones legales, contables y tributarias.</li>
      </ul>
    ),
  },
  {
    id: "proveedores",
    title: "Con quién los compartimos",
    content: (
      <>
        <p>
          No vendemos ni cedemos tus datos. Para operar la tienda usamos
          proveedores que procesan datos por cuenta nuestra y solo para el fin
          indicado:
        </p>
        <ul>
          <li>
            <strong>Pasarelas de pago</strong> (Bold y, como respaldo, Wompi):
            reciben los datos del pago. Nosotros nunca vemos ni guardamos los
            datos de tu tarjeta.
          </li>
          <li>
            <strong>Transportadoras y su plataforma de envíos</strong>: reciben
            nombre, teléfono y dirección para entregar el paquete.
          </li>
          <li>
            <strong>Servicio de cuentas (Clerk)</strong>: guarda tu correo y
            contraseña de forma cifrada cuando creas una cuenta.
          </li>
          <li>
            <strong>Correo transaccional (Resend)</strong>: envía las
            confirmaciones de pedido, envío y boletín.
          </li>
          <li>
            <strong>Alojamiento e imágenes</strong> (Vercel y Cloudinary): sirven
            la página y las fotos de los productos.
          </li>
          <li>
            <strong>Analítica</strong> (Google Analytics 4 y Microsoft Clarity):
            solo con tu autorización, como se explica abajo.
          </li>
        </ul>
        <p>
          Algunos de estos proveedores operan fuera de Colombia con garantías
          de protección equivalentes a las de la ley colombiana.
        </p>
      </>
    ),
  },
  {
    id: "analitica",
    title: "Analítica y mejora de la experiencia",
    content: (
      <ul>
        <li>
          Solo con tu autorización usamos Google Analytics 4 y Microsoft
          Clarity para conocer cómo se navega el catálogo, el carrito y el
          proceso de compra: métricas agregadas, mapas de calor y
          reproducciones técnicas de interacción que nos ayudan a detectar
          dificultades.
        </li>
        <li>
          Los campos de formularios, direcciones, datos de contacto, números de
          pedido y cotizaciones se ocultan para Clarity. No usamos
          identificadores personalizados ni enviamos datos de pago a estas
          herramientas.
        </li>
        <li>
          Puedes aceptar, rechazar o cambiar estas opciones cuando quieras desde
          el enlace <strong>Preferencias de privacidad</strong> del pie de
          página. Rechazarlas no impide comprar ni usar las funciones
          esenciales del sitio.
        </li>
        <li>
          Guardamos tu decisión en este navegador durante 12 meses, en el
          almacenamiento local y en una cookie de preferencia sin
          identificadores, para no volver a preguntarte en cada visita.
        </li>
      </ul>
    ),
  },
  {
    id: "boletin",
    title: "Novedades y boletín",
    content: (
      <ul>
        <li>
          Solo enviamos novedades, lanzamientos y ofertas cuando marcas la
          autorización del formulario y confirmas que el correo es tuyo con el
          enlace que recibes.
        </li>
        <li>
          Registramos la fecha, el origen y la versión de esa autorización para
          demostrar el consentimiento. La suscripción no es necesaria para
          comprar y no se activa automáticamente al hacer un pedido.
        </li>
        <li>
          Puedes cancelar estos mensajes en cualquier momento, sin iniciar
          sesión, desde el enlace incluido en cada correo. La cancelación no
          afecta las confirmaciones de pedidos, pagos o envíos.
        </li>
      </ul>
    ),
  },
  {
    id: "tus-derechos",
    title: "Tus derechos",
    content: (
      <>
        <p>Como titular de tus datos puedes, en cualquier momento:</p>
        <ul>
          <li>Conocer, actualizar y rectificar tus datos.</li>
          <li>Pedir prueba de la autorización que nos diste.</li>
          <li>Saber qué uso les hemos dado.</li>
          <li>Revocar la autorización o pedir la supresión de tus datos, salvo que una obligación legal o contractual nos exija conservarlos.</li>
          <li>Presentar quejas ante la Superintendencia de Industria y Comercio.</li>
        </ul>
      </>
    ),
  },
  {
    id: "como-ejercerlos",
    title: "Cómo ejercer tus derechos",
    content: (
      <>
        <p>
          Escríbenos a <strong>{POLICY_CONTACT.email}</strong> con tu nombre
          completo, un dato de contacto y lo que necesitas (consultar,
          actualizar, suprimir o revocar). Las consultas se responden en un
          máximo de 10 días hábiles y los reclamos en un máximo de 15 días
          hábiles, según la Ley 1581 de 2012.
        </p>
        <p>
          Si tienes cuenta, puedes actualizar tu nombre y correo desde tu
          perfil, y eliminar tus direcciones guardadas desde el checkout.
        </p>
      </>
    ),
  },
  {
    id: "conservacion-y-seguridad",
    title: "Conservación y seguridad",
    content: (
      <ul>
        <li>
          Conservamos los datos de los pedidos el tiempo que exigen las normas
          contables y tributarias colombianas, y los de tu cuenta mientras la
          mantengas activa.
        </li>
        <li>
          Usamos conexiones cifradas (HTTPS), acceso restringido al panel de
          administración y proveedores con medidas de seguridad certificadas.
        </li>
        <li>
          Al usar la tienda te comprometes a dar información veraz y
          actualizada, y a no usarla con fines ilegales.
        </li>
      </ul>
    ),
  },
  {
    id: "cambios",
    title: "Cambios en esta política",
    content: (
      <p>
        Si cambiamos esta política, publicamos la nueva versión en esta página
        con la fecha de actualización. Los cambios importantes también se
        avisan por correo a quienes tienen cuenta o suscripción.
      </p>
    ),
  },
];

export default function DataPolicyPage() {
  return (
    <PolicyPage
      eyebrow="Datos personales"
      eyebrowIcon={ShieldCheck}
      eyebrowClassName="bg-kawaii-lavender-light text-violet-900"
      title="Tratamiento de datos personales"
      lede="Qué datos pedimos, para qué los usamos, con quién los procesamos y cómo puedes consultarlos, corregirlos o borrarlos."
      updatedAt="2026-09-09"
      sections={sections}
      contactPrompt="¿Tienes una duda sobre tus datos?"
      currentRoute={STOREFRONT_ROUTES.dataPolicy}
    />
  );
}
