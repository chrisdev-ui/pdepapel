import { OrderStatus, ShippingStatus } from "@prisma/client";
import { format } from "date-fns";

/* eslint-disable @next/next/no-img-element */
interface EmailTemplateProps {
  name: string;
  orderNumber: string;
  status: OrderStatus | ShippingStatus;
  isAdminEmail?: boolean;
  paymentMethod?: string;
  trackingInfo?: string;
  address?: string;
  phone?: string;
}

export const EmailTemplate: React.FC<Readonly<EmailTemplateProps>> = ({
  name,
  orderNumber,
  status,
  isAdminEmail = false,
  paymentMethod,
  trackingInfo,
  address,
  phone,
}) => {
  const getStatusMessage = () => {
    switch (status) {
      case OrderStatus.PENDING:
        return isAdminEmail
          ? `Nuevo pedido de ${name}`
          : `¡Gracias por tu pedido ${name}!`;
      case OrderStatus.PAID:
        return isAdminEmail
          ? `Pago confirmado para pedido #${orderNumber}`
          : `¡Pago confirmado para tu pedido #${orderNumber}!`;
      case ShippingStatus.Shipped:
        return isAdminEmail
          ? `Pedido #${orderNumber} enviado`
          : `¡Tu pedido #${orderNumber} ha sido enviado!`;
      case ShippingStatus.Delivered:
        return isAdminEmail
          ? `Pedido #${orderNumber} entregado`
          : `¡Tu pedido #${orderNumber} ha sido entregado!`;
      default:
        return `Actualización de pedido #${orderNumber}`;
    }
  };

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
                  padding: "0 20px",
                }}
              >
                {getStatusMessage()}
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
                <div>
                  <strong>Número de pedido:</strong> #{orderNumber}
                </div>

                {isAdminEmail && (
                  <>
                    <div style={{ marginTop: "15px" }}>
                      <strong>Detalles del cliente:</strong>
                      <br />
                      <strong>Nombre:</strong> {name}
                      <br />
                      <strong>Teléfono:</strong> {phone}
                      <br />
                      <strong>Dirección:</strong> {address}
                    </div>
                  </>
                )}

                {paymentMethod && (
                  <div style={{ marginTop: "10px" }}>
                    <strong>Método de pago:</strong> {paymentMethod}
                  </div>
                )}

                {trackingInfo && (
                  <div style={{ marginTop: "10px" }}>
                    <strong>Información de seguimiento:</strong> {trackingInfo}
                  </div>
                )}

                {!isAdminEmail &&
                  status === ShippingStatus.Shipped &&
                  trackingInfo && (
                    <div
                      style={{
                        marginTop: "20px",
                        padding: "15px",
                        backgroundColor: "#f0f0f0",
                        borderRadius: "5px",
                      }}
                    >
                      <p>Puedes rastrear tu pedido usando este enlace:</p>
                      <p>
                        <a
                          href={`https://rastreo.example.com/${trackingInfo}`}
                          style={{
                            color: "#0066cc",
                            textDecoration: "underline",
                          }}
                        >
                          Seguir mi pedido
                        </a>
                      </p>
                    </div>
                  )}

                <div style={{ marginTop: "20px" }}>
                  <strong>Fecha:</strong> {format(new Date(), "dd/MM/yyyy")}
                </div>

                <div style={{ marginTop: "20px" }}>
                  Saludos cordiales,
                  <br />
                  El equipo de Papelería P de Papel
                </div>
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
                &copy; {new Date().getFullYear()} Papelería P de Papel Co. Todos
                los derechos reservados.
              </td>
            </tr>
          </table>
        </td>
        <td>&nbsp;</td>
      </tr>
    </table>
  );
};
