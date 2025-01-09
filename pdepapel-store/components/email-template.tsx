/* eslint-disable @next/next/no-img-element */
interface EmailTemplateProps {
  name: string;
  email: string;
  subject?: string;
  message?: string;
}

export const EmailTemplate: React.FC<Readonly<EmailTemplateProps>> = ({
  name,
  email,
  subject,
  message,
}) => {
  return (
    <table
      width="100%"
      border={0}
      cellSpacing="0"
      cellPadding="0"
      bgcolor="#f9d6e4"
    >
      <tr>
        <td>&nbsp;</td>
        <td
          width="600"
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "8px",
            overflow: "hidden",
            boxShadow: "0 0 10px rgba(0, 0, 0, 0.2)",
          }}
        >
          {/* Card Start */}
          <table width="100%" border={0} cellSpacing="0" cellPadding="0">
            <tr>
              <td align="center" style={{ padding: "20px" }}>
                {/* Image  */}
                <img
                  src="https://res.cloudinary.com/dsogxa0hj/image/upload/v1704428256/wpl8rjmseskt2rzehpfg.png"
                  alt="logo"
                  width="300"
                  height="300"
                  style={{
                    display: "block",
                    width: "300px",
                    height: "auto",
                    objectFit: "contain",
                  }}
                />
              </td>
            </tr>
            <tr>
              <td
                style={{
                  textAlign: "center",
                  fontFamily: "Arial",
                  fontSize: "24px",
                  fontWeight: "bold",
                }}
              >
                {/* Title  */}
                <table width="100%" border={0} cellSpacing="0" cellPadding="0">
                  <tr>
                    <td
                      style={{
                        padding: "0 10px",
                      }}
                    >
                      Correo electrónico de formulario de contacto
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td
                style={{
                  textAlign: "left",
                  fontFamily: "Arial",
                  fontSize: "18px",
                  fontWeight: "600",
                  padding: "0 20px",
                  marginTop: "30px",
                }}
              >
                {/* Description */}
                Hola Paula,
              </td>
            </tr>
            <tr>
              <td
                style={{
                  textAlign: "left",
                  fontFamily: "Arial",
                  fontSize: "14px",
                  padding: "20px",
                  color: "#666666",
                }}
              >
                {/* Content  */}
                <div>
                  ¡Buenas noticias! Alguien ha compartido su ideas o inquietudes
                  con nosotros a través del formulario de contacto en el sitio
                  web de P de papel.
                </div>
                <div>
                  <div>Detalles:</div>
                  <div>Nombre del cliente: {name}</div>
                  <div>Correo electrónico: {email}</div>
                  <div>Asunto: {subject}</div>
                  <div>
                    Mensaje: <p>{message}</p>
                  </div>
                </div>
                <div>Saludos cordiales</div>
              </td>
            </tr>
            <tr>
              <td
                style={{
                  textAlign: "center",
                  fontFamily: "Arial",
                  fontSize: "14px",
                  padding: "20px",
                }}
              >
                {/* Footer  */}
                &copy; {new Date().getFullYear()} P de papel. Todos los derechos
                reservados.
              </td>
            </tr>
          </table>
        </td>
        <td>&nbsp;</td>
      </tr>
    </table>
  );
};
