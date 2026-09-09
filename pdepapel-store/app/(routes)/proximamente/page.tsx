import type { Metadata } from "next";
import { cookies } from "next/headers";

import { getProducts } from "@/actions/get-products";
import { Newsletter } from "@/components/newsletter";
import ProductCard from "@/components/ui/product-card";
import { BASE_URL } from "@/constants";
import { EARLY_ACCESS_COOKIE } from "@/lib/early-access";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Lo que viene",
  description:
    "Los productos que están por llegar a Papelería P de Papel. Suscríbete y míralos antes que nadie.",
  alternates: { canonical: "/proximamente" },
  openGraph: {
    title: "Lo que viene | Papelería P de Papel",
    description: "Los productos que están por llegar a la tienda.",
    url: `${BASE_URL}/proximamente`,
  },
};

export default async function ComingSoonPage({
  searchParams,
}: {
  searchParams: { acceso?: string };
}) {
  const [{ products }, cookieStore] = await Promise.all([
    getProducts({ availability: "coming-soon", limit: 48, groupBy: "parents" }),
    Promise.resolve(cookies()),
  ]);
  const hasAccess = Boolean(cookieStore.get(EARLY_ACCESS_COOKIE)?.value);
  const notice =
    searchParams.acceso === "ok" || hasAccess
      ? { tone: "ok", text: "Tienes acceso anticipado: puedes comprar estos productos antes que nadie." }
      : searchParams.acceso === "invalido"
        ? { tone: "warn", text: "El enlace de acceso anticipado no es válido o ya venció." }
        : null;

  return (
    <>
      <main className="mx-auto flex max-w-screen-2xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-3xl font-bold text-blue-yankees sm:text-4xl">Lo que viene</h1>
          <p className="max-w-2xl font-sans text-base text-blue-yankees/80">
            Productos que están por llegar. Pide aviso en cada uno y te escribimos cuando estén en la tienda.
          </p>
          {notice && (
            <p
              role="status"
              className={
                notice.tone === "ok"
                  ? "w-fit rounded-full bg-green-100 px-4 py-2 font-sans text-sm font-semibold text-green-800"
                  : "w-fit rounded-full bg-kawaii-peach px-4 py-2 font-sans text-sm font-semibold text-orange-900"
              }
            >
              {notice.text}
            </p>
          )}
        </div>
        {products.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-blue-baby p-8 text-center font-sans text-blue-yankees/80">
            Por ahora no hay productos anunciados. Suscríbete abajo y te avisamos cuando llegue el próximo cargamento.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </main>
      <Newsletter source="proximamente" />
    </>
  );
}
