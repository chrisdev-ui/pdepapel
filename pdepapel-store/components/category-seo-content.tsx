import Link from "next/link";

import { STOREFRONT_ROUTES } from "@/lib/routes";

interface CategorySeoContentProps {
  categoryName: string;
}

export function CategorySeoContent({ categoryName }: CategorySeoContentProps) {
  const categoryNameLower = categoryName.toLocaleLowerCase("es-CO");

  return (
    <section
      aria-labelledby="category-shopping-guide"
      className="rounded-2xl bg-kawaii-pink-light/20 p-6 sm:p-8"
    >
      <div className="max-w-3xl space-y-3">
        <h2
          id="category-shopping-guide"
          className="font-serif text-3xl font-extrabold"
        >
          Guía para elegir {categoryName}
        </h2>
        <p className="text-muted-foreground">
          Compara opciones de {categoryNameLower}, revisa las fotos y elige la
          alternativa que mejor se ajuste a tu idea. La disponibilidad se
          confirma al momento de finalizar la compra.
        </p>
      </div>

      <dl className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-background p-4 shadow-sm">
          <dt className="font-semibold">
            ¿Qué {categoryNameLower} están disponibles?
          </dt>
          <dd className="mt-2 text-sm text-muted-foreground">
            El catálogo muestra las opciones disponibles actualmente. Puedes
            usar la búsqueda y los filtros para encontrar la que necesitas.
          </dd>
        </div>
        <div className="rounded-xl bg-background p-4 shadow-sm">
          <dt className="font-semibold">
            ¿Cómo reviso una opción antes de comprar?
          </dt>
          <dd className="mt-2 text-sm text-muted-foreground">
            Abre el producto para ver sus fotos, precio, variantes y la
            disponibilidad antes de agregarlo al carrito.
          </dd>
        </div>
        <div className="rounded-xl bg-background p-4 shadow-sm">
          <dt className="font-semibold">¿Cómo finalizo mi pedido?</dt>
          <dd className="mt-2 text-sm text-muted-foreground">
            Añade tus favoritos al carrito, ingresa los datos de envío y elige
            el método de pago que prefieras.
          </dd>
        </div>
      </dl>

      <nav
        aria-label="Información para tu compra"
        className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold text-primary"
      >
        <Link className="hover:underline" href={STOREFRONT_ROUTES.shop}>
          Ver toda la tienda
        </Link>
        <Link
          className="hover:underline"
          href={STOREFRONT_ROUTES.shippingPolicy}
        >
          Consultar envíos
        </Link>
        <Link
          className="hover:underline"
          href={STOREFRONT_ROUTES.returnsPolicy}
        >
          Consultar devoluciones
        </Link>
        <Link className="hover:underline" href={STOREFRONT_ROUTES.contact}>
          Resolver una duda
        </Link>
      </nav>
    </section>
  );
}
