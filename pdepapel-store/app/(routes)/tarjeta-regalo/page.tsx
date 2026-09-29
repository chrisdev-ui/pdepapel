import { Gift, Mail, ShieldCheck, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import type { Product as ProductSchema, WithContext } from "schema-dts";

import { getGiftCardDenominations } from "@/actions/gift-cards";
import { BASE_URL } from "@/constants";
import { STOREFRONT_ROUTES } from "@/lib/routes";

import { GiftCardForm } from "./components/gift-card-form";

export const metadata: Metadata = {
  title: "Tarjeta de regalo",
  description:
    "Regala papelería bonita sin adivinar: una tarjeta de regalo de P de Papel llega por correo con un código para usar en la tienda en línea, entera o por partes.",
  alternates: { canonical: STOREFRONT_ROUTES.giftCard },
  openGraph: { url: `${BASE_URL}${STOREFRONT_ROUTES.giftCard}` },
  keywords: ["tarjeta de regalo", "gift card", "bono de regalo", "papelería kawaii", "regalo"],
};

export const revalidate = 300;

const DEFAULT_DENOMINATIONS = [50000, 100000, 200000];

const HOW_IT_WORKS = [
  {
    icon: Gift,
    title: "Eliges el valor",
    text: "Y a quién va, con un mensaje si quieres. Pagas como cualquier compra.",
  },
  {
    icon: Mail,
    title: "Llega por correo",
    text: "En cuanto el pago se confirma, el código sale al correo de quien la recibe. Si no dejas su correo, te llega a ti para que la entregues.",
  },
  {
    icon: Sparkles,
    title: "Se usa al pagar",
    text: "En la tienda en línea, entera o por partes, en tantas compras como haga falta. No vence.",
  },
];

export default async function GiftCardPage() {
  const denominations = await getGiftCardDenominations();
  const options = denominations.length > 0 ? denominations : DEFAULT_DENOMINATIONS;

  const jsonLd: WithContext<ProductSchema> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Tarjeta de regalo P de Papel",
    description: metadata.description as string,
    url: `${BASE_URL}${STOREFRONT_ROUTES.giftCard}`,
    brand: { "@type": "Brand", name: "P de Papel" },
    offers: options.map((amount) => ({
      "@type": "Offer",
      price: amount,
      priceCurrency: "COP",
      availability: "https://schema.org/InStock",
      url: `${BASE_URL}${STOREFRONT_ROUTES.giftCard}`,
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="sparkle bg-kawaii-pink-light/15 px-4 pb-12 pt-10 text-center sm:pb-16">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4">
          <span className="inline-flex items-center gap-2 rounded-full border border-pink-shell/40 bg-white px-4 py-1.5 font-sans text-xs font-bold uppercase tracking-[0.14em] text-pink-froly">
            <Gift className="h-3.5 w-3.5" aria-hidden="true" />
            Tarjeta de regalo
          </span>
          <h1 className="text-balance font-serif text-3xl font-bold text-blue-yankees sm:text-5xl">
            Regala papelería bonita sin adivinar
          </h1>
          <p className="max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
            Un código que llega por correo y se usa en la tienda en línea, entera o por partes. Tú eliges el valor; esa persona elige qué le gusta.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-screen-2xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
          <GiftCardForm denominations={options} />

          <aside className="flex flex-col gap-5 lg:sticky lg:top-[calc(var(--storefront-header-offset)+16px)]">
            <div className="rounded-3xl border border-pink-shell/30 bg-white p-5 shadow-[0_4px_20px_hsl(280_30%_70%/0.15)] sm:p-8">
              <h2 className="font-serif text-2xl font-bold text-blue-yankees">Así funciona</h2>
              <ol className="mt-5 flex flex-col gap-5">
                {HOW_IT_WORKS.map((step, index) => (
                  <li key={step.title} className="flex items-start gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-kawaii-pink-light/60 text-pink-froly">
                      <step.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="font-sans text-base font-bold text-blue-yankees">
                        {index + 1}. {step.title}
                      </p>
                      <p className="text-sm text-muted-foreground">{step.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <p className="flex items-start gap-2 px-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              El código no se muestra en ninguna página: solo viaja en el correo. Si se pierde, escríbenos y mandamos uno nuevo.
            </p>
          </aside>
        </div>
      </section>
    </>
  );
}
