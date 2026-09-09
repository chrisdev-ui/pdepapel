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

import { ProductRow } from "./newsletter-early-access";

interface NewsletterArrivalProps {
  title: string;
  subtitle: string | null;
  shopUrl: string;
  products: { name: string; imageUrl: string | null; url: string }[];
  unsubscribeUrl: string;
}

export function NewsletterArrival({ title, subtitle, shopUrl, products, unsubscribeUrl }: NewsletterArrivalProps) {
  return (
    <Html>
      <Head />
      <Preview>Ya llegó: {title}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img src="https://papeleriapdepapel.com/images/text-below-transparent-bg.png" width="132" height="132" alt="P de Papel" style={logo} />
          <Text style={eyebrow}>Ya está en la tienda</Text>
          <Heading style={heading}>{title}</Heading>
          {subtitle && <Text style={paragraph}>{subtitle}</Text>}
          <Section style={buttonSection}>
            <Button href={shopUrl} style={button}>
              Ver lo que llegó
            </Button>
          </Section>
          <ProductRow products={products} />
          <Hr style={divider} />
          <Text style={footer}>
            P de Papel · Medellín, Colombia. Máximo dos correos al mes; puedes <Link href={unsubscribeUrl}>cancelar la suscripción</Link> sin iniciar sesión.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: "#f6f7fb", color: "#17152f", fontFamily: "Arial, sans-serif", padding: "24px 12px" };
const container = { backgroundColor: "#ffffff", border: "1px solid #ebe7f5", borderRadius: "16px", margin: "0 auto", maxWidth: "560px", padding: "28px" };
const logo = { display: "block", margin: "0 auto 12px", objectFit: "contain" as const };
const eyebrow = { color: "#1f8f5a", fontSize: "12px", fontWeight: "700", letterSpacing: "0.08em", margin: "0", textAlign: "center" as const, textTransform: "uppercase" as const };
const heading = { fontSize: "26px", lineHeight: "1.25", margin: "8px 0 12px", textAlign: "center" as const };
const paragraph = { fontSize: "16px", lineHeight: "1.6", textAlign: "center" as const };
const buttonSection = { margin: "22px 0", textAlign: "center" as const };
const button = { backgroundColor: "#17152f", borderRadius: "10px", color: "#ffffff", display: "inline-block", fontSize: "16px", fontWeight: "600", padding: "14px 24px" };
const divider = { borderColor: "#ebe7f5", margin: "24px 0 16px" };
const footer = { color: "#667085", fontSize: "12px", lineHeight: "1.6", textAlign: "center" as const };
