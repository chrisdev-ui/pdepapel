import { Link } from "@react-email/components";

import {
  CardText,
  Cta,
  EmailLineItem,
  Foot,
  ItemsTable,
  KeyValues,
  Meta,
  P,
  PanelShell,
  Pill,
  SectionLabel,
  Shell,
  StickerCard,
  Title,
} from "./components";
import { Tint, link } from "./theme";

interface OrderNotificationProps {
  name: string;
  orderNumber: string;
  /** `OrderStatus` o `ShippingStatus`, tal como llega de Prisma. */
  status: string;
  isAdminEmail?: boolean;
  paymentMethod?: string;
  trackingInfo?: string;
  address?: string;
  phone?: string;
  email?: string;
  total?: string;
  /** Las líneas del pedido, con cantidad y precio. */
  items?: EmailLineItem[];
  /**
   * El resumen en texto plano. Se conserva como red de seguridad para quien
   * todavía no manda `items`; se pinta como párrafo, ya no en monoespaciada.
   */
  orderSummary?: string;
  orderLink?: string;
  thanksParagraph?: string;
  city?: string;
  notificationSource?: string;
  accountClaimLink?: string | null;
}

interface Look {
  tint: Tint;
  pill: string;
  /** El titular para el cliente. Recibe el primer nombre. */
  headline: (firstName: string) => string;
}

/**
 * Cada estado tiene su tinte y su frase.
 *
 * El tinte vive en la pastilla, no en la franja: los correos de pedido llevan
 * la franja rosa siempre, porque el color de la marca no se negocia por un
 * estado de envío.
 */
function getLook(status: string): Look {
  switch (status) {
    case "PENDING":
      return {
        tint: "yellow",
        pill: "Pendiente de pago",
        headline: (n) => (n ? `Recibimos tu pedido, ${n}.` : "Recibimos tu pedido."),
      };
    case "PAID":
      return {
        tint: "mint",
        pill: "Pago confirmado",
        headline: (n) =>
          n
            ? `Listo, ${n}. Ya estamos empacando tu pedido.`
            : "Listo. Ya estamos empacando tu pedido.",
      };
    case "Preparing":
      return {
        tint: "yellow",
        pill: "Preparando tu envío",
        headline: () => "Estamos empacando tu pedido.",
      };
    case "SENT":
    case "SHIPPED":
    case "Shipped":
    case "PickedUp":
      return {
        tint: "blue",
        pill: "En camino",
        headline: () => "Tu pedido salió de la papelería.",
      };
    case "InTransit":
      return {
        tint: "blue",
        pill: "En tránsito",
        headline: () => "Tu pedido va en camino.",
      };
    case "OutForDelivery":
      return {
        tint: "blue",
        pill: "Sale hoy",
        headline: () => "Tu pedido llega hoy.",
      };
    case "DELIVERED":
    case "Delivered":
      return {
        tint: "mint",
        pill: "Entregado",
        headline: () => "Tu pedido ya está en tus manos.",
      };
    case "CANCELLED":
    case "Cancelled":
      return {
        tint: "alert",
        pill: "Cancelado",
        headline: () => "Cancelamos tu pedido.",
      };
    case "FailedDelivery":
      return {
        tint: "alert",
        pill: "Entrega fallida",
        headline: () => "No pudimos entregar tu pedido.",
      };
    case "Returned":
      return {
        tint: "alert",
        pill: "Devuelto",
        headline: () => "Tu pedido volvió a la papelería.",
      };
    case "Exception":
      return {
        tint: "alert",
        pill: "Necesita revisión",
        headline: () => "Hubo un problema con tu envío.",
      };
    default:
      return {
        tint: "lavender",
        pill: "Actualización",
        headline: () => "Hay novedades con tu pedido.",
      };
  }
}

export const OrderNotification = ({
  name = "Cliente",
  orderNumber = "123456",
  status = "PAID",
  isAdminEmail = false,
  paymentMethod,
  trackingInfo,
  address,
  phone,
  email,
  total,
  items = [],
  orderSummary,
  orderLink = "https://papeleriapdepapel.com",
  thanksParagraph,
  city,
  notificationSource,
  accountClaimLink,
}: OrderNotificationProps) => {
  const look = getLook(status);
  const firstName = name ? name.split(" ")[0] : "";
  const hasTracking = Boolean(trackingInfo) && trackingInfo !== "TRACK-123";

  /* ------------------------------------------------------------- panel */

  if (isAdminEmail) {
    const rows: { key: string; value: React.ReactNode }[] = [
      { key: "Cliente", value: name },
      { key: "Correo", value: email || "Sin correo" },
      { key: "Teléfono", value: phone || "Sin teléfono" },
      { key: "Dirección", value: address || "Sin dirección" },
      { key: "Ciudad", value: city || "Sin ciudad" },
    ];
    if (total) rows.push({ key: "Total", value: total });
    if (hasTracking) rows.push({ key: "Guía", value: trackingInfo as string });
    if (notificationSource)
      rows.push({ key: "Origen del aviso", value: notificationSource });

    return (
      <PanelShell
        preview={`Pedido #${orderNumber} · ${look.pill}`}
        label="Panel · pedido"
      >
        <Title panel>
          {status === "PENDING" ? `Nuevo pedido de ${name}` : `Pedido #${orderNumber}`}
        </Title>
        <Meta>{`${look.pill} · ${name}`}</Meta>

        <StickerCard tint="slate">
          <KeyValues rows={rows} />
        </StickerCard>

        <SectionLabel tint="slate">Artículos</SectionLabel>
        <StickerCard tint="slate">
          {items.length > 0 ? (
            <ItemsTable items={items} total={total} />
          ) : (
            <CardText>{orderSummary || "Sin artículos registrados."}</CardText>
          )}
        </StickerCard>

        <Cta href={orderLink} ghost>
          Abrir el pedido en el panel
        </Cta>

        <Foot>Panel de P de Papel</Foot>
      </PanelShell>
    );
  }

  /* ------------------------------------------------------------ tienda */

  return (
    <Shell
      preview={`${look.headline(firstName)} Pedido #${orderNumber}`}
      tint="pink"
      kicker="Papelería · Medellín"
    >
      <Pill tint={look.tint}>{look.pill}</Pill>
      <Title>{look.headline(firstName)}</Title>
      {thanksParagraph ? <P>{thanksParagraph}</P> : null}

      <SectionLabel tint={look.tint}>Tu pedido #{orderNumber}</SectionLabel>
      <StickerCard tint={look.tint}>
        {items.length > 0 ? (
          <ItemsTable items={items} total={total} />
        ) : (
          <CardText>{orderSummary || "Sin artículos registrados."}</CardText>
        )}
      </StickerCard>

      {paymentMethod ? (
        <>
          <SectionLabel tint={look.tint}>Pago</SectionLabel>
          <StickerCard tint={look.tint} filled>
            <CardText>{paymentMethod}</CardText>
          </StickerCard>
        </>
      ) : null}

      {hasTracking ? (
        <>
          <SectionLabel tint="blue">Seguimiento</SectionLabel>
          <StickerCard tint="blue" filled>
            <CardText>
              Guía de envío: <strong>{trackingInfo}</strong>
              <br />
              <Link
                href={`https://www.envioclick.com/co/track/${trackingInfo}`}
                style={link}
              >
                Consultar el estado del envío
              </Link>
            </CardText>
          </StickerCard>
        </>
      ) : null}

      <Cta href={orderLink}>Ver mi pedido</Cta>

      {accountClaimLink ? (
        <StickerCard tint="lavender" filled>
          <CardText>
            <strong>Guarda tu pedido en una cuenta gratis.</strong> Con este
            mismo correo puedes consultarlo desde cualquier dispositivo.{" "}
            <Link href={accountClaimLink} style={link}>
              Guardar mi pedido
            </Link>
          </CardText>
        </StickerCard>
      ) : null}

      <Foot>
        P de Papel · Medellín, Colombia
        <br />
        ¿Algo no cuadra? Responde este correo, te lee una persona.
      </Foot>
    </Shell>
  );
};

/* Datos de muestra para `npm run email:dev`. No se envían a nadie. */
OrderNotification.PreviewProps = {
  name: "Luisa Sánchez",
  orderNumber: "ORD-1789487579001-684",
  status: "PAID",
  paymentMethod: "Pago en línea",
  total: "$ 85.900",
  items: [
    { name: "Cuaderno cosido Osito", quantity: 2, price: "$ 36.000" },
    { name: "Set de micropuntas", quantity: 1, price: "$ 28.900" },
    { name: "Washi tape pastel", quantity: 3, price: "$ 21.000" },
  ],
  orderLink: "https://papeleriapdepapel.com/pedido/demo",
  thanksParagraph:
    "Recibimos tu pago. Te escribimos otra vez en cuanto salga de la papelería.",
  city: "Medellín",
  email: "luisa@ejemplo.com",
  phone: "300 123 4567",
  address: "Calle 45 #32-18, apto 402",
} satisfies OrderNotificationProps;

export default OrderNotification;
