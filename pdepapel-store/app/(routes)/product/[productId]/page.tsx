import { Metadata } from "next";
import { notFound } from "next/navigation";
import { Product as ProductSchema, WithContext } from "schema-dts";

import { getProduct } from "@/actions/get-product";
import { getProducts } from "@/actions/get-products";
import { SingleProductPage } from "@/components/single-product-page";
import { BASE_URL } from "@/constants";

interface ProductPageProps {
  params: {
    productId: string;
  };
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const product = await getProduct(params.productId);

  if (!product) {
    return {
      title: "Producto no encontrado",
      description:
        "Lo sentimos, el producto que buscas no está disponible en Papelería P de Papel. Revisa nuestro catálogo para encontrar artículos kawaii y de oficina que te encantarán. ¡Agrega color y diversión a tu espacio!",
      alternates: {
        canonical: "/",
      },
    };
  }

  const images = product.images?.map((image) => image.url);

  const variantAttributes = [
    product.design?.name,
    product.color?.name,
    product.size?.name,
  ]
    .filter(Boolean)
    .join(", ");

  const title = variantAttributes
    ? `${product.name} - ${variantAttributes}`
    : product.name;

  return {
    title: title,
    description:
      product.description ??
      `Descubre ${product.name} en Papelería P de Papel. Este artículo kawaii/oficina es perfecto para añadir un toque especial a tu espacio. Detalles, especificaciones, y todo lo que necesitas saber para tomar la mejor decisión. Calidad y diseño se unen para ofrecerte lo mejor en papelería.`,
    alternates: {
      canonical: `/product/${params.productId}`,
    },
    openGraph: {
      title: title,
      description: product.description,
      url: `https://papeleriapdepapel.com/product/${params.productId}`,
      siteName: "Papelería P de Papel",
      images,
    },
    twitter: {
      title: title,
      description: product.description,
      card: "summary_large_image",
      site: "Papelería P de Papel",
      images,
    },
  };
}

export const revalidate = 60;

export default async function ProductPage({ params }: ProductPageProps) {
  const product = await getProduct(params.productId);

  if (!product) return notFound();

  const siblingsPromise = product.productGroupId
    ? getProducts({
        productGroupId: product.productGroupId,
      })
    : Promise.resolve({ products: [] });

  const suggestedProductsPromise = getProducts({
    categoryId: product.category?.id,
    excludeProducts: params.productId,
    groupBy: "parents",
    limit: 4,
  });

  const [siblingsResponse, suggestedProductsResponse] = await Promise.all([
    siblingsPromise,
    suggestedProductsPromise,
  ]);

  const siblings = siblingsResponse.products.map((variant) => ({
    id: variant.id,
    size: variant.size,
    color: variant.color,
    design: variant.design,
    stock: variant.stock,
  }));
  const suggestedProducts = suggestedProductsResponse.products;

  const jsonLd: WithContext<ProductSchema> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.images?.map((img) => img.url) || [],
    sku: product.sku || product.id,
    brand: {
      "@type": "Brand",
      name: "Papelería P de Papel",
    },
    offers: {
      "@type": "Offer",
      url: `${BASE_URL}/product/${product.id}`,
      priceCurrency: "COP",
      price: product.price,
      priceValidUntil: new Date(
        new Date().setFullYear(new Date().getFullYear() + 1),
      )
        .toISOString()
        .split("T")[0],
      itemCondition: "https://schema.org/NewCondition",
      availability:
        product.stock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      seller: {
        "@type": "Organization",
        name: "Papelería P de Papel",
      },
    },
  };

  return (
    <>
      <SingleProductPage
        product={product}
        suggestedProducts={suggestedProducts}
        siblings={siblings}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
