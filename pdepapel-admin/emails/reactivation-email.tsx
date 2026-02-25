import {
  Body,
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
import * as React from "react";

interface RecommendedProduct {
  id: string;
  name: string;
  imageUrl: string;
  priceFormatted: string;
}

interface ReactivationEmailTemplateProps {
  customerName: string;
  storeName?: string;
  discountCode: string;
  discountPercentage: number;
  recommendedProducts: RecommendedProduct[];
  storeUrl?: string;
}

export const ReactivationEmailTemplate: React.FC<
  ReactivationEmailTemplateProps
> = ({
  customerName,
  storeName = "Papelería P de Papel",
  discountCode = "VUELVE-REGALO",
  discountPercentage = 10,
  recommendedProducts = [
    {
      id: "1",
      name: "Tinta De Repuesto Bolígrafo Borrable Negro",
      imageUrl:
        "https://res.cloudinary.com/dsogxa0hj/image/upload/v1771524648/tchqqgiguqd6nskxkvan.jpg",
      priceFormatted: "$ 1.300",
    },
    {
      id: "2",
      name: "Cinta Adhesiva Holográfica Decorativa",
      imageUrl:
        "https://res.cloudinary.com/dsogxa0hj/image/upload/v1771524648/tchqqgiguqd6nskxkvan.jpg",
      priceFormatted: "$ 2.000",
    },
  ],
  storeUrl = "https://papeleriapdepapel.com",
}) => {
  const firstName = customerName ? customerName.split(" ")[0] : "Cliente";
  const previewText = `¡Te extrañamos, ${firstName}! Tienes un ${discountPercentage}% de descuento esperándote.`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section
            style={{
              ...headerSection,
              backgroundColor: "#f9d6e4",
            }}
          >
            <Img
              src="https://papeleriapdepapel.com/images/text-below-transparent-bg.png"
              width="200"
              height="200"
              alt="Papelería P de Papel"
              style={logo}
            />
          </Section>

          {/* Status Banner */}
          <Section style={{ ...statusBanner, backgroundColor: "#be185d" }}>
            <Text style={{ ...statusBannerText, color: "#fff" }}>
              <span style={{ marginRight: "10px", fontSize: "24px" }}>🎁</span>
              ¡Un regalo especial para ti!
            </Text>
          </Section>

          <Section style={contentSection}>
            <Heading style={title}>
              ¡Hace mucho no te vemos por aquí! 👋
            </Heading>
            <Text style={paragraph}>
              Hola <strong>{firstName}</strong>,
            </Text>
            <Text style={paragraph}>
              Nos hemos dado cuenta de que ha pasado un tiempo desde tu último
              pedido en {storeName}. Hemos estado trabajando duro en traer cosas
              nuevas que sabemos que te encantarán.
            </Text>
            <Text style={paragraph}>
              Para celebrar tu regreso, te hemos preparado un regalo especial:
            </Text>

            <Container
              style={{
                ...orderNumberBox,
                borderLeft: `4px solid #be185d`,
                textAlign: "center" as const,
              }}
            >
              <Text style={adminNotificationLabel}>
                TU CÓDIGO DE {discountPercentage}% DE DESCUENTO:
              </Text>
              <Text style={discountCodeStyle}>{discountCode}</Text>
              <Text style={discountDisclaimer}>
                (Selecciona y copia el texto) • Aplicable en toda la tienda.
              </Text>
            </Container>

            <Section style={{ textAlign: "center", marginBottom: "35px" }}>
              <Link href={storeUrl} style={orderActionButton}>
                Redimir mi descuento ahora
              </Link>
            </Section>

            {recommendedProducts && recommendedProducts.length > 0 && (
              <Section style={{ marginBottom: "25px", width: "100%" }}>
                <Heading style={sectionTitle}>
                  ✨ Recomendaciones seleccionadas para ti:
                </Heading>

                <Section style={productGrid}>
                  {recommendedProducts.map((product) => (
                    <Section key={product.id} style={productColumn}>
                      <Img
                        src={product.imageUrl}
                        width="180"
                        height="180"
                        style={productImg}
                        alt={product.name}
                      />
                      <Text style={productName}>{product.name}</Text>
                      <Text style={productPrice}>{product.priceFormatted}</Text>
                      <Link
                        href={`${storeUrl}/product/${product.id}`}
                        style={buyButton}
                      >
                        Ver producto
                      </Link>
                    </Section>
                  ))}
                </Section>
              </Section>
            )}

            <Hr style={divider} />

            <Section>
              <Text style={signatureText}>Saludos cordiales,</Text>
              <Text style={signatureName}>Equipo Web P de Papel 📝</Text>
            </Section>
          </Section>

          {/* Footer */}
          <Section style={footerSection}>
            <Text style={footerText}>
              &copy; {new Date().getFullYear()} Papelería P de Papel Co.
              <br />
              Todos los derechos reservados.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default ReactivationEmailTemplate;

// Styles aligned with order-notification.tsx
const main = {
  backgroundColor: "#f8fafc",
  fontFamily: "Arial, sans-serif",
  padding: "20px 0",
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  borderRadius: "12px",
  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
  overflow: "hidden",
  maxWidth: "600px",
};

const headerSection = {
  padding: "30px 20px",
  textAlign: "center" as const,
};

const logo = {
  display: "block",
  margin: "0 auto",
  maxWidth: "200px",
  height: "auto",
  borderRadius: "8px",
};

const statusBanner = {
  padding: "20px",
  textAlign: "center" as const,
};

const statusBannerText = {
  fontSize: "18px",
  fontWeight: "bold",
  margin: 0,
  textAlign: "center" as const,
};

const contentSection = {
  padding: "30px",
};

const title = {
  fontSize: "22px",
  lineHeight: "1.3",
  fontWeight: "700",
  color: "#1e293b",
  textAlign: "center" as const,
  marginBottom: "20px",
};

const paragraph = {
  marginBottom: "20px",
  lineHeight: "1.6",
  color: "#475569",
};

const orderNumberBox = {
  backgroundColor: "#f1f5f9",
  padding: "20px",
  borderRadius: "8px",
  marginBottom: "30px",
};

const adminNotificationLabel = {
  textTransform: "uppercase" as const,
  fontSize: "12px",
  letterSpacing: "1px",
  marginBottom: "10px",
  color: "#94a3b8",
  textAlign: "center" as const,
  display: "block",
};

const discountCodeStyle = {
  fontFamily: 'Consolas, Monaco, "Courier New", Courier, monospace',
  fontSize: "28px",
  fontWeight: "bold",
  letterSpacing: "4px",
  color: "#be185d",
  backgroundColor: "#fce7f3",
  padding: "12px 24px",
  borderRadius: "8px",
  border: "2px dashed #f472b6",
  display: "inline-block",
  margin: "10px 0 16px",
};

const discountDisclaimer = {
  fontSize: "12px",
  color: "#64748b",
  margin: "0",
};

const sectionTitle = {
  margin: "0 0 15px 0",
  color: "#1e293b",
  fontSize: "16px",
};

const productGrid = {
  width: "100%",
};

const productColumn = {
  width: "210px",
  display: "inline-block",
  padding: "12px",
  textAlign: "left" as const,
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  border: "1px solid #bfdbfe", // pastel blue border equivalent
  margin: "10px",
  verticalAlign: "top",
};

const productImg = {
  width: "100%",
  height: "180px",
  objectFit: "cover" as const,
  borderRadius: "10px",
  marginBottom: "16px",
  backgroundColor: "#f3f4f6", // tailwind bg-gray-100 equivalent
};

const productName = {
  fontFamily: "Arial, sans-serif",
  fontSize: "15px",
  fontWeight: "600",
  color: "#1e293b",
  margin: "0 0 8px",
  lineHeight: "1.3",
  height: "40px",
  overflow: "hidden",
};

const productPrice = {
  fontFamily: "Arial, sans-serif",
  fontSize: "18px",
  fontWeight: "bold",
  color: "#111827",
  margin: "0 0 16px",
};

const buyButton = {
  display: "inline-block",
  backgroundColor: "#ffffff",
  border: "1px solid #be185d",
  borderRadius: "6px",
  color: "#be185d",
  fontSize: "12px",
  fontWeight: "bold",
  textDecoration: "none",
  textAlign: "center" as const,
  padding: "8px 16px",
  width: "80%",
};

const orderActionButton = {
  display: "inline-block",
  backgroundColor: "#f9d6e4",
  color: "#831843",
  padding: "12px 24px",
  borderRadius: "8px",
  textDecoration: "none",
  fontWeight: "bold",
  border: "2px solid #be185d",
  textAlign: "center" as const,
};

const divider = {
  borderColor: "#f1f5f9",
  borderTopWidth: "2px",
  borderTopStyle: "solid" as const,
  margin: "30px 0 20px 0",
};

const signatureText = {
  margin: "0 0 10px 0",
  color: "#475569",
};

const signatureName = {
  fontWeight: "bold",
  color: "#1e293b",
  margin: 0,
};

const footerSection = {
  backgroundColor: "#f8fafc",
  padding: "20px",
  textAlign: "center" as const,
  borderTop: "1px solid #e2e8f0",
};

const footerText = {
  color: "#64748b",
  fontSize: "12px",
  lineHeight: "1.5",
  margin: 0,
};
