import { OrderStatus, ShippingStatus } from "@prisma/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";

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
  orderSummary?: string;
  orderLink?: string;
  thanksParagraph?: string;
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
  orderSummary,
  orderLink,
  thanksParagraph,
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
      case OrderStatus.CANCELLED:
        return isAdminEmail
          ? `Pedido #${orderNumber} cancelado`
          : `Tu pedido #${orderNumber} ha sido cancelado`;
      default:
        return `Actualización de pedido #${orderNumber}`;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case OrderStatus.PENDING:
        return "#f59e0b";
      case OrderStatus.PAID:
        return "#10b981";
      case ShippingStatus.Shipped:
        return "#3b82f6";
      case ShippingStatus.Delivered:
        return "#059669";
      case OrderStatus.CANCELLED:
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case OrderStatus.PENDING:
        return "⏳";
      case OrderStatus.PAID:
        return "✅";
      case ShippingStatus.Shipped:
        return "🚚";
      case ShippingStatus.Delivered:
        return "📦";
      case OrderStatus.CANCELLED:
        return "❌";
      default:
        return "📋";
    }
  };

  return (
    <div
      style={{
        backgroundColor: "#f8fafc",
        padding: "20px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <table
        width="100%"
        style={{ maxWidth: "600px", margin: "0 auto" }}
        cellPadding="0"
        cellSpacing="0"
        border={0}
      >
        <tr>
          <td>
            {/* Main Container */}
            <table
              width="100%"
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "12px",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                overflow: "hidden",
              }}
              cellPadding="0"
              cellSpacing="0"
              border={0}
            >
              {/* Header with Logo */}
              <tr>
                <td
                  style={{
                    backgroundColor: "#f9d6e4",
                    padding: "30px 20px",
                    textAlign: "center",
                  }}
                >
                  <img
                    src="https://res.cloudinary.com/dsogxa0hj/image/upload/v1704428256/wpl8rjmseskt2rzehpfg.png"
                    alt="Papelería P de Papel Logo"
                    width="200"
                    height="200"
                    style={{
                      display: "block",
                      margin: "0 auto",
                      maxWidth: "200px",
                      height: "auto",
                      borderRadius: "8px",
                    }}
                  />
                </td>
              </tr>

              {/* Status Banner */}
              <tr>
                <td style={{ padding: "0" }}>
                  <div
                    style={{
                      backgroundColor: getStatusColor(),
                      color: "#ffffff",
                      padding: "20px",
                      textAlign: "center",
                      fontSize: "18px",
                      fontWeight: "bold",
                    }}
                  >
                    <span style={{ fontSize: "24px", marginRight: "10px" }}>
                      {getStatusIcon()}
                    </span>
                    {getStatusMessage()}
                  </div>
                </td>
              </tr>

              {/* Main Content */}
              <tr>
                <td style={{ padding: "30px" }}>
                  {/* Order Number */}
                  <div
                    style={{
                      backgroundColor: "#f1f5f9",
                      padding: "15px",
                      borderRadius: "8px",
                      marginBottom: "25px",
                      borderLeft: "4px solid " + getStatusColor(),
                    }}
                  >
                    <strong style={{ fontSize: "16px", color: "#1e293b" }}>
                      Número de pedido: #{orderNumber}
                    </strong>
                  </div>

                  {/* Thank you paragraph for customers */}
                  {thanksParagraph && !isAdminEmail && (
                    <div
                      style={{
                        marginBottom: "25px",
                        lineHeight: "1.6",
                        color: "#475569",
                      }}
                    >
                      {thanksParagraph}
                    </div>
                  )}

                  {/* Admin-specific customer details */}
                  {isAdminEmail && (
                    <div
                      style={{
                        backgroundColor: "#fef3c7",
                        padding: "20px",
                        borderRadius: "8px",
                        marginBottom: "25px",
                        border: "1px solid #fbbf24",
                      }}
                    >
                      <h3
                        style={{
                          margin: "0 0 15px 0",
                          color: "#92400e",
                          fontSize: "16px",
                        }}
                      >
                        📋 Detalles del cliente
                      </h3>
                      <div style={{ lineHeight: "1.8", color: "#451a03" }}>
                        <div>
                          <strong>Nombre:</strong> {name}
                        </div>
                        <div>
                          <strong>Teléfono:</strong> {phone}
                        </div>
                        <div>
                          <strong>Dirección:</strong> {address}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Order Summary */}
                  {orderSummary && (
                    <div style={{ marginBottom: "25px" }}>
                      <h3
                        style={{
                          margin: "0 0 15px 0",
                          color: "#1e293b",
                          fontSize: "16px",
                        }}
                      >
                        🛍️ Resumen de tu pedido
                      </h3>
                      <div
                        style={{
                          backgroundColor: "#f8fafc",
                          padding: "15px",
                          borderRadius: "8px",
                          border: "1px solid #e2e8f0",
                          fontFamily: "monospace",
                          fontSize: "14px",
                          lineHeight: "1.5",
                          whiteSpace: "pre-wrap",
                          color: "#475569",
                        }}
                      >
                        {orderSummary}
                      </div>
                    </div>
                  )}

                  {/* Payment Method */}
                  {paymentMethod && (
                    <div style={{ marginBottom: "20px" }}>
                      <div style={{ color: "#475569", lineHeight: "1.6" }}>
                        <strong style={{ color: "#1e293b" }}>
                          💳 Método de pago:
                        </strong>{" "}
                        {paymentMethod}
                      </div>
                    </div>
                  )}

                  {/* Tracking Information */}
                  {trackingInfo && (
                    <div
                      style={{
                        backgroundColor: "#dbeafe",
                        padding: "20px",
                        borderRadius: "8px",
                        marginBottom: "25px",
                        border: "1px solid #3b82f6",
                      }}
                    >
                      <h3
                        style={{
                          margin: "0 0 15px 0",
                          color: "#1e40af",
                          fontSize: "16px",
                        }}
                      >
                        🚚 Información de envío
                      </h3>
                      <div style={{ color: "#1e40af", lineHeight: "1.6" }}>
                        <div style={{ marginBottom: "10px" }}>
                          <strong>Guía de envío:</strong> {trackingInfo}
                        </div>
                        <a
                          href={`https://interrapidisimo.com/sigue-tu-envio/?codigo=${trackingInfo}`}
                          style={{
                            display: "inline-block",
                            backgroundColor: "#3b82f6",
                            color: "#ffffff",
                            padding: "10px 20px",
                            borderRadius: "6px",
                            textDecoration: "none",
                            fontWeight: "bold",
                            marginTop: "10px",
                          }}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Consultar estado del envío
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Order Link for customers */}
                  {orderLink && !isAdminEmail && (
                    <div style={{ textAlign: "center", marginBottom: "25px" }}>
                      <a
                        href={orderLink}
                        style={{
                          display: "inline-block",
                          backgroundColor: "#f9d6e4",
                          color: "#831843",
                          padding: "12px 24px",
                          borderRadius: "8px",
                          textDecoration: "none",
                          fontWeight: "bold",
                          border: "2px solid #be185d",
                        }}
                      >
                        Ver o modificar mi pedido
                      </a>
                    </div>
                  )}

                  {/* Date */}
                  <div
                    style={{
                      color: "#64748b",
                      fontSize: "14px",
                      marginBottom: "25px",
                    }}
                  >
                    <strong>📅 Fecha:</strong>{" "}
                    {format(new Date(), "dd 'de' MMMM 'de' yyyy", {
                      locale: es,
                    })}
                  </div>

                  {/* Signature */}
                  <div
                    style={{
                      borderTop: "2px solid #f1f5f9",
                      paddingTop: "20px",
                      color: "#475569",
                      lineHeight: "1.6",
                    }}
                  >
                    <div style={{ marginBottom: "10px" }}>
                      Saludos cordiales,
                    </div>
                    <div style={{ fontWeight: "bold", color: "#1e293b" }}>
                      El equipo de Papelería P de Papel 📝
                    </div>
                  </div>
                </td>
              </tr>

              {/* Footer */}
              <tr>
                <td
                  style={{
                    backgroundColor: "#f8fafc",
                    padding: "20px",
                    textAlign: "center",
                    borderTop: "1px solid #e2e8f0",
                  }}
                >
                  <div
                    style={{
                      color: "#64748b",
                      fontSize: "12px",
                      lineHeight: "1.5",
                    }}
                  >
                    <div style={{ marginBottom: "5px" }}>
                      &copy; {new Date().getFullYear()} Papelería P de Papel Co.
                    </div>
                    <div>Todos los derechos reservados.</div>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  );
};
