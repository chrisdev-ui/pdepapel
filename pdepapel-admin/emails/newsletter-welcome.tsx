import { Cta, Foot, P, Pill, Shell, Ticket, Title, Unsubscribe } from "./components";

interface NewsletterWelcomeProps {
  shopUrl: string;
  unsubscribeUrl: string;
  couponCode?: string | null;
  couponPercent?: number;
  couponEndsAt?: Date | null;
}

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    timeZone: "America/Bogota",
  }).format(value);

export function NewsletterWelcome({
  shopUrl,
  unsubscribeUrl,
  couponCode = null,
  couponPercent = 10,
  couponEndsAt = null,
}: NewsletterWelcomeProps) {
  return (
    <Shell
      preview="Tu suscripción a P de Papel quedó confirmada"
      tint="mint"
      kicker="Bienvenida"
    >
      <Pill tint="mint">Ya estás dentro</Pill>
      <Title>Bienvenida a P de Papel.</Title>
      <P>
        Te avisaremos de lo nuevo antes que a nadie: productos que llegan,
        colecciones y ofertas. Máximo dos correos al mes, ni uno más.
      </P>

      {couponCode ? (
        <Ticket
          label="Tu código de bienvenida"
          code={couponCode}
          hint={`${couponPercent} % en tu primera compra · un solo uso${
            couponEndsAt ? ` · vence el ${formatDate(couponEndsAt)}` : ""
          }`}
        />
      ) : null}

      <Cta href={shopUrl}>Ir a la tienda</Cta>

      <Foot>
        P de Papel · Medellín, Colombia
        <br />
        Puedes <Unsubscribe url={unsubscribeUrl} /> en cualquier momento, sin
        iniciar sesión.
      </Foot>
    </Shell>
  );
}

/* Datos de muestra para `npm run email:dev`. No se envían a nadie. */
NewsletterWelcome.PreviewProps = {
  shopUrl: "https://papeleriapdepapel.com/tienda",
  unsubscribeUrl: "https://papeleriapdepapel.com/suscripcion/cancelar?token=demo",
  couponCode: "HOLA10",
  couponPercent: 10,
  couponEndsAt: new Date("2026-12-20T05:00:00.000Z"),
} satisfies NewsletterWelcomeProps;

export default NewsletterWelcome;
