import Link from "next/link";

import { NoResults } from "@/components/ui/no-results";
import ProductCard from "@/components/ui/product-card";
import { KAWAII_FACE_SAD } from "@/constants";
import { Product } from "@/types";

interface ProductListProps {
  title: string;
  products: Product[];
  /** Texto pequeño sobre el título, por ejemplo «Completa tu set». */
  eyebrow?: string;
  /** Enlace a la derecha del título. */
  action?: { label: string; href: string };
  /** Sin resultados: no pintar nada en vez del mensaje. */
  hideWhenEmpty?: boolean;
}

/** Cuadrícula de productos con la misma tarjeta, separación y columnas que el catálogo. */
export const ProductList: React.FC<ProductListProps> = ({ title, products, eyebrow, action, hideWhenEmpty = false }) => {
  if (products.length === 0 && hideWhenEmpty) return null;

  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow && <p className="font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-gray-500">{eyebrow}</p>}
          <h2 className="font-serif text-2xl font-bold text-blue-yankees sm:text-3xl">{title}</h2>
        </div>
        {action && (
          <Link href={action.href} className="font-sans text-sm font-semibold text-blue-yankees underline underline-offset-4">
            {action.label}
          </Link>
        )}
      </div>
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
