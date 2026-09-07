import {
  Body,
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

export type MercadoLibreHealthSummaryAction = {
  label: string;
  href: string;
  primary?: boolean;
};

export type MercadoLibreHealthSummaryItem = {
  title: string;
  detail: string;
  actions: MercadoLibreHealthSummaryAction[];
};

export type MercadoLibreHealthSummaryGroup = {
  kind: string;
  title: string;
  description: string;
  items: MercadoLibreHealthSummaryItem[];
  hidden: number;
};

export type MercadoLibreHealthSummaryProps = {
  generatedAt: string;
  totalIssues: number;
  dashboardUrl: string;
  metrics: {
    unansweredQuestions: number;
    shipmentsToDispatch: number;
    claimsRequiringAttention: number;
    activeListings: number;
    totalListings: number;
  };
  groups: MercadoLibreHealthSummaryGroup[];
  hiddenIssues: number;
};

export function MercadoLibreHealthSummary({
  generatedAt,
  totalIssues,
  dashboardUrl,
  metrics,
  groups,
  hiddenIssues,
}: MercadoLibreHealthSummaryProps) {
  const headline =
    totalIssues === 1
      ? "1 revisión pendiente"
      : `${totalIssues} revisiones pendientes`;

  return (
    <Html>
      <Head />
      <Preview>{`Mercado Libre: ${headline}. No es una venta nueva.`}</Preview>
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
            <Text style={eyebrow}>Revisión automática diaria</Text>
            <Heading style={heading}>{headline}</Heading>
            <Text style={headerDate}>{generatedAt}</Text>
          </Section>

          <Section style={content}>
            <Container style={noticeBox}>
              <Text style={noticeText}>
                <strong>No es una venta nueva.</strong> Este resumen revisa la
                conexión con Mercado Libre una vez al día y agrupa lo que
                necesita tu atención, con un acceso directo por cada caso.
              </Text>
            </Container>

            <Row style={metricsRow}>
              <Column style={metricColumn}>
                <Text style={metricValue}>{metrics.unansweredQuestions}</Text>
                <Text style={metricLabel}>Preguntas sin responder</Text>
              </Column>
              <Column style={metricColumn}>
                <Text style={metricValue}>{metrics.shipmentsToDispatch}</Text>
                <Text style={metricLabel}>Envíos por despachar</Text>
              </Column>
              <Column style={metricColumnLast}>
                <Text style={metricValue}>
                  {metrics.claimsRequiringAttention}
                </Text>
                <Text style={metricLabel}>Reclamos por revisar</Text>
              </Column>
            </Row>
            <Text style={listingsLine}>
              Publicaciones activas: {metrics.activeListings} de{" "}
              {metrics.totalListings}
            </Text>

            {groups.map((group) => (
              <Section key={group.kind} style={groupSection}>
                <Heading as="h2" style={groupTitle}>
                  {group.title}{" "}
                  <span style={groupCount}>
                    ({group.items.length + group.hidden})
                  </span>
                </Heading>
                <Text style={groupDescription}>{group.description}</Text>

                {group.items.map((item, index) => (
                  <Container key={`${group.kind}-${index}`} style={itemBox}>
                    <Text style={itemTitle}>{item.title}</Text>
                    <Text style={itemDetail}>{item.detail}</Text>
                    <Text style={itemActions}>
                      {item.actions.map((action, actionIndex) => (
                        <Link
                          key={`${action.href}-${actionIndex}`}
                          href={action.href}
                          style={
                            action.primary
                              ? primaryActionLink
                              : secondaryActionLink
                          }
                        >
                          {action.label}
                        </Link>
                      ))}
                    </Text>
                  </Container>
                ))}

                {group.hidden > 0 ? (
                  <Text style={hiddenText}>
                    {group.hidden === 1
                      ? "1 caso más de este tipo en Administración."
                      : `${group.hidden} casos más de este tipo en Administración.`}
                  </Text>
                ) : null}
              </Section>
            ))}

            <Section style={actionSection}>
              <Link href={dashboardUrl} style={actionButton}>
                Abrir Mercado Libre en Administración
              </Link>
              {hiddenIssues > 0 ? (
                <Text style={hiddenSummary}>
                  Allí verás los {hiddenIssues} casos que no caben en este
                  correo.
                </Text>
              ) : null}
            </Section>

            <Hr style={divider} />
            <Text style={footer}>
              Recibes este correo una vez al día mientras haya revisiones
              pendientes. Si ya resolviste todo, mañana no llegará.
            </Text>
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

const headerDate = {
  color: "#64748b",
  fontSize: "13px",
  margin: "8px 0 0",
};

const content = {
  padding: "24px 32px 32px",
};

const noticeBox = {
  backgroundColor: "#f8fafc",
  borderLeft: "4px solid #ffe600",
  borderRadius: "8px",
  marginBottom: "20px",
  padding: "12px 16px",
};

const noticeText = {
  color: "#334155",
  fontSize: "14px",
  lineHeight: "1.55",
  margin: "0",
};

const metricsRow = {
  marginBottom: "6px",
};

const metricColumn = {
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  padding: "12px 8px",
  textAlign: "center" as const,
  verticalAlign: "top" as const,
  width: "33%",
};

const metricColumnLast = {
  ...metricColumn,
};

const metricValue = {
  color: "#0f172a",
  fontSize: "24px",
  fontWeight: "bold",
  lineHeight: "1.1",
  margin: "0 0 4px",
};

const metricLabel = {
  color: "#475569",
  fontSize: "12px",
  lineHeight: "1.3",
  margin: "0",
};

const listingsLine = {
  color: "#64748b",
  fontSize: "13px",
  margin: "10px 0 0",
  textAlign: "center" as const,
};

const groupSection = {
  marginTop: "26px",
};

const groupTitle = {
  color: "#0f172a",
  fontSize: "17px",
  margin: "0 0 4px",
};

const groupCount = {
  color: "#64748b",
  fontWeight: "normal",
};

const groupDescription = {
  color: "#64748b",
  fontSize: "13px",
  lineHeight: "1.5",
  margin: "0 0 12px",
};

const itemBox = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  marginBottom: "10px",
  padding: "12px 14px",
};

const itemTitle = {
  color: "#0f172a",
  fontSize: "15px",
  fontWeight: "bold",
  lineHeight: "1.4",
  margin: "0 0 4px",
};

const itemDetail = {
  color: "#334155",
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "0 0 10px",
};

const itemActions = {
  margin: "0",
};

const actionLinkBase = {
  borderRadius: "6px",
  display: "inline-block",
  fontSize: "13px",
  fontWeight: "bold",
  marginBottom: "6px",
  marginRight: "8px",
  padding: "7px 12px",
  textDecoration: "none",
};

const primaryActionLink = {
  ...actionLinkBase,
  backgroundColor: "#0f172a",
  color: "#ffffff",
};

const secondaryActionLink = {
  ...actionLinkBase,
  backgroundColor: "#ffffff",
  border: "1px solid #cbd5e1",
  color: "#0f172a",
};

const hiddenText = {
  color: "#64748b",
  fontSize: "13px",
  margin: "2px 0 0",
};

const actionSection = {
  marginTop: "30px",
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

const hiddenSummary = {
  color: "#64748b",
  fontSize: "13px",
  margin: "12px 0 0",
};

const divider = {
  borderColor: "#e2e8f0",
  margin: "28px 0 16px",
};

const footer = {
  color: "#94a3b8",
  fontSize: "12px",
  lineHeight: "1.5",
  margin: "0",
  textAlign: "center" as const,
};
