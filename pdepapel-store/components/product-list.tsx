import { NoResults } from "@/components/ui/no-results";
import { ProductCard } from "@/components/ui/product-card";
import { KAWAII_FACE_SAD } from "@/constants";
import { Product } from "@/types";

interface ProductListProps {
  title: string;
  products: Product[];
}

export const ProductList: React.FC<ProductListProps> = ({
  title,
  products,
}) => {
  return (
    <div className="space-y-4">
      <h3 className="font-serif text-3xl font-bold">{title}</h3>
      {products.length === 0 ? (
        <NoResults
          message={`No hay productos relacionados ${KAWAII_FACE_SAD}`}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
};
