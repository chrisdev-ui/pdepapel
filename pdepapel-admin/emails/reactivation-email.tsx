import {
  Cta,
  EmailProduct,
  Foot,
  P,
  Pill,
  ProductCards,
  SectionLabel,
  Shell,
  Ticket,
  Title,
} from "./components";

interface RecommendedProduct {
  id: string;
  slug?: string;
  name: string;
  imageUrl: string;
  priceFormatted: string;
}

interface ReactivationEmailTemplateProps {
  customerName: string;
  storeName?: string;
  discountCode: string;
  discountPercentage: number;
  recommendedProducts: RecommendedProduct[];
  storeUrl?: string;
}

/**
 * El mismo correo en texto plano, para quien lo lee sin HTML (y para los
 * filtros de spam, que desconfían de un correo solo con HTML).
 */
export function reactivationEmailText({
  customerName,
  discountCode,
  discountPercentage,
  recommendedProducts = [],
  storeUrl = "https://papeleriapdepapel.com",
}: Pick<ReactivationEmailTemplateProps, "customerName" | "discountCode" | "discountPercentage" | "recommendedProducts" | "storeUrl">): string {
  const firstName = customerName.trim().split(/\s+/)[0] ?? "";
  const greeting = firstName ? `Hace rato no te vemos, ${firstName}.` : "Hace rato no te vemos por la papelería.";
  const products = recommendedProducts.length
    ? `\n\nLlegó esto desde tu última visita:\n${recommendedProducts.map((product) => `• ${product.name} (${product.priceFormatted}): ${storeUrl}/producto/${product.slug || product.id}`).join("\n")}`
    : "";
  return (
    `${greeting}\n\nTe guardamos un descuento para cuando quieras volver. No hay apuro, pero sí fecha de vencimiento.\n\n` +
    `Tu código: ${discountCode} (${discountPercentage} % en toda la tienda).${products}\n\nUsar mi descuento: ${storeUrl}\n\nP de Papel · Medellín, Colombia`
  );
}

export function ReactivationEmailTemplate({
  customerName,
  discountCode = "VUELVE-REGALO",
  discountPercentage = 10,
  recommendedProducts = [],
  storeUrl = "https://papeleriapdepapel.com",
}: ReactivationEmailTemplateProps) {
  const firstName = customerName ? customerName.split(" ")[0] : "";

  const products: EmailProduct[] = recommendedProducts.map((product) => ({
    name: product.name,
    imageUrl: product.imageUrl || null,
    url: `${storeUrl}/producto/${product.slug || product.id}`,
    price: product.priceFormatted,
  }));

  return (
    <Shell
      preview={`Te guardamos un ${discountPercentage} % de descuento.`}
      tint="peach"
      kicker="Te extrañamos"
    >
      <Pill tint="peach">Solo para ti</Pill>
      <Title>
        {firstName
          ? `Hace rato no te vemos, ${firstName}.`
          : "Hace rato no te vemos por la papelería."}
      </Title>
      <P>
        Te guardamos un descuento para cuando quieras volver. No hay apuro, pero
        sí fecha de vencimiento.
      </P>

      <Ticket
        label="Tu código"
        code={discountCode}
        hint={`${discountPercentage} % en toda la tienda · selecciona y copia el código`}
      />

      {products.length > 0 ? (
        <>
          <SectionLabel tint="peach">Llegó esto desde tu última visita</SectionLabel>
          <ProductCards products={products} tint="peach" />
        </>
      ) : null}

      <Cta href={storeUrl}>Usar mi descuento</Cta>

      <Foot>P de Papel · Medellín, Colombia</Foot>
    </Shell>
  );
}

/* Datos de muestra para `npm run email:dev`. No se envían a nadie. */
ReactivationEmailTemplate.PreviewProps = {
  customerName: "Luisa Sánchez",
  discountCode: "VUELVE20",
  discountPercentage: 20,
  storeUrl: "https://papeleriapdepapel.com",
  recommendedProducts: [
    { id: "1", slug: "agenda-2027-mensual", name: "Agenda 2027 Mensual", imageUrl: "", priceFormatted: "$ 62.000" },
    { id: "2", slug: "boligrafo-gel-pastel", name: "Bolígrafo gel pastel", imageUrl: "", priceFormatted: "$ 9.500" },
    { id: "3", slug: "libreta-a5-puntos", name: "Libreta A5 puntos", imageUrl: "", priceFormatted: "$ 24.000" },
  ],
} satisfies ReactivationEmailTemplateProps;

export default ReactivationEmailTemplate;
