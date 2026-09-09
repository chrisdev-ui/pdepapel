import { DeferredNewsletterForm } from "@/components/deferred-newsletter-form";

interface NewsletterProps {
  source?: string;
}

/** Franja del pie: incentivo, qué llega al correo y el formulario. */
export function Newsletter({ source }: NewsletterProps) {
  return (
    <section aria-labelledby="newsletter-title" className="bg-pink-shell">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-5 px-4 py-7 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-10 lg:px-8">
        <div className="flex max-w-xl flex-col gap-1.5">
          <h2 id="newsletter-title" className="text-balance font-serif text-xl font-bold text-blue-yankees sm:text-2xl">
            Suscríbete y recibe 10 % en tu primera compra
          </h2>
          <p className="font-sans text-sm text-blue-yankees/90 sm:text-[15px]">
            Novedades, lanzamientos y ofertas exclusivas, directo a tu correo.
          </p>
        </div>
        <DeferredNewsletterForm source={source} />
      </div>
    </section>
  );
}

export default Newsletter;
