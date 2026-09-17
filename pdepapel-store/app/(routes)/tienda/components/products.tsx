"use client";

import { useEffect, useState } from "react";

import ProductCard from "@/components/ui/product-card";
import { Product } from "@/types";

import Paginator from "./paginator";

interface ProductsProps {
  products: Product[];
  totalPages: number;
}

/**
 * Cuántas tarjetas se pintan antes de que alguien pida ver más. Las demás ya
 * vienen en la respuesta: lo que se evita no son bytes de datos sino que el
 * navegador dispare de golpe una imagen por tarjeta. Con 24 salían 23 imágenes
 * en móvil y 44 en escritorio, y la petición del chunk de filtros —que llega
 * después de hidratar— se quedaba haciendo fila detrás de todas ellas.
 */
const INITIAL_VISIBLE = 12;

/** Cuadrícula del catálogo: 2 columnas en teléfono, 3 en tableta y portátil, 4 desde 1280 px. */
const Products: React.FC<ProductsProps> = ({ products, totalPages }) => {
  const [visible, setVisible] = useState(INITIAL_VISIBLE);

  // Otra página o unos filtros nuevos vuelven a empezar por arriba.
  useEffect(() => setVisible(INITIAL_VISIBLE), [products]);

  const shown = products.slice(0, visible);
  const remaining = products.length - shown.length;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
        {shown.map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            priority={index < 2}
            sizes="(max-width: 767px) 50vw, (max-width: 1279px) 33vw, 22vw"
          />
        ))}
      </div>
      {remaining > 0 && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setVisible(products.length)}
            className="inline-flex h-11 items-center justify-center rounded-full border-[1.5px] border-blue-yankees bg-white px-6 font-sans text-[15px] font-semibold text-blue-yankees transition-colors hover:bg-blue-yankees hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2"
          >
            Cargar más ({remaining})
          </button>
        </div>
      )}
      {totalPages > 1 && <Paginator totalPages={totalPages} />}
    </div>
  );
};

export default Products;
