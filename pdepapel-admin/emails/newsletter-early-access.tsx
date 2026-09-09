import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

interface Product {
  name: string;
  imageUrl: string | null;
  url: string;
}

interface NewsletterEarlyAccessProps {
  title: string;
  subtitle: string | null;
  accessUrl: string;
  products: Product[];
  expiresAt: Date;
  unsubscribeUrl: string;
}

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", timeZone: "America/Bogota" }).format(value);

export function NewsletterEarlyAccess({ title, subtitle, accessUrl, products, expiresAt, unsubscribeUrl }: NewsletterEarlyAccessProps) {
  return (
    <Html>
      <Head />
      <Preview>Tienes acceso anticipado: {title}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img src="https://papeleriapdepapel.com/images/text-below-transparent-bg.png" width="132" height="132" alt="P de Papel" style={logo} />
          <Text style={eyebrow}>Solo para suscriptoras</Text>
          <Heading style={heading}>{title}</Heading>
          {subtitle && <Text style={paragraph}>{subtitle}</Text>}
          <Text style={paragraph}>
            Lo prometido: puedes comprar lo nuevo antes de que salga para todo el mundo. Tu enlace vale hasta el {formatDate(expiresAt)}.
          </Text>
          <Section style={buttonSection}>
            <Button href={accessUrl} style={button}>
              Entrar con acceso anticipado
            </Button>
          </Section>
          <ProductRow products={products} />
          <Hr style={divider} />
          <Text style={footer}>
            P de Papel · Medellín, Colombia. Recibes este correo porque confirmaste tu suscripción; puedes{" "}
            <Link href={unsubscribeUrl}>cancelarla aquí</Link>, sin iniciar sesión.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function ProductRow({ products }: { products: Product[] }) {
  if (products.length === 0) return null;
  return (
    <Section style={{ margin: "8px 0 4px" }}>
      <Row>
        {products.slice(0, 3).map((product) => (
          <Column key={product.url} style={productColumn}>
            <Link href={product.url} style={{ color: "#17152f", textDecoration: "none" }}>
              {product.imageUrl ? (
                <Img src={product.imageUrl} width="150" height="150" alt="" style={productImage} />
              ) : (
                <div style={{ ...productImage, backgroundColor: "#f3e8ff" }} />
              )}
              <Text style={productName}>{product.name}</Text>
            </Link>
          </Column>
        ))}
      </Row>
    </Section>
  );
}

const main = { backgroundColor: "#f6f7fb", color: "#17152f", fontFamily: "Arial, sans-serif", padding: "24px 12px" };
const container = { backgroundColor: "#ffffff", border: "1px solid #ebe7f5", borderRadius: "16px", margin: "0 auto", maxWidth: "560px", padding: "28px" };
const logo = { display: "block", margin: "0 auto 12px", objectFit: "contain" as const };
const eyebrow = { color: "#d8467a", fontSize: "12px", fontWeight: "700", letterSpacing: "0.08em", margin: "0", textAlign: "center" as const, textTransform: "uppercase" as const };
const heading = { fontSize: "26px", lineHeight: "1.25", margin: "8px 0 12px", textAlign: "center" as const };
const paragraph = { fontSize: "16px", lineHeight: "1.6", textAlign: "center" as const };
const buttonSection = { margin: "22px 0", textAlign: "center" as const };
const button = { backgroundColor: "#17152f", borderRadius: "10px", color: "#ffffff", display: "inline-block", fontSize: "16px", fontWeight: "600", padding: "14px 24px" };
const productColumn = { padding: "0 6px", textAlign: "center" as const, verticalAlign: "top" as const, width: "33%" };
const productImage = { borderRadius: "12px", display: "block", margin: "0 auto", objectFit: "cover" as const, width: "150px", height: "150px" };
const productName = { fontSize: "13px", fontWeight: "600", lineHeight: "1.3", margin: "8px 0 0" };
const divider = { borderColor: "#ebe7f5", margin: "24px 0 16px" };
const footer = { color: "#667085", fontSize: "12px", lineHeight: "1.6", textAlign: "center" as const };
