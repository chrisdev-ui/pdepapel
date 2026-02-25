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

interface OrderNotificationProps {
  name: string;
  orderNumber: string;
  status: string; // "PENDING", "PAID", "SENT", "DELIVERED", "CANCELLED"
  isAdminEmail?: boolean;
  paymentMethod?: string;
  trackingInfo?: string;
  address?: string;
  phone?: string;
  email?: string;
  total?: string;
  orderSummary?: string;
  orderLink?: string;
  thanksParagraph?: string;
  city?: string;
}

export const OrderNotification = ({
  name = "John Doe",
  orderNumber = "123456",
  status = "PAID",
  isAdminEmail = false,
  paymentMethod = "Wompi",
  trackingInfo = "TRACK-123",
  address = "Calle 123",
  phone = "1234567890",
  email = "john@example.com",
  total = "$ 50.000",
  orderSummary = "• Producto x1\n• Otro producto x2",
  orderLink = "https://papeleriapdepapel.com",
  thanksParagraph = "¡Gracias por tu compra!",
  city = "Bogotá",
}: OrderNotificationProps) => {
  const getStatusMessage = () => {
    switch (status) {
      case "PENDING":
        return isAdminEmail
          ? `Nuevo pedido de ${name}`
          : `¡Gracias por tu pedido ${name}!`;
      case "PAID":
        return isAdminEmail
          ? `Pago confirmado para pedido #${orderNumber}`
          : `¡Pago confirmado para tu pedido #${orderNumber}!`;
      case "SENT":
      case "SHIPPED": // ShippingStatus
        return isAdminEmail
          ? `Pedido #${orderNumber} enviado`
          : `¡Tu pedido #${orderNumber} ha sido enviado!`;
      case "DELIVERED":
        return isAdminEmail
          ? `Pedido #${orderNumber} entregado`
          : `¡Tu pedido #${orderNumber} ha sido entregado!`;
      case "CANCELLED":
        return isAdminEmail
          ? `Pedido #${orderNumber} cancelado`
          : `Tu pedido #${orderNumber} ha sido cancelado`;
      default:
        return `Actualización de pedido #${orderNumber}`;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case "PENDING":
        return "#f59e0b";
      case "PAID":
        return "#10b981";
      case "SENT":
      case "SHIPPED":
        return "#3b82f6";
      case "DELIVERED":
        return "#059669";
      case "CANCELLED":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "PENDING":
        return "⏳";
      case "PAID":
        return "✅";
      case "SENT":
      case "SHIPPED":
        return "🚚";
      case "DELIVERED":
        return "📦";
      case "CANCELLED":
        return "❌";
      default:
        return "📋";
    }
  };

  const statusColor = getStatusColor();
  const statusMessage = getStatusMessage();

  return (
    <Html>
      <Head />
      <Preview>{statusMessage}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section
            style={{
              ...headerSection,
              backgroundColor: isAdminEmail ? "#f1f5f9" : "#f9d6e4",
              borderBottom: isAdminEmail ? "1px solid #e2e8f0" : "none",
            }}
          >
            <Img
              src="https://papeleriapdepapel.com/images/text-below-transparent-bg.png"
              width="200"
              height="200"
              alt="Papelería P de Papel"
              style={logo}
            />
            {isAdminEmail && (
              <Text style={adminBadge}>Panel de Administración</Text>
            )}
          </Section>

          {/* Status Banner */}
          {isAdminEmail ? (
            <Section
              style={{
                ...statusBanner,
                backgroundColor: "#1e293b",
                borderBottom: `4px solid ${statusColor}`,
              }}
            >
              <Text style={adminNotificationLabel}>
                Notificación Administrativa
              </Text>
              <Text style={{ ...statusBannerText, color: "#fff" }}>
                <span style={{ marginRight: "10px" }}>{getStatusIcon()}</span>
                {statusMessage}
              </Text>
            </Section>
          ) : (
            <Section style={{ ...statusBanner, backgroundColor: statusColor }}>
              <Text style={{ ...statusBannerText, color: "#fff" }}>
                <span style={{ marginRight: "10px", fontSize: "24px" }}>
                  {getStatusIcon()}
                </span>
                {statusMessage}
              </Text>
            </Section>
          )}

          <Section style={contentSection}>
            <Container
              style={{
                ...orderNumberBox,
                borderLeft: `4px solid ${statusColor}`,
              }}
            >
              <Text style={orderNumberText}>
                Número de pedido: #{orderNumber}
              </Text>
            </Container>

            {thanksParagraph && !isAdminEmail && (
              <Text style={paragraph}>{thanksParagraph}</Text>
            )}

            {isAdminEmail && (
              <Container style={adminDetailsBox}>
                <Heading style={adminDetailsTitle}>
                  🪪 Detalles Técnicos del Pedido
                </Heading>
                <Text style={adminDetailsText}>
                  <strong>Cliente:</strong> {name}
                </Text>
                <Text style={adminDetailsText}>
                  <strong>Email:</strong> {email || "N/A"}
                </Text>
                <Text style={adminDetailsText}>
                  <strong>Teléfono:</strong> {phone || "N/A"}
                </Text>
                <Text style={adminDetailsText}>
                  <strong>Dirección:</strong> {address || "N/A"}
                </Text>
                <Text style={adminDetailsText}>
                  <strong>Ciudad:</strong> {city || "N/A"}
                </Text>
                {total && (
                  <Text style={adminDetailsText}>
                    <strong>Total:</strong> {total}
                  </Text>
                )}
              </Container>
            )}

            {orderSummary && (
              <Section style={{ marginBottom: "25px" }}>
                <Heading style={sectionTitle}>🛍️ Resumen de tu pedido</Heading>
                <Container style={summaryBox}>
                  <Text style={summaryText}>{orderSummary}</Text>
                </Container>
              </Section>
            )}

            {paymentMethod && (
              <Text style={paragraph}>
                <strong>💳 Método de pago:</strong> {paymentMethod}
              </Text>
            )}

            {trackingInfo && (
              <Container style={trackingBox}>
                <Heading style={trackingTitle}>🚚 Información de envío</Heading>
                <Text style={trackingText}>
                  <strong>Guía de envío:</strong> {trackingInfo}
                </Text>
                <Link
                  href={`https://www.envioclick.com/co/track/${trackingInfo}`}
                  style={trackingLink}
                >
                  Consultar estado del envío
                </Link>
              </Container>
            )}

            {orderLink && !isAdminEmail && (
              <Section style={{ textAlign: "center", marginBottom: "25px" }}>
                <Link href={orderLink} style={orderActionButton}>
                  Ver o modificar mi pedido
                </Link>
              </Section>
            )}

            <Text style={dateText}>
              <strong>📅 Fecha:</strong>{" "}
              {new Date().toLocaleDateString("es-ES", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </Text>

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

export default OrderNotification;

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

const adminBadge = {
  marginTop: "10px",
  color: "#475569",
  fontSize: "14px",
  fontWeight: "bold",
  textAlign: "center" as const,
};

const statusBanner = {
  padding: "20px",
  textAlign: "center" as const,
};

const adminNotificationLabel = {
  textTransform: "uppercase" as const,
  fontSize: "12px",
  letterSpacing: "1px",
  marginBottom: "10px",
  color: "#94a3b8",
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

const orderNumberBox = {
  backgroundColor: "#f1f5f9",
  padding: "15px",
  borderRadius: "8px",
  marginBottom: "25px",
};

const orderNumberText = {
  fontSize: "16px",
  color: "#1e293b",
  fontWeight: "bold",
  margin: 0,
};

const paragraph = {
  marginBottom: "25px",
  lineHeight: "1.6",
  color: "#475569",
};

const adminDetailsBox = {
  backgroundColor: "#fefce8",
  padding: "20px",
  borderRadius: "8px",
  marginBottom: "25px",
  border: "1px solid #facc15",
};

const adminDetailsTitle = {
  margin: "0 0 15px 0",
  color: "#854d0e",
  fontSize: "16px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  borderBottom: "1px solid #fde047",
  paddingBottom: "10px",
};

const adminDetailsText = {
  color: "#422006",
  margin: "5px 0",
};

const sectionTitle = {
  margin: "0 0 15px 0",
  color: "#1e293b",
  fontSize: "16px",
};

const summaryBox = {
  backgroundColor: "#f8fafc",
  padding: "15px",
  borderRadius: "8px",
  border: "1px solid #e2e8f0",
};

const summaryText = {
  fontFamily: "monospace",
  fontSize: "14px",
  lineHeight: "1.5",
  whiteSpace: "pre-wrap" as const,
  color: "#475569",
  margin: 0,
};

const trackingBox = {
  backgroundColor: "#dbeafe",
  padding: "20px",
  borderRadius: "8px",
  marginBottom: "25px",
  border: "1px solid #3b82f6",
};

const trackingTitle = {
  margin: "0 0 15px 0",
  color: "#1e40af",
  fontSize: "16px",
};

const trackingText = {
  color: "#1e40af",
  lineHeight: "1.6",
  margin: "0 0 10px 0",
};

const trackingLink = {
  display: "inline-block",
  backgroundColor: "#3b82f6",
  color: "#ffffff",
  padding: "10px 20px",
  borderRadius: "6px",
  textDecoration: "none",
  fontWeight: "bold",
  marginTop: "10px",
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

const dateText = {
  color: "#64748b",
  fontSize: "14px",
  marginBottom: "25px",
};

const divider = {
  borderColor: "#f1f5f9",
  borderTopWidth: "2px",
  borderTopStyle: "solid" as const,
  margin: "20px 0",
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
