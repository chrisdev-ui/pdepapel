import ProductCard from "@/components/ui/product-card";
import { Product } from "@/types";

import Paginator from "./paginator";

interface ProductsProps {
  products: Product[];
  totalPages: number;
}

/** Cuadrícula del catálogo: 2 columnas en teléfono, 3 en tableta y portátil, 4 desde 1280 px. */
const Products: React.FC<ProductsProps> = ({ products, totalPages }) => {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
        {products.map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            priority={index < 2}
            sizes="(max-width: 767px) 50vw, (max-width: 1279px) 33vw, 22vw"
          />
        ))}
      </div>
      {totalPages > 1 && <Paginator totalPages={totalPages} />}
    </div>
  );
};

export default Products;
