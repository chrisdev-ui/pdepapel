import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// Register custom fonts using stable fontsource links
Font.register({
  family: "Inter",
  fonts: [
    {
      src: "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf",
      fontWeight: 400,
    },
    {
      src: "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-600-normal.ttf",
      fontWeight: 600,
    },
    {
      src: "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf",
      fontWeight: 700,
    },
  ],
});

const styles = StyleSheet.create({
  page: {
    fontFamily: "Inter",
    fontSize: 9.5,
    paddingTop: 35,
    paddingLeft: 40,
    paddingRight: 40,
    paddingBottom: 40,
    lineHeight: 1.5,
    flexDirection: "column",
  },
  logo: {
    width: 110,
    height: 60,
    objectFit: "contain",
    marginBottom: 6,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
    alignItems: "flex-start",
  },
  headerLeft: {
    flexDirection: "column",
    width: "48%",
  },
  headerRight: {
    flexDirection: "column",
    alignItems: "flex-end",
    width: "48%",
  },
  merchantName: {
    fontSize: 13,
    fontWeight: 700,
    color: "#be185d",
    marginBottom: 2,
  },
  merchantInfo: {
    fontSize: 9,
    color: "#64748b",
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: "#be185d", // P de Papel Pink
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  orderNumber: {
    fontFamily: "Courier",
    fontSize: 11,
    fontWeight: 700,
    color: "#334155",
    marginBottom: 6,
  },
  date: {
    fontSize: 9.5,
    color: "#64748b",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: "#1e293b",
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 3,
  },
  customerBlock: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    padding: 12,
    borderRadius: 6,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  customerColumn: {
    flexDirection: "column",
    width: "48%",
  },
  label: {
    fontSize: 8.5,
    fontWeight: 600,
    color: "#64748b",
    marginBottom: 1,
    marginTop: 3,
  },
  value: {
    fontSize: 9.5,
    color: "#1e293b",
    marginBottom: 3,
  },
  monoValue: {
    fontFamily: "Courier",
    fontSize: 9.5,
    color: "#1e293b",
    marginBottom: 3,
  },
  table: {
    width: "auto",
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#fdf2f8", // Light Pink Accent
    borderBottomWidth: 1.5,
    borderBottomColor: "#fbcfe8",
    padding: 8,
    fontWeight: 700,
    color: "#831843",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    padding: 8,
    alignItems: "center",
  },
  colProduct: { width: "46%" },
  colQty: { width: "12%", textAlign: "center", fontFamily: "Courier" },
  colUnit: { width: "21%", textAlign: "right", fontFamily: "Courier" },
  colTotal: { width: "21%", textAlign: "right", fontFamily: "Courier" },
  skuText: {
    fontFamily: "Courier",
    fontSize: 8,
    color: "#64748b",
    marginTop: 2,
  },
  summaryBlock: {
    flexDirection: "column",
    alignItems: "flex-end",
    marginTop: 10,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: "45%",
    marginBottom: 4,
  },
  summaryLabel: {
    width: "55%",
    textAlign: "right",
    paddingRight: 10,
    color: "#475569",
    fontSize: 9.5,
  },
  summaryValue: {
    fontFamily: "Courier",
    width: "45%",
    textAlign: "right",
    color: "#1e293b",
    fontSize: 9.5,
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: "45%",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 2,
    borderTopColor: "#fbcfe8",
  },
  grandTotalLabel: {
    width: "55%",
    textAlign: "right",
    paddingRight: 10,
    fontWeight: 700,
    color: "#be185d",
    fontSize: 11.5,
  },
  grandTotalValue: {
    fontFamily: "Courier-Bold",
    width: "45%",
    textAlign: "right",
    fontWeight: 700,
    color: "#be185d",
    fontSize: 12,
  },
  footer: {
    position: "absolute",
    bottom: 25,
    left: 40,
    right: 40,
    textAlign: "center",
    color: "#64748b",
    fontSize: 8.5,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 10,
    lineHeight: 1.4,
  },
});

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatPaymentMethod = (method?: string) => {
  if (!method) return "Pendiente";
  switch (method.toUpperCase()) {
    case "BANKTRANSFER":
    case "BANK_TRANSFER":
      return "Transferencia Bancaria (Bre-B / Bancolombia / Nequi)";
    case "WOMPI":
      return "Wompi (Tarjeta / Nequi / PSE)";
    case "BOLD":
      return "Bold (Datáfono / Link de Pago)";
    case "COD":
      return "Pago Contraentrega";
    case "PAYU":
      return "PayU Latam";
    default:
      return method;
  }
};

const cleanProductName = (name: string) => {
  if (!name) return "";
  return name
    .replace(/\s+S-P$/i, "")
    .replace(/\s+S-L$/i, "")
    .replace(/\s+N\/A$/i, "")
    .replace(/\s+DEFAULT$/i, "")
    .trim();
};

export interface InvoiceData {
  orderNumber: string;
  createdAt: Date;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  documentId: string;
  address: string;
  city: string;
  department: string;
  items: {
    name: string;
    quantity: number;
    price: number;
    sku?: string;
  }[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  paymentMethod: string;
}

export const StoreInvoicePDF = ({ data }: { data: InvoiceData }) => {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image
              src="https://papeleriapdepapel.com/images/text-below-transparent-bg.png"
              style={styles.logo}
            />
            <Text style={styles.merchantName}>Papelería P de Papel</Text>
            <Text style={styles.merchantInfo}>NIT: 1030579584-5</Text>
            <Text style={styles.merchantInfo}>Medellín, Antioquia - Colombia</Text>
            <Text style={styles.merchantInfo}>https://papeleriapdepapel.com</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.title}>ORDEN DE COMPRA</Text>
            <Text style={styles.orderNumber}>#{data.orderNumber}</Text>
            <Text style={styles.date}>
              {format(data.createdAt, "dd 'de' MMMM, yyyy - HH:mm", {
                locale: es,
              })}
            </Text>
          </View>
        </View>

        {/* Customer & Shipping Info */}
        <View style={styles.customerBlock}>
          <View style={styles.customerColumn}>
            <Text style={styles.sectionTitle}>Facturado a</Text>
            <Text style={styles.value}>{data.customerName}</Text>
            <Text style={styles.label}>Doc / NIT:</Text>
            <Text style={styles.monoValue}>
              {data.documentId || "Consumidor Final"}
            </Text>
            <Text style={styles.label}>Contacto:</Text>
            <Text style={styles.value}>{data.customerEmail}</Text>
            <Text style={styles.monoValue}>{data.customerPhone}</Text>
          </View>
          <View style={styles.customerColumn}>
            <Text style={styles.sectionTitle}>Datos de Envío</Text>
            <Text style={styles.value}>{data.address}</Text>
            <Text style={styles.value}>
              {data.city}, {data.department}
            </Text>
            <Text style={styles.label}>Método de Pago:</Text>
            <Text style={styles.value}>
              {formatPaymentMethod(data.paymentMethod)}
            </Text>
          </View>
        </View>

        {/* Items Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colProduct}>Descripción</Text>
            <Text style={styles.colQty}>Cantidad</Text>
            <Text style={styles.colUnit}>V. Unitario</Text>
            <Text style={styles.colTotal}>V. Total</Text>
          </View>

          {data.items.map((item, index) => (
            <View style={styles.tableRow} key={index}>
              <View style={styles.colProduct}>
                <Text
                  style={{ fontSize: 9.5, color: "#1e293b", marginBottom: 2 }}
                >
                  {cleanProductName(item.name)}
                </Text>
                {item.sku && (
                  <Text style={styles.skuText}>
                    SKU: {item.sku}
                  </Text>
                )}
              </View>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colUnit}>{formatCurrency(item.price)}</Text>
              <Text style={styles.colTotal}>
                {formatCurrency(item.price * item.quantity)}
              </Text>
            </View>
          ))}
        </View>

        {/* Financial Summary */}
        <View style={styles.summaryBlock}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(data.subtotal)}
            </Text>
          </View>

          {data.discount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Descuento</Text>
              <Text style={{ ...styles.summaryValue, color: "#be185d" }}>
                -{formatCurrency(data.discount)}
              </Text>
            </View>
          )}

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Envío</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(data.shipping)}
            </Text>
          </View>

          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>TOTAL A PAGAR</Text>
            <Text style={styles.grandTotalValue}>
              {formatCurrency(data.total)}
            </Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          ¡Gracias por tu compra en Papelería P de Papel!{"\n"}
          Este documento es un recibo de compra interno y no representa una
          factura electrónica de venta con obligaciones tributarias.{"\n"}
          Contáctanos: https://papeleriapdepapel.com | Instagram: @papeleria.pdepapel
        </Text>
      </Page>
    </Document>
  );
};
