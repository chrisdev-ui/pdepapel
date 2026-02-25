import {
  Body,
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

interface ContactFormEmailProps {
  name: string;
  email: string;
  subject?: string;
  message?: string;
}

export const ContactFormEmail = ({
  name = "John Doe",
  email = "john@example.com",
  subject = "Soporte de Tienda",
  message = "Tengo una duda sobre un producto de la página...",
}: ContactFormEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Nueva solicitud de contacto: {subject}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header section */}
          <Section style={headerSection}>
            <Img
              src="https://papeleriapdepapel.com/images/text-below-transparent-bg.png"
              width="200"
              height="200"
              alt="Papelería P de Papel"
              style={logo}
            />
          </Section>

          {/* Title bar */}
          <Section style={titleBar}>
            <Heading style={titleHeading}>
              📩 Nueva Solicitud de Soporte
            </Heading>
          </Section>

          {/* Main content */}
          <Section style={contentSection}>
            <Text style={greetingText}>Hola Paula,</Text>
            <Text style={paragraph}>
              ¡Buenas noticias! Alguien ha compartido sus ideas o inquietudes
              con nosotros a través del formulario de contacto en el sitio web
              de P de Papel.
            </Text>

            <Container style={detailsBox}>
              <Heading style={detailsHeading}>
                Detalles del Solicitante:
              </Heading>

              <Text style={labelValueText}>
                <strong>Nombre del cliente:</strong> {name}
              </Text>

              <Text style={labelValueText}>
                <strong>Correo electrónico:</strong> {email}
              </Text>

              <Text style={labelValueText}>
                <strong>Asunto:</strong> {subject}
              </Text>

              <div style={messageContainer}>
                <Text style={{ ...labelValueText, marginBottom: "8px" }}>
                  <strong>Mensaje:</strong>
                </Text>
                <Text style={messageContent}>{message}</Text>
              </div>
            </Container>

            <Hr style={divider} />
            <Text style={signatureText}>Saludos cordiales,</Text>
            <Text style={signatureName}>Equipo Web P de Papel</Text>
          </Section>

          {/* Footer */}
          <Section style={footerSection}>
            <Text style={footerText}>
              &copy; {new Date().getFullYear()} P de Papel. Todos los derechos
              reservados.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default ContactFormEmail;

// Inline Styles
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
  backgroundColor: "#f9d6e4",
};

const logo = {
  display: "block",
  margin: "0 auto",
  maxWidth: "200px",
  height: "auto",
  borderRadius: "8px",
};

const titleBar = {
  padding: "20px",
  textAlign: "center" as const,
  backgroundColor: "#be185d",
};

const titleHeading = {
  fontFamily: "Arial, sans-serif",
  fontSize: "20px",
  fontWeight: "bold",
  margin: "0",
  padding: "0",
  color: "#ffffff",
};

const contentSection = {
  padding: "30px",
};

const greetingText = {
  fontSize: "22px",
  lineHeight: "1.3",
  fontWeight: "700",
  color: "#1e293b",
  marginBottom: "20px",
};

const paragraph = {
  fontFamily: "Arial, sans-serif",
  marginBottom: "20px",
  lineHeight: "1.6",
  color: "#475569",
};

const detailsBox = {
  backgroundColor: "#f1f5f9",
  padding: "20px",
  borderRadius: "8px",
  marginBottom: "30px",
  borderLeft: `4px solid #be185d`,
};

const detailsHeading = {
  fontFamily: "Arial, sans-serif",
  margin: "0 0 15px 0",
  color: "#1e293b",
  fontSize: "16px",
};

const labelValueText = {
  fontFamily: "Arial, sans-serif",
  fontSize: "14px",
  color: "#475569",
  margin: "0 0 10px 0",
};

const messageContainer = {
  marginTop: "15px",
};

const messageContent = {
  fontFamily: "monospace",
  fontSize: "14px",
  color: "#475569",
  backgroundColor: "#ffffff",
  padding: "15px",
  borderRadius: "6px",
  border: "1px solid #e2e8f0",
  lineHeight: "1.5",
  margin: 0,
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
