import {
  Cta,
  EmailProduct,
  Foot,
  P,
  Pill,
  ProductCards,
  SectionLabel,
  Shell,
  Title,
  Unsubscribe,
} from "./components";

interface NewsletterArrivalProps {
  title: string;
  subtitle: string | null;
  shopUrl: string;
  products: EmailProduct[];
  unsubscribeUrl: string;
}

export function NewsletterArrival({
  title,
  subtitle,
  shopUrl,
  products,
  unsubscribeUrl,
}: NewsletterArrivalProps) {
  return (
    <Shell
      preview={`Ya llegó: ${title}`}
      tint="yellow"
      kicker="Recién llegado"
    >
      <Pill tint="yellow">Ya está en la tienda</Pill>
      <Title>{title}</Title>
      {subtitle ? <P>{subtitle}</P> : null}

      {products.length > 0 ? (
        <>
          <SectionLabel tint="yellow">Lo que puedes llevarte</SectionLabel>
          <ProductCards products={products} tint="yellow" />
        </>
      ) : null}

      <Cta href={shopUrl}>Ver lo que llegó</Cta>

      <Foot>
        P de Papel · Medellín, Colombia · máximo dos correos al mes
        <br />
        Puedes <Unsubscribe url={unsubscribeUrl} /> sin iniciar sesión.
      </Foot>
    </Shell>
  );
}

/* Datos de muestra para `npm run email:dev`. No se envían a nadie. */
NewsletterArrival.PreviewProps = {
  title: "Colección Bosque",
  subtitle: "Se acabó el acceso anticipado. Queda poco de algunas referencias.",
  shopUrl: "https://papeleriapdepapel.com/tienda",
  products: [
    { name: "Cuaderno Hojas", imageUrl: null, url: "https://papeleriapdepapel.com/producto/cuaderno-hojas", price: "$ 38.000" },
    { name: "Set sellos Bosque", imageUrl: null, url: "https://papeleriapdepapel.com/producto/set-sellos-bosque", price: "$ 45.000" },
    { name: "Washi Musgo", imageUrl: null, url: "https://papeleriapdepapel.com/producto/washi-musgo", price: "$ 12.500" },
  ],
  unsubscribeUrl: "https://papeleriapdepapel.com/suscripcion/cancelar?token=demo",
} satisfies NewsletterArrivalProps;

export default NewsletterArrival;
