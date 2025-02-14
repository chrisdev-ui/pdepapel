import { currencyFormatter, formatPhoneNumber } from "@/lib/utils";
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

Font.register({
  family: "Nunito",
  src: "https://fonts.gstatic.com/s/nunito/v25/XRXI3I6Li01BKofiOc5wtlZ2di8HDLshRTM.ttf",
});

Font.register({
  family: "ShiftyNotes",
  src: "/fonts/font.ttf",
});

const styles = StyleSheet.create({
  page: {
    fontFamily: "Nunito",
    padding: 30,
    backgroundColor: "#FEE5ED",
  },
  productsGrid: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
    marginBottom: 30,
  },
  productCard: {
    width: "48%",
    marginBottom: 20,
    padding: 15,
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    border: "2pt solid #FFE4E9",
    minHeight: 0, // Important for flex layout
  },
  productImage: {
    width: "100%",
    height: 200,
    objectFit: "cover",
    marginBottom: 10,
    borderRadius: 10,
  },
  coverPage: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
    backgroundColor: "#FEE5ED",
    position: "relative",
    padding: 40,
  },
  storeLogo: {
    width: "auto",
    height: 300,
    marginBottom: 40,
    borderRadius: 20,
    objectFit: "contain",
  },
  coverTitle: {
    fontFamily: "ShiftyNotes",
    fontSize: 52,
    color: "#FF6B9B",
    textAlign: "center",
    marginBottom: 15,
  },
  coverSubtitle: {
    fontFamily: "ShiftyNotes",
    fontSize: 18,
    color: "#946C90",
    textAlign: "center",
    marginBottom: 30,
  },
  coverDate: {
    fontSize: 14,
    color: "#946C90",
    textAlign: "center",
    textTransform: "capitalize",
  },
  watermark: {
    position: "absolute",
    opacity: 0.06,
    transform: "rotate(-45deg)",
    fontSize: 100,
    color: "#FF6B9B",
    top: "40%",
    width: "100%",
    textAlign: "center",
  },
  watermarkImage: {
    position: "absolute",
    width: 200,
    height: 200,
    opacity: 0.06,
    transform: "rotate(-45deg)",
    top: "40%",
    alignSelf: "center",
  },
  sectionHeader: {
    backgroundColor: "#FDE1D3",
    padding: 15,
    marginBottom: 20,
    borderRadius: 10,
  },
  sectionTitle: {
    fontFamily: "ShiftyNotes",
    fontSize: 24,
    color: "#FF6B9B",
  },
  productName: {
    fontFamily: "ShiftyNotes",
    fontSize: 14,
    marginBottom: 5,
    color: "#FF6B9B",
  },
  productDetails: {
    fontFamily: "Nunito",
    fontSize: 10,
    color: "#946C90",
    fontWeight: "bold",
    marginBottom: 3,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 30,
    right: 30,
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTop: "1pt solid #FFE4E9",
    paddingTop: 10,
  },
  footerText: {
    fontSize: 10,
    color: "#946C90",
  },
  pageNumber: {
    fontSize: 10,
    color: "#946C90",
  },
  contactTitle: {
    fontFamily: "ShiftyNotes",
    fontSize: 16,
    marginBottom: 10,
    color: "#FF6B9B",
  },
  contactText: {
    fontSize: 10,
    color: "#946C90",
    marginBottom: 5,
  },
  socialLinks: {
    marginTop: 10,
    display: "flex",
    flexDirection: "row",
    gap: "10",
  },
  policyTitle: {
    fontFamily: "ShiftyNotes",
    fontSize: 14,
    marginBottom: 8,
    color: "#946C90",
  },
  policyText: {
    fontSize: 10,
    color: "#946C90",
    marginBottom: 15,
  },
  priceTable: {
    width: "100%",
    marginBottom: 30,
  },
  contactWrapper: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
    marginBottom: 30,
  },
  contactSection: {
    flex: 1,
    minWidth: "45%", // Ensures two columns on most cases
    padding: 20,
    backgroundColor: "#FDE1D3",
    borderRadius: 15,
  },
  socialSection: {
    flex: 1,
    minWidth: "45%",
    padding: 20,
    backgroundColor: "#FDE1D3",
    borderRadius: 15,
  },
  policiesSection: {
    width: "100%", // Policies section takes full width
    padding: 20,
    backgroundColor: "#E5DEFF",
    borderRadius: 15,
  },
  socialGrid: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  socialItem: {
    minWidth: "45%",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  policiesGrid: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
    marginTop: 10,
  },
  policyBlock: {
    flex: 1,
    minWidth: "45%",
    marginBottom: 15,
    padding: 10,
    backgroundColor: "rgba(255, 255, 255, 0.5)",
    borderRadius: 8,
  },
  policyIcon: {
    marginRight: 5,
    fontSize: 16,
  },
  policyTitleWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 5,
  },
});

interface Product {
  id: string;
  name: string;
  price: number;
  sku: string;
  images: { url: string; isMain: boolean }[];
  category: { name: string };
  size: { name: string };
  color: { name: string };
  design: { name: string };
}

interface Store {
  name: string;
  logoUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  youtube?: string | null;
  twitter?: string | null;
  pinterest?: string | null;
  facebook?: string | null;
  policies?: {
    shipping?: string;
    returns?: string;
    payment?: string;
  } | null;
}

interface CatalogProps {
  store: Store;
  products: Product[];
}

const CoverPage = ({ store }: { store: Store }) => (
  <Page size="A4" style={styles.coverPage}>
    <Image
      src={
        store.logoUrl
          ? store.logoUrl
          : `${process.env.ADMIN_WEB_URL}/images/transparent-background.png`
      }
      style={styles.storeLogo}
    />
    <Text style={styles.coverTitle}>Tienda {store.name}</Text>
    <Text style={styles.coverSubtitle}>Catálogo de Productos</Text>
    <Text style={styles.coverDate}>
      {format(new Date(), "LLLL d, yyyy", {
        locale: es,
      })}
    </Text>
  </Page>
);

const ContactPage = ({ store }: { store: Store }) => (
  <Page size="A4" style={styles.page}>
    <Text style={styles.watermark}>{store.name}</Text>

    <View style={styles.contactWrapper}>
      {/* Contact Information Section */}
      <View style={styles.contactSection}>
        <Text style={styles.contactTitle}>Información de Contacto</Text>
        {store.phone && (
          <Text style={styles.contactText}>
            Teléfono: {formatPhoneNumber(store.phone)}
          </Text>
        )}
        {store.email && (
          <Text style={styles.contactText}>Email: {store.email}</Text>
        )}
        {store.address && (
          <Text style={styles.contactText}>Dirección: {store.address}</Text>
        )}
      </View>

      {/* Social Media Section */}
      <View style={styles.socialSection}>
        <Text style={styles.contactTitle}>Redes Sociales</Text>
        <View style={styles.socialGrid}>
          {store.instagram && (
            <View style={styles.socialItem}>
              <Text style={styles.contactText}>
                Instagram: {store.instagram}
              </Text>
            </View>
          )}
          {store.facebook && (
            <View style={styles.socialItem}>
              <Text style={styles.contactText}>Facebook: {store.facebook}</Text>
            </View>
          )}
          {store.tiktok && (
            <View style={styles.socialItem}>
              <Text style={styles.contactText}>TikTok: {store.tiktok}</Text>
            </View>
          )}
          {store.youtube && (
            <View style={styles.socialItem}>
              <Text style={styles.contactText}>Youtube: {store.youtube}</Text>
            </View>
          )}
          {store.twitter && (
            <View style={styles.socialItem}>
              <Text style={styles.contactText}>Twitter: {store.twitter}</Text>
            </View>
          )}
          {store.pinterest && (
            <View style={styles.socialItem}>
              <Text style={styles.contactText}>
                Pinterest: {store.pinterest}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Policies Section */}
      {store.policies && (
        <View style={styles.policiesSection}>
          <Text style={styles.contactTitle}>Políticas de la Tienda</Text>

          <View style={styles.policiesGrid}>
            {store.policies.shipping && (
              <View style={styles.policyBlock}>
                <View style={styles.policyTitleWrapper}>
                  <Text style={styles.policyTitle}>Envíos</Text>
                </View>
                <Text style={styles.policyText}>{store.policies.shipping}</Text>
              </View>
            )}

            {store.policies.returns && (
              <View style={styles.policyBlock}>
                <View style={styles.policyTitleWrapper}>
                  <Text style={styles.policyTitle}>Devoluciones</Text>
                </View>
                <Text style={styles.policyText}>{store.policies.returns}</Text>
              </View>
            )}

            {store.policies.payment && (
              <View style={styles.policyBlock}>
                <View style={styles.policyTitleWrapper}>
                  <Text style={styles.policyTitle}>Métodos de Pago</Text>
                </View>
                <Text style={styles.policyText}>{store.policies.payment}</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>

    <View style={styles.footer}>
      <Text style={styles.footerText}>
        © {new Date().getFullYear()} {store.name}
      </Text>
      <Text style={styles.pageNumber}>Página 2</Text>
    </View>
  </Page>
);

const PRODUCTS_PER_PAGE = 6; // Adjust based on your needs

const ProductsPage = ({
  products,
  category,
  pageNumber,
  totalPages,
  store,
}: {
  products: Product[];
  category: string;
  pageNumber: number;
  totalPages: number;
  store: Store;
}) => (
  <Page size="A4" style={styles.page}>
    <Image
      src={
        store.logoUrl ??
        `${process.env.ADMIN_WEB_URL}/images/transparent-background.png`
      }
      style={styles.watermarkImage}
    />

    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{category}</Text>
    </View>

    <View style={styles.productsGrid}>
      {products.map((product) => (
        <View key={product.id} style={styles.productCard}>
          {product.images.length > 0 && (
            <Image
              src={
                product.images.find((img) => img.isMain)?.url ||
                product.images[0].url
              }
              style={styles.productImage}
            />
          )}
          <Text style={styles.productName}>{product.name}</Text>
          <Text style={styles.productDetails}>SKU: {product.sku}</Text>
          <Text style={styles.productDetails}>
            Precio: {currencyFormatter.format(product.price)}
          </Text>
          <Text style={styles.productDetails}>Tamaño: {product.size.name}</Text>
          <Text style={styles.productDetails}>Color: {product.color.name}</Text>
          <Text style={styles.productDetails}>
            Diseño: {product.design.name}
          </Text>
        </View>
      ))}
    </View>

    <View style={styles.footer}>
      <Text style={styles.footerText}>
        © {new Date().getFullYear()} {store.name}
      </Text>
      <Text style={styles.pageNumber}>
        Página {pageNumber} de {totalPages}
      </Text>
    </View>
  </Page>
);

// Helper function to chunk array
const chunkArray = <T,>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

export const ProductCatalog = ({ products, store }: CatalogProps) => {
  // Group products by category
  const productsByCategory = products.reduce(
    (acc, product) => {
      const categoryName = product.category.name;
      if (!acc[categoryName]) {
        acc[categoryName] = [];
      }
      acc[categoryName].push(product);
      return acc;
    },
    {} as Record<string, Product[]>,
  );

  // Calculate total pages
  let totalPages = 2; // Cover and contact pages
  Object.values(productsByCategory).forEach((categoryProducts) => {
    totalPages += Math.ceil(categoryProducts.length / PRODUCTS_PER_PAGE);
  });

  return (
    <Document>
      <CoverPage store={store} />
      <ContactPage store={store} />

      {Object.entries(productsByCategory)
        .map(([category, categoryProducts]) => {
          const productChunks = chunkArray(categoryProducts, PRODUCTS_PER_PAGE);

          return productChunks.map((chunk, index) => {
            const pageNumber =
              3 + // Cover (1) + Contact (1) + Starting from 1
              Object.entries(productsByCategory).findIndex(
                ([cat]) => cat === category,
              ) *
                Math.ceil(categoryProducts.length / PRODUCTS_PER_PAGE) +
              index;

            return (
              <ProductsPage
                key={`${category}-${index}`}
                products={chunk}
                category={`${category}${productChunks.length > 1 ? ` (${index + 1}/${productChunks.length})` : ""}`}
                pageNumber={pageNumber}
                totalPages={totalPages}
                store={store}
              />
            );
          });
        })
        .flat()}
    </Document>
  );
};
