import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface NewsletterConfirmationProps {
  confirmationUrl: string;
}

export function NewsletterConfirmation({
  confirmationUrl,
}: NewsletterConfirmationProps) {
  return (
    <Html>
      <Head />
      <Preview>Confirma que quieres recibir novedades de P de Papel</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img
            src="https://papeleriapdepapel.com/images/text-below-transparent-bg.png"
            width="132"
            height="132"
            alt="P de Papel"
            style={logo}
          />
          <Heading style={heading}>Solo falta confirmar tu correo</Heading>
          <Text style={paragraph}>
            Confirma que quieres recibir novedades, lanzamientos y ofertas de P
            de Papel. Enviaremos como máximo dos correos al mes.
          </Text>
          <Section style={buttonSection}>
            <Button href={confirmationUrl} style={button}>
              Confirmar suscripción
            </Button>
          </Section>
          <Text style={smallText}>
            Este enlace vence en 48 horas. Si no solicitaste la suscripción,
            puedes ignorar este mensaje y no recibirás novedades.
          </Text>
          <Hr style={divider} />
          <Text style={footer}>P de Papel · Medellín, Colombia</Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f6f7fb",
  color: "#17152f",
  fontFamily: "Arial, sans-serif",
  padding: "24px 12px",
};
const container = {
  backgroundColor: "#ffffff",
  border: "1px solid #ebe7f5",
  borderRadius: "16px",
  margin: "0 auto",
  maxWidth: "560px",
  padding: "28px",
};
const logo = {
  display: "block",
  margin: "0 auto 12px",
  objectFit: "contain" as const,
};
const heading = {
  fontSize: "26px",
  lineHeight: "1.25",
  textAlign: "center" as const,
};
const paragraph = {
  fontSize: "16px",
  lineHeight: "1.6",
  textAlign: "center" as const,
};
const buttonSection = { margin: "26px 0", textAlign: "center" as const };
const button = {
  backgroundColor: "#17152f",
  borderRadius: "10px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "16px",
  fontWeight: "600",
  padding: "14px 24px",
};
const smallText = { color: "#667085", fontSize: "13px", lineHeight: "1.5" };
const divider = { borderColor: "#ebe7f5", margin: "24px 0 16px" };
const footer = {
  color: "#7c748d",
  fontSize: "12px",
  textAlign: "center" as const,
};
