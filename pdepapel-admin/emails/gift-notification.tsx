import { Link } from "@react-email/components";

import {
  CardText,
  Foot,
  P,
  Pill,
  SectionLabel,
  Shell,
  StickerCard,
  Title,
} from "./components";
import { Tint, link } from "./theme";

interface GiftNotificationProps {
  /** Quien recibe el regalo. */
  recipientName: string;
  /** Quien lo manda, como lo escribió al comprar. */
  buyerName: string;
  /** El mensaje que dejó quien compra; opcional. */
  message?: string | null;
  /** `OrderStatus` o `ShippingStatus`, tal como llega de Prisma. */
  status: string;
  trackingInfo?: string;
}

interface Look {
  tint: Tint;
  pill: string;
  headline: (firstName: string) => string;
  body: (buyer: string) => string;
}

/**
 * Cada estado con su frase. A diferencia del correo del pedido, aquí nunca
 * hay productos, precios, totales ni enlace del pedido: es una sorpresa, y
 * quien recibe no es la clienta.
 */
function getLook(status: string): Look {
  switch (status) {
    case "PAID":
      return {
        tint: "pink",
        pill: "Un regalo en camino",
        headline: (n) =>
          n ? `${n}, alguien pensó en ti.` : "Alguien pensó en ti.",
        body: (b) =>
          `${b} te envió un regalo de P de Papel. Lo estamos empacando con cuidado y te avisamos cuando salga.`,
      };
    case "Preparing":
      return {
        tint: "yellow",
        pill: "Preparando tu regalo",
        headline: () => "Estamos empacando tu regalo.",
        body: (b) => `Te lo envía ${b}. Pronto sale de la papelería.`,
      };
    case "SENT":
    case "SHIPPED":
    case "Shipped":
    case "PickedUp":
      return {
        tint: "blue",
        pill: "En camino",
        headline: () => "Tu regalo salió de la papelería.",
        body: (b) =>
          `Te lo envía ${b}. La transportadora ya lo tiene; abajo puedes seguirlo.`,
      };
    case "InTransit":
      return {
        tint: "blue",
        pill: "En tránsito",
        headline: () => "Tu regalo va en camino.",
        body: (b) => `Te lo envía ${b}. Te avisamos cuando esté por llegar.`,
      };
    case "OutForDelivery":
      return {
        tint: "blue",
        pill: "Llega hoy",
        headline: () => "Tu regalo llega hoy.",
        body: (b) =>
          `Te lo envía ${b}. Procura estar disponible para recibirlo.`,
      };
    case "DELIVERED":
    case "Delivered":
      return {
        tint: "mint",
        pill: "Entregado",
        headline: () => "Tu regalo ya está en tus manos.",
        body: (b) => `Esperamos que lo disfrutes. ${b} pensó en ti.`,
      };
    case "FailedDelivery":
      return {
        tint: "alert",
        pill: "Entrega fallida",
        headline: () => "No pudimos entregar tu regalo.",
        body: (b) =>
          `La transportadora no logró entregarlo. Te lo envía ${b}; si quieres coordinar la entrega, responde este correo.`,
      };
    case "Returned":
      return {
        tint: "alert",
        pill: "Devuelto",
        headline: () => "Tu regalo volvió a la papelería.",
        body: (b) =>
          `No se pudo entregar y regresó. Te lo envía ${b}; responde este correo y lo resolvemos.`,
      };
    case "Exception":
      return {
        tint: "alert",
        pill: "Necesita revisión",
        headline: () => "Hubo un problema con el envío de tu regalo.",
        body: (b) =>
          `Estamos revisándolo con la transportadora. Te lo envía ${b}.`,
      };
    default:
      return {
        tint: "lavender",
        pill: "Novedades",
        headline: () => "Hay novedades con tu regalo.",
        body: (b) => `Te lo envía ${b}.`,
      };
  }
}

export const GiftNotification = ({
  recipientName = "",
  buyerName = "Alguien",
  message,
  status = "PAID",
  trackingInfo,
}: GiftNotificationProps) => {
  const look = getLook(status);
  const firstName = recipientName ? recipientName.split(" ")[0] : "";
  const buyer = buyerName?.trim() || "Alguien";
  const hasTracking = Boolean(trackingInfo) && trackingInfo !== "TRACK-123";
  const note = message?.trim();

  return (
    <Shell
      preview={`${look.headline(firstName)} ${buyer} te envió un regalo.`}
      tint="pink"
      kicker="Papelería · Medellín"
    >
      <Pill tint={look.tint}>{look.pill}</Pill>
      <Title>{look.headline(firstName)}</Title>
      <P>{look.body(buyer)}</P>

      {note ? (
        <>
          <SectionLabel tint="pink">Un mensaje de {buyer}</SectionLabel>
          <StickerCard tint="pink" filled>
            <CardText>
              <em>«{note}»</em>
            </CardText>
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

      <Foot>
        P de Papel · Medellín, Colombia
        <br />
        Este aviso no muestra qué hay dentro ni cuánto costó: es una sorpresa.
        <br />
        ¿Dudas con la entrega? Responde este correo, te lee una persona.
      </Foot>
    </Shell>
  );
};

/* Datos de muestra para `npm run email:dev`. No se envían a nadie. */
GiftNotification.PreviewProps = {
  recipientName: "Mariana López",
  buyerName: "Luisa Sánchez",
  message: "¡Feliz cumpleaños! Para que llenes estas hojas de ideas bonitas.",
  status: "PAID",
} satisfies GiftNotificationProps;

export default GiftNotification;
