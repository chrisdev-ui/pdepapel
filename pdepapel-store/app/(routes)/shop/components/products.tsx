import dynamic from "next/dynamic";

import { NoResults } from "@/components/ui/no-results";
import { KAWAII_FACE_SAD } from "@/constants";
import { Product } from "@/types";

const Paginator = dynamic(() => import("./paginator"), {
  ssr: false,
});

const ProductCard = dynamic(() => import("@/components/ui/product-card"), {
  ssr: false,
});

interface ProductsProps {
  products: Product[];
  totalPages: number;
}

const Products: React.FC<ProductsProps> = ({ products, totalPages }) => {
  return (
    <div>
      {products.length === 0 && (
        <NoResults
          className="h-96"
          message={`No hay productos ${KAWAII_FACE_SAD}`}
        />
      )}
      {!!products.length && (
        <div className="grid grid-cols-2 gap-1 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
      {totalPages > 0 && (
        <div className="flex w-full items-center">
          <Paginator totalPages={totalPages} />
        </div>
      )}
    </div>
  );
};

export default Products;
