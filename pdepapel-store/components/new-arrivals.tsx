import { Suspense } from "react";

import { Loader } from "@/components/loader";
import { Container } from "@/components/ui/container";
import { NoResults } from "@/components/ui/no-results";
import { ProductCard } from "@/components/ui/product-card";
import { KAWAII_FACE_HAPPY, KAWAII_FACE_SAD } from "@/constants";
import { Product } from "@/types";

interface NewArrivalsProps {
  newProducts: Product[];
}

export const NewArrivals: React.FC<NewArrivalsProps> = ({ newProducts }) => {
  return (
    <Container className="mt-8 flex flex-col gap-y-8">
      <div className="space-y-4 text-center">
        <h2 className="font-serif text-4xl font-extrabold">
          Productos agregados recientemente
        </h2>
        <p className="text-base text-blue-yankees/70">
          ¡Descubre las últimas novedades en nuestra colección!{" "}
          {KAWAII_FACE_HAPPY}
        </p>
      </div>
      <Suspense fallback={<Loader />}>
        {newProducts.length === 0 ? (
          <NoResults message={`No hay productos nuevos ${KAWAII_FACE_SAD}`} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {newProducts.map((product) => (
              <ProductCard key={product.id} product={product} isNew />
            ))}
          </div>
        )}
      </Suspense>
    </Container>
  );
};
