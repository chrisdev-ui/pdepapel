import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface NewsletterWelcomeProps {
  shopUrl: string;
  unsubscribeUrl: string;
}

export function NewsletterWelcome({
  shopUrl,
  unsubscribeUrl,
}: NewsletterWelcomeProps) {
  return (
    <Html>
      <Head />
      <Preview>Tu suscripción a P de Papel quedó confirmada</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img
            src="https://papeleriapdepapel.com/images/text-below-transparent-bg.png"
            width="132"
            height="132"
            alt="P de Papel"
            style={logo}
          />
          <Heading style={heading}>
            ¡Ya haces parte de nuestras novedades!
          </Heading>
          <Text style={paragraph}>
            Te contaremos sobre productos nuevos, la llegada de mercancía y
            ofertas especiales. Enviaremos como máximo dos correos al mes.
          </Text>
          <Section style={buttonSection}>
            <Button href={shopUrl} style={button}>
              Explorar la tienda
            </Button>
          </Section>
          <Hr style={divider} />
          <Text style={footer}>
            P de Papel · Medellín, Colombia
            <br />
            Puedes <Link href={unsubscribeUrl}>cancelar la suscripción</Link> en
            cualquier momento, sin iniciar sesión.
          </Text>
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
const divider = { borderColor: "#ebe7f5", margin: "24px 0 16px" };
const footer = {
  color: "#667085",
  fontSize: "12px",
  lineHeight: "1.6",
  textAlign: "center" as const,
};
