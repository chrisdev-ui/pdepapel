import {
  CardText,
  Cta,
  Foot,
  P,
  Pill,
  Shell,
  StickerCard,
  Title,
} from "./components";

interface NewsletterConfirmationProps {
  confirmationUrl: string;
}

export function NewsletterConfirmation({
  confirmationUrl,
}: NewsletterConfirmationProps) {
  return (
    <Shell
      preview="Confirma que quieres recibir novedades de P de Papel"
      tint="lavender"
      kicker="Boletín"
    >
      <Pill tint="lavender">Un paso más</Pill>
      <Title>Solo falta confirmar tu correo.</Title>
      <P>
        Confirma que quieres recibir novedades, lanzamientos y ofertas de P de
        Papel. Enviaremos como máximo dos correos al mes.
      </P>

      <Cta href={confirmationUrl}>Confirmar suscripción</Cta>

      <StickerCard tint="lavender" filled>
        <CardText>
          El enlace vence en 48 horas. Si no pediste la suscripción, ignora este
          mensaje: no recibirás nada.
        </CardText>
      </StickerCard>

      <Foot>P de Papel · Medellín, Colombia</Foot>
    </Shell>
  );
}

/* Datos de muestra para `npm run email:dev`. No se envían a nadie. */
NewsletterConfirmation.PreviewProps = {
  confirmationUrl: "https://papeleriapdepapel.com/suscripcion/confirmar?token=demo",
} satisfies NewsletterConfirmationProps;

export default NewsletterConfirmation;
