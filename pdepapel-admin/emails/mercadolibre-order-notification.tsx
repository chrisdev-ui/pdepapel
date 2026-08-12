import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type MercadoLibreOrderNotificationProps = {
  buyerName: string | null;
  inventoryStatus: string;
  orderNumber: string;
  orderSummary: string;
  orderUrl: string;
  netAmount: string | null;
  paidAt: string | null;
};

const inventoryLabels: Record<string, string> = {
  DECREMENTED: "Inventario descontado y sincronizado",
  EXCEPTION: "Requiere revisión de inventario",
  NOT_APPLIED: "Pendiente de aplicar al inventario",
  RESTOCK_PENDING: "Pendiente de devolución física",
};

export function MercadoLibreOrderNotification({
  buyerName,
  inventoryStatus,
  orderNumber,
  orderSummary,
  orderUrl,
  netAmount,
  paidAt,
}: MercadoLibreOrderNotificationProps) {
  const inventoryLabel =
    inventoryLabels[inventoryStatus] ?? "Venta registrada en el panel";

  return (
    <Html>
      <Head />
      <Preview>
        Venta pagada y registrada de Mercado Libre #{orderNumber}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src="https://admin.papeleriapdepapel.com/images/marketplaces/mercadolibre-logo.png"
              width="134"
              height="34"
              alt="Mercado Libre"
              style={mercadoLibreLogo}
            />
            <Text style={eyebrow}>Notificación administrativa</Text>
            <Heading style={heading}>Venta pagada y registrada</Heading>
          </Section>

          <Section style={content}>
            <Container style={orderBox}>
              <Text style={orderNumberText}>Venta #{orderNumber}</Text>
              <Text style={orderTotal}>
                {netAmount
                  ? `Neto de la venta: ${netAmount}`
                  : "Liquidación neta: pendiente de Mercado Libre"}
              </Text>
            </Container>

            <Text style={paragraph}>
              <strong>Comprador:</strong> {buyerName ?? "No disponible"}
            </Text>
            {paidAt ? (
              <Text style={paragraph}>
                <strong>Pago confirmado:</strong> {paidAt}
              </Text>
            ) : null}
            <Text style={paragraph}>
              <strong>Origen del aviso:</strong> Mercado Libre confirmó el pago
              de esta venta. Los cambios de envío no generan este correo.
            </Text>
            {netAmount === null ? (
              <Text style={paragraph}>
                <strong>Liquidación:</strong> Mercado Libre todavía no publicó
                el valor neto. P de Papel lo actualizará automáticamente sin
                modificar el inventario ni esta venta.
              </Text>
            ) : null}
            <Text style={paragraph}>
              <strong>Vínculo en P de Papel:</strong> {inventoryLabel}
            </Text>

            <Heading as="h2" style={sectionTitle}>
              Productos vinculados
            </Heading>
            <Container style={summaryBox}>
              <Text style={summaryText}>{orderSummary}</Text>
            </Container>

            <Section style={actionSection}>
              <Link href={orderUrl} style={actionButton}>
                Ver venta en Administración
              </Link>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f8fafc",
  fontFamily: "Arial, sans-serif",
  padding: "24px 0",
};

const container = {
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  margin: "0 auto",
  maxWidth: "600px",
  overflow: "hidden",
};

const header = {
  backgroundColor: "#fff8cf",
  padding: "28px 32px 24px",
  textAlign: "center" as const,
};

const mercadoLibreLogo = {
  display: "block",
  height: "34px",
  margin: "0 auto 18px",
  width: "134px",
};

const eyebrow = {
  color: "#475569",
  fontSize: "12px",
  fontWeight: "bold",
  letterSpacing: "0.8px",
  margin: "0 0 8px",
  textTransform: "uppercase" as const,
};

const heading = {
  color: "#0f172a",
  fontSize: "24px",
  margin: "0",
};

const content = {
  padding: "28px 32px 32px",
};

const orderBox = {
  backgroundColor: "#f8fafc",
  borderLeft: "4px solid #ffe600",
  borderRadius: "8px",
  marginBottom: "22px",
  padding: "16px",
};

const orderNumberText = {
  color: "#0f172a",
  fontSize: "17px",
  fontWeight: "bold",
  margin: "0 0 6px",
};

const orderTotal = {
  color: "#334155",
  fontSize: "15px",
  margin: "0",
};

const paragraph = {
  color: "#334155",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 12px",
};

const sectionTitle = {
  color: "#0f172a",
  fontSize: "16px",
  margin: "26px 0 12px",
};

const summaryBox = {
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  padding: "14px",
};

const summaryText = {
  color: "#334155",
  fontFamily: "monospace",
  fontSize: "14px",
  lineHeight: "1.55",
  margin: "0",
  whiteSpace: "pre-wrap" as const,
};

const actionSection = {
  marginTop: "28px",
  textAlign: "center" as const,
};

const actionButton = {
  backgroundColor: "#0f172a",
  borderRadius: "8px",
  color: "#ffffff",
  display: "inline-block",
  fontWeight: "bold",
  padding: "12px 20px",
  textDecoration: "none",
};
