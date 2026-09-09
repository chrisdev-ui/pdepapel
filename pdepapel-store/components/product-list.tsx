import { NoResults } from "@/components/ui/no-results";
import ProductCard from "@/components/ui/product-card";
import { KAWAII_FACE_SAD } from "@/constants";
import { Product } from "@/types";

interface ProductListProps {
  title: string;
  products: Product[];
}

/** Cuadrícula de productos relacionados; misma separación y columnas que el catálogo. */
export const ProductList: React.FC<ProductListProps> = ({ title, products }) => {
  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <h3 className="font-serif text-2xl font-bold text-blue-yankees sm:text-3xl">{title}</h3>
      {products.length === 0 ? (
        <NoResults message={`No hay productos relacionados ${KAWAII_FACE_SAD}`} />
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} sizes="(max-width: 767px) 50vw, (max-width: 1279px) 33vw, 25vw" />
          ))}
        </div>
      )}
    </section>
  );
};
