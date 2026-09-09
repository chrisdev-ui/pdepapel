import Image from "next/image";
import Link from "next/link";

import { productPath } from "@/lib/routes";
import { Product } from "@/types";

interface KitContentsProps {
  components: NonNullable<Product["kitComponents"]>;
}

/** Piezas de un kit, cada una enlazada a su ficha. */
export const KitContents: React.FC<KitContentsProps> = ({ components }) => {
  if (!components || components.length === 0) return null;

  const pieces = components.reduce((total, item) => total + item.quantity, 0);

  return (
    <section aria-labelledby="kit-titulo" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="kit-titulo" className="font-serif text-2xl font-bold text-blue-yankees sm:text-3xl">
          Este kit incluye
        </h2>
        <p className="font-sans text-sm text-gray-500">
          {pieces} {pieces === 1 ? "pieza" : "piezas"}
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {components.map((item) => (
          <li key={item.component.id}>
            <Link
              href={productPath(item.component.slug || item.component.id)}
              className="group flex items-center gap-3.5 rounded-xl border border-blue-baby bg-white p-3 shadow-card transition-shadow hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink focus-visible:ring-offset-2"
            >
              <span className="relative h-[72px] w-[72px] flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                {item.component.images?.[0]?.url ? (
                  <Image src={item.component.images[0].url} alt={item.component.name} fill sizes="72px" className="object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xs text-gray-400">Sin foto</span>
                )}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-sans text-sm font-semibold leading-snug text-blue-yankees group-hover:underline">{item.component.name}</span>
                <span className="w-fit rounded-full bg-blue-baby/50 px-2 py-0.5 font-sans text-[11px] font-bold text-blue-yankees">x{item.quantity}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};
