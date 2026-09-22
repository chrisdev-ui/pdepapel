import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Lo que se ve mientras llega la ficha del producto.
 *
 * Faltaba, y era la única ruta del catálogo sin esqueleto: `/tienda` y
 * `/categoria/[slug]` ya tenían el suyo. Al tocar una tarjeta pasaban ~839 ms
 * medidos en escritorio —bastantes más en un teléfono— con la pantalla
 * exactamente igual, así que la persona volvía a tocar. Es el clic muerto que
 * Clarity marcaba sobre la foto del producto: el enlace nunca estuvo roto, lo
 * que faltaba era decir que algo estaba pasando.
 *
 * Copia la anatomía de `single-product-page.tsx` —mismo contenedor, misma
 * rejilla de dos columnas desde `lg`— para que al llegar el contenido no
 * salte nada de sitio.
 */
export default function ProductLoading() {
  return (
    <Container
      className="flex max-w-7xl flex-col gap-10 px-4 py-6 sm:px-6 lg:gap-14 lg:px-8 lg:py-8"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Cargando el producto</span>
      <div className="flex flex-col gap-5">
        {/* Migas */}
        <Skeleton className="h-4 w-56" aria-hidden="true" />

        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-12" aria-hidden="true">
          {/* Galería: la foto grande y la tira de miniaturas */}
          <div className="flex flex-col gap-4">
            <Skeleton className="aspect-square w-full rounded-xl" />
            <div className="flex gap-3">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-16 shrink-0 rounded-lg sm:h-20 sm:w-20" />
              ))}
            </div>
          </div>

          {/* Ficha: nombre, precio, variantes y el botón de comprar */}
          <div className="mt-8 flex flex-col gap-5 lg:mt-0">
            <div className="flex flex-col gap-2.5">
              <Skeleton className="h-7 w-4/5" />
              <Skeleton className="h-7 w-2/5" />
            </div>
            <Skeleton className="h-8 w-36" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <div className="flex gap-2">
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton key={index} className="h-10 w-20 rounded-full" />
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-12 w-full rounded-full" />
              <Skeleton className="h-12 w-full rounded-full" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </div>
      </div>
    </Container>
  );
}
