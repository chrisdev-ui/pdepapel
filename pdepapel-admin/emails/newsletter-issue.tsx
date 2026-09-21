import { Img, Link, Section } from "@react-email/components";

import {
  Cta,
  Foot,
  P,
  Pill,
  Shell,
  Title,
  Unsubscribe,
  cover,
} from "./components";

interface NewsletterIssueEmailProps {
  title: string;
  intro: string | null;
  coverUrl: string;
  coverAlt: string | null;
  issueUrl: string;
  pageCount: number;
  unsubscribeUrl: string;
}

/**
 * El número del boletín, con la portada dentro del correo.
 *
 * Nada va adjunto a propósito: un archivo en un correo masivo es señal de spam
 * de manual, y el dominio es el mismo con el que salen las confirmaciones de
 * pedido. La portada se ve al abrir y el resto de páginas viven en la tienda.
 */
export function NewsletterIssueEmail({
  title,
  intro,
  coverUrl,
  coverAlt,
  issueUrl,
  pageCount,
  unsubscribeUrl,
}: NewsletterIssueEmailProps) {
  return (
    <Shell preview={title} tint="lavender" kicker="Boletín">
      <Pill tint="lavender">Nuevo número</Pill>
      <Title>{title}</Title>
      {intro ? <P>{intro}</P> : null}

      {/* La portada es el correo: si solo llevara un enlace, nadie lo abre. */}
      <Section style={{ margin: "18px 0 4px", textAlign: "center" as const }}>
        <Link href={issueUrl}>
          <Img src={coverUrl} alt={coverAlt || title} width="504" style={cover} />
        </Link>
      </Section>

      <Cta href={issueUrl}>
        {pageCount > 1 ? `Ver las ${pageCount} páginas` : "Ver el número completo"}
      </Cta>

      <Foot>
        P de Papel · Medellín, Colombia · máximo dos correos al mes
        <br />
        Puedes <Unsubscribe url={unsubscribeUrl} /> sin iniciar sesión.
      </Foot>
    </Shell>
  );
}

/* Datos de muestra para `npm run email:dev`. No se envían a nadie. */
NewsletterIssueEmail.PreviewProps = {
  title: "Regreso a clases",
  intro: "Ocho páginas con lo que trae noviembre: agendas, kits de estudio y tres ideas para organizar el semestre.",
  coverUrl: "https://papeleriapdepapel.com/images/text-below-lightpink-bg.webp",
  coverAlt: "Portada del número de noviembre",
  issueUrl: "https://papeleriapdepapel.com/boletin/regreso-a-clases",
  pageCount: 8,
  unsubscribeUrl: "https://papeleriapdepapel.com/suscripcion/cancelar?token=demo",
} satisfies NewsletterIssueEmailProps;

export default NewsletterIssueEmail;
