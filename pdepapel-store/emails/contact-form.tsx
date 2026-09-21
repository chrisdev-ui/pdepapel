import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import {
  body,
  buttonGhost,
  buttonSection,
  card,
  cardText,
  container,
  divider,
  fontFaceCss,
  footer,
  heading,
  kvKey,
  kvValue,
  labelDot,
  main,
  panelDot,
  panelLabel,
  rule,
  sectionLabel,
  table,
} from "./theme";

interface ContactFormEmailProps {
  name: string;
  email: string;
  subject?: string;
  message?: string;
}

/**
 * Lo que llega cuando alguien escribe desde `/contacto`.
 *
 * Va en la piel «panel»: lo recibe Paula, no un cliente, así que no lleva
 * mascota ni pastel. El botón abre la respuesta ya dirigida a quien escribió,
 * que era el paso que antes había que hacer a mano.
 */
export const ContactFormEmail = ({
  name = "John Doe",
  email = "john@example.com",
  subject = "Soporte de Tienda",
  message = "Tengo una duda sobre un producto de la página...",
}: ContactFormEmailProps) => {
  return (
    <Html lang="es">
      <Head>
        <style dangerouslySetInnerHTML={{ __html: fontFaceCss }} />
      </Head>
      <Preview>{`Nueva solicitud de contacto: ${subject}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={rule} />
          <Text style={panelLabel}>
            <span style={panelDot} />
            Panel · formulario de contacto
          </Text>

          <Section style={body}>
            <Heading style={heading}>Alguien escribió desde la tienda</Heading>

            <Section style={card("lavender")}>
              <table style={table} cellPadding={0} cellSpacing={0} role="presentation">
                <tbody>
                  <tr>
                    <td style={kvKey}>Nombre</td>
                    <td style={kvValue}>{name}</td>
                  </tr>
                  <tr>
                    <td style={kvKey}>Correo</td>
                    <td style={kvValue}>{email}</td>
                  </tr>
                  <tr>
                    <td style={kvKey}>Asunto</td>
                    <td style={kvValue}>{subject || "Sin asunto"}</td>
                  </tr>
                </tbody>
              </table>
            </Section>

            <Text style={sectionLabel}>
              <span style={labelDot} />
              Mensaje
            </Text>
            <Section style={card("lavender", true)}>
              <Text style={cardText}>{message || "Sin mensaje."}</Text>
            </Section>

            <Section style={buttonSection}>
              <Button
                href={`mailto:${email}?subject=${encodeURIComponent(
                  `Re: ${subject || "Tu mensaje a P de Papel"}`,
                )}`}
                style={buttonGhost}
              >
                Responder a {name.split(" ")[0]}
              </Button>
            </Section>

            <Hr style={divider} />
            <Text style={footer}>
              Panel de P de Papel · enviado desde papeleriapdepapel.com/contacto
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default ContactFormEmail;
