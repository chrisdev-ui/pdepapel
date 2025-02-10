import { getProduct } from "@/actions/get-product";
import { getProducts } from "@/actions/get-products";
import { SingleProductPage } from "@/components/single-product-page";
import { Metadata } from "next";
import { notFound } from "next/navigation";

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

  const images = product.images.map((image) => image.url);

  return {
    title: product.name,
    description:
      product.description ??
      `Descubre ${product.name} en Papelería P de Papel. Este artículo kawaii/oficina es perfecto para añadir un toque especial a tu espacio. Detalles, especificaciones, y todo lo que necesitas saber para tomar la mejor decisión. Calidad y diseño se unen para ofrecerte lo mejor en papelería.`,
    alternates: {
      canonical: `/product/${params.productId}`,
    },
    openGraph: {
      title: product.name,
      description: product.description,
      url: `https://papeleriapdepapel.com/product/${params.productId}`,
      siteName: "Papelería P de Papel",
      images,
    },
    twitter: {
      title: product.name,
      description: product.description,
      card: "summary_large_image",
      site: "Papelería P de Papel",
      images,
    },
  };
}

export const revalidate = 0;

export default async function ProductPage({ params }: ProductPageProps) {
  const product = await getProduct(params.productId);

  if (!product) return notFound();

  const { products: suggestedProducts } = await getProducts({
    categoryId: product.category.id,
    excludeProducts: params.productId,
    limit: 4,
  });
  return (
    <SingleProductPage
      product={product}
      suggestedProducts={suggestedProducts}
    />
  );
}
