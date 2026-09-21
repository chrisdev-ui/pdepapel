import {
  CardText,
  Cta,
  EmailProduct,
  Foot,
  P,
  Pill,
  ProductCards,
  SectionLabel,
  Shell,
  StickerCard,
  Title,
  Unsubscribe,
} from "./components";

interface NewsletterEarlyAccessProps {
  title: string;
  subtitle: string | null;
  accessUrl: string;
  products: EmailProduct[];
  expiresAt: Date;
  unsubscribeUrl: string;
}

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    timeZone: "America/Bogota",
  }).format(value);

export function NewsletterEarlyAccess({
  title,
  subtitle,
  accessUrl,
  products,
  expiresAt,
  unsubscribeUrl,
}: NewsletterEarlyAccessProps) {
  return (
    <Shell
      preview={`Tienes acceso anticipado: ${title}`}
      tint="pink"
      kicker="Solo para suscriptoras"
    >
      <Pill tint="pink">Antes que nadie</Pill>
      <Title>{title}</Title>
      {subtitle ? <P>{subtitle}</P> : null}

      <StickerCard tint="pink" filled>
        <CardText>
          Puedes comprarlo antes de que salga a la tienda. Tu enlace vale hasta
          el <strong>{formatDate(expiresAt)}</strong>.
        </CardText>
      </StickerCard>

      {products.length > 0 ? (
        <>
          <SectionLabel tint="pink">Lo que viene</SectionLabel>
          <ProductCards products={products} tint="pink" />
        </>
      ) : null}

      <Cta href={accessUrl}>Entrar con mi acceso</Cta>

      <Foot>
        P de Papel · Medellín, Colombia
        <br />
        Recibes este correo porque confirmaste tu suscripción; puedes{" "}
        <Unsubscribe url={unsubscribeUrl} /> sin iniciar sesión.
      </Foot>
    </Shell>
  );
}

/* Datos de muestra para `npm run email:dev`. No se envían a nadie. */
NewsletterEarlyAccess.PreviewProps = {
  title: "Colección Bosque",
  subtitle: "Papelería de otoño hecha en Medellín.",
  accessUrl: "https://papeleriapdepapel.com/tienda?acceso=demo",
  products: [
    { name: "Cuaderno Hojas", imageUrl: null, url: "https://papeleriapdepapel.com/producto/cuaderno-hojas", price: "$ 38.000" },
    { name: "Set sellos Bosque", imageUrl: null, url: "https://papeleriapdepapel.com/producto/set-sellos-bosque", price: "$ 45.000" },
    { name: "Washi Musgo", imageUrl: null, url: "https://papeleriapdepapel.com/producto/washi-musgo", price: "$ 12.500" },
  ],
  expiresAt: new Date("2026-09-25T05:00:00.000Z"),
  unsubscribeUrl: "https://papeleriapdepapel.com/suscripcion/cancelar?token=demo",
} satisfies NewsletterEarlyAccessProps;

export default NewsletterEarlyAccess;
