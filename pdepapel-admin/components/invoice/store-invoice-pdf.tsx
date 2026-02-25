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
    fontSize: 10,
    paddingTop: 30,
    paddingLeft: 40,
    paddingRight: 40,
    paddingBottom: 30,
    lineHeight: 1.5,
    flexDirection: "column",
  },
  logo: {
    width: 120,
    height: 120,
    objectFit: "contain",
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
    alignItems: "flex-start",
  },
  headerLeft: {
    flexDirection: "column",
    width: "45%",
  },
  headerRight: {
    flexDirection: "column",
    alignItems: "flex-end",
    width: "50%",
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: "#be185d", // P de Papel Pink
    marginBottom: 8,
  },
  orderNumber: {
    fontSize: 12,
    color: "#475569",
    marginBottom: 4,
  },
  date: {
    fontSize: 10,
    color: "#64748b",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "#1e293b",
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 4,
  },
  customerBlock: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    padding: 15,
    borderRadius: 8,
    marginBottom: 30,
  },
  customerColumn: {
    flexDirection: "column",
    width: "48%",
  },
  label: {
    fontSize: 9,
    fontWeight: 600,
    color: "#64748b",
    marginBottom: 2,
  },
  value: {
    fontSize: 10,
    color: "#1e293b",
    marginBottom: 6,
  },
  table: {
    width: "auto",
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#fdf2f8", // Very light pink
    borderBottomWidth: 1,
    borderBottomColor: "#fbcfe8",
    padding: 8,
    fontWeight: 600,
    color: "#831843",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    padding: 8,
  },
  colProduct: { width: "45%" },
  colQty: { width: "15%", textAlign: "center" },
  colUnit: { width: "20%", textAlign: "right" },
  colTotal: { width: "20%", textAlign: "right" },
  summaryBlock: {
    flexDirection: "column",
    alignItems: "flex-end",
    marginTop: 10,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: "50%",
    marginBottom: 4,
  },
  summaryLabel: {
    width: "60%",
    textAlign: "right",
    paddingRight: 10,
    color: "#475569",
  },
  summaryValue: {
    width: "40%",
    textAlign: "right",
    color: "#1e293b",
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: "50%",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 2,
    borderTopColor: "#fbcfe8",
  },
  grandTotalLabel: {
    width: "60%",
    textAlign: "right",
    paddingRight: 10,
    fontWeight: 700,
    color: "#be185d",
    fontSize: 12,
  },
  grandTotalValue: {
    width: "40%",
    textAlign: "right",
    fontWeight: 700,
    color: "#be185d",
    fontSize: 12,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    color: "#94a3b8",
    fontSize: 9,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 10,
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
            {/* Direct fallback to png for react-pdf safety */}
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image
              src="https://papeleriapdepapel.com/images/text-below-transparent-bg.png"
              style={styles.logo}
            />
            <Text style={styles.label}>Papelería P de Papel</Text>
            <Text style={styles.date}>NIT: 123456789-0 (Reemplazar NIT)</Text>
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

        {/* Customer Info */}
        <View style={styles.customerBlock}>
          <View style={styles.customerColumn}>
            <Text style={styles.sectionTitle}>Facturado a</Text>
            <Text style={styles.value}>{data.customerName}</Text>
            <Text style={styles.label}>Doc / NIT:</Text>
            <Text style={styles.value}>
              {data.documentId || "Consumidor Final"}
            </Text>
            <Text style={styles.label}>Contacto:</Text>
            <Text style={styles.value}>{data.customerEmail}</Text>
            <Text style={styles.value}>{data.customerPhone}</Text>
          </View>
          <View style={styles.customerColumn}>
            <Text style={styles.sectionTitle}>Datos de Envío</Text>
            <Text style={styles.value}>{data.address}</Text>
            <Text style={styles.value}>
              {data.city}, {data.department}
            </Text>
            <Text style={styles.label}>Método de Pago:</Text>
            <Text style={styles.value}>
              {data.paymentMethod || "Pendiente"}
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
                  style={{ fontSize: 10, color: "#1e293b", marginBottom: 2 }}
                >
                  {item.name}
                </Text>
                {item.sku && (
                  <Text style={{ fontSize: 8, color: "#94a3b8" }}>
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
          ¡Gracias por comprar en P de Papel! 📝{"\n"}
          Este documento es un recibo de compra interno y no representa una
          factura electrónica de venta con obligaciones tributarias.{"\n"}
          Contáctanos: https://papeleriapdepapel.com | Ig: @pdepapelcol
        </Text>
      </Page>
    </Document>
  );
};
