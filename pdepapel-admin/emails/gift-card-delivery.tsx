import { Link } from "@react-email/components";

import {
  CardText,
  Cta,
  Foot,
  P,
  Pill,
  SectionLabel,
  Shell,
  StickerCard,
  Ticket,
  Title,
} from "./components";
import { link } from "./theme";

interface GiftCardDeliveryProps {
  /** Quien recibe la tarjeta (si no dejaron nombre, quien la compró). */
  recipientName: string;
  /** Quien la compró, como lo escribió. */
  buyerName: string;
  /** Ya formateado en pesos. */
  amount: string;
  /** El código, tal como se escribe: PDP-XXXX-XXXX-XXXX. Solo vive en este correo. */
  code: string;
  message?: string | null;
  /** El correo va a quien compró porque no dejó correo de quien recibe. */
  toBuyer?: boolean;
  /** Reenvío: el código anterior dejó de servir. */
  reissued?: boolean;
  storeUrl?: string;
}

/**
 * La tarjeta de regalo, por correo. Es el único lugar donde el código existe
 * en claro: la base guarda su huella y los últimos cuatro caracteres, y el
 * panel solo ve esos cuatro.
 */
export const GiftCardDelivery = ({
  recipientName = "",
  buyerName = "Alguien",
  amount = "$ 100.000",
  code = "PDP-XXXX-XXXX-XXXX",
  message,
  toBuyer = false,
  reissued = false,
  storeUrl = "https://papeleriapdepapel.com",
}: GiftCardDeliveryProps) => {
  const firstName = recipientName ? recipientName.split(" ")[0] : "";
  const buyer = buyerName?.trim() || "Alguien";
  const note = message?.trim();
  const headline = reissued
    ? "Aquí está tu código nuevo."
    : toBuyer
      ? "Tu tarjeta de regalo está lista."
      : firstName
        ? `${firstName}, ${buyer} te regaló ${amount}.`
        : `${buyer} te regaló ${amount}.`;
  const preview = reissued
    ? `Código nuevo para tu tarjeta de regalo de ${amount}`
    : toBuyer
      ? `Tu tarjeta de regalo de ${amount} para regalar`
      : `${buyer} te envió una tarjeta de regalo de ${amount}`;

  return (
    <Shell preview={preview} tint="pink" kicker="Papelería · Medellín">
      <Pill tint={reissued ? "yellow" : "pink"}>
        {reissued ? "Código reemitido" : "Tarjeta de regalo"}
      </Pill>
      <Title>{headline}</Title>
      <P>
        {reissued
          ? "El código anterior dejó de servir en este mismo momento. Este es el que vale, con el mismo saldo."
          : toBuyer
            ? "Compártela como quieras: basta con el código de abajo. Se usa en la tienda en línea al pagar, entera o por partes."
            : `Se usa en papeleriapdepapel.com al pagar, entera o por partes, en tantas compras como haga falta.`}
      </P>

      <Ticket
        label="Tu código"
        code={code}
        hint={`Vale ${amount}. Escríbelo en «Tarjeta de regalo» al pagar.`}
      />

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

      <Cta href={`${storeUrl}/tienda`}>Ir a la tienda</Cta>

      <Foot>
        P de Papel · Medellín, Colombia
        <br />
        Guarda este correo: el código no se muestra en ningún otro sitio. Si
        lo pierdes, escríbenos y te mandamos uno nuevo.
        <br />
        <Link href={`${storeUrl}/politicas/devoluciones`} style={link}>
          Condiciones de uso
        </Link>
      </Foot>
    </Shell>
  );
};

/* Datos de muestra para `npm run email:dev`. No se envían a nadie. */
GiftCardDelivery.PreviewProps = {
  recipientName: "Mariana López",
  buyerName: "Luisa Sánchez",
  amount: "$ 100.000",
  code: "PDP-7K3M-P9QX-2R8T",
  message: "¡Feliz cumpleaños! Para que llenes estas hojas de ideas bonitas.",
} satisfies GiftCardDeliveryProps;

export default GiftCardDelivery;
