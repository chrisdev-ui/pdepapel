import { Icons } from "@/components/icons";
import { PrivacyPreferencesButton } from "@/components/privacy-preferences-button";
import { SEASON_CONFIG } from "@/constants";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { Season } from "@/types";
import { CalendarDays, Mail, MapPin, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface FooterProps {
  season?: Season;
}

export const Footer: React.FC<FooterProps> = ({ season = Season.Default }) => {
  const seasonConfig = SEASON_CONFIG[season];
  const footerLinkClassName =
    "flex min-h-[44px] min-w-0 items-center gap-3 rounded-md py-2 text-left text-blue-yankees hover:text-pink-shell focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-shell focus-visible:ring-offset-2";

  return (
    <footer className="divide-y border-t bg-kawaii-pink-light/10 px-4">
      <div className="container mx-auto grid gap-10 py-10 sm:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-12">
        <div className="max-w-xs">
          <Link
            href={STOREFRONT_ROUTES.home}
            aria-label="Ir al inicio de Papelería P de Papel"
            className="flex w-fit rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-shell focus-visible:ring-offset-2"
          >
            <div className="relative h-24 w-56 sm:h-28 sm:w-64">
              <Image
                src={seasonConfig.navbarText}
                alt="Logo Papelería P de Papel con nombre al lado"
                sizes="(max-width: 640px) 224px, 256px"
                className="object-contain object-left"
                fill
                quality={100}
              />
              {seasonConfig.logoAccent && (
                <Image
                  src={seasonConfig.logoAccent}
                  alt=""
                  aria-hidden="true"
                  width={640}
                  height={466}
                  sizes="64px"
                  className="pointer-events-none absolute -right-4 -top-1 h-auto w-16 max-w-none"
                />
              )}
            </div>
          </Link>
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
            Papelería kawaii en línea con operación desde Medellín y envíos a
            toda Colombia.
          </p>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-x-8 gap-y-10 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <section
            aria-labelledby="footer-contacto"
            className="min-w-0 sm:col-span-2 lg:col-span-1"
          >
            <h2
              id="footer-contacto"
              className="text-left font-semibold uppercase tracking-wide"
            >
              Contáctenos
            </h2>
            <ul className="mt-3 space-y-1">
              <li>
                <Link
                  href="https://api.whatsapp.com/send/?phone=%2B573132582293&text&type=phone_number&app_absent=0"
                  className={footerLinkClassName}
                >
                  <Icons.whatsapp
                    aria-hidden="true"
                    className="h-5 w-5 shrink-0"
                  />
                  (+57) 313 258 2293
                </Link>
              </li>
              <li>
                <Link href="tel:+573132582293" className={footerLinkClassName}>
                  <Phone aria-hidden="true" className="h-5 w-5 shrink-0" />
                  (+57) 313 258 2293
                </Link>
              </li>
              <li>
                <Link
                  href="mailto:papeleria.pdepapel@gmail.com"
                  className={footerLinkClassName}
                >
                  <Mail aria-hidden="true" className="h-5 w-5 shrink-0" />
                  <span className="min-w-0 break-all">
                    papeleria.pdepapel@gmail.com
                  </span>
                </Link>
              </li>
              <li className="min-h-11 flex items-center gap-3 py-2 text-blue-yankees">
                <CalendarDays aria-hidden="true" className="h-5 w-5 shrink-0" />
                08:00 - 20:00, Lun - Dom
              </li>
              <li className="min-h-11 flex items-start gap-3 py-2 text-blue-yankees">
                <MapPin
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 shrink-0"
                />
                <span>
                  Operamos desde Medellín, Colombia
                  <span className="block text-xs text-muted-foreground">
                    Tienda online con envíos a todo el país
                  </span>
                </span>
              </li>
            </ul>
          </section>
          <section aria-labelledby="footer-legales" className="min-w-0">
            <h2
              id="footer-legales"
              className="text-left font-semibold uppercase tracking-wide"
            >
              Términos Legales
            </h2>
            <ul className="mt-3 space-y-1">
              <li>
                <Link
                  href={STOREFRONT_ROUTES.returnsPolicy}
                  className={footerLinkClassName}
                >
                  Políticas de devolución o cambio
                </Link>
              </li>
              <li>
                <Link
                  href={STOREFRONT_ROUTES.shippingPolicy}
                  className={footerLinkClassName}
                >
                  Políticas de entrega
                </Link>
              </li>
              <li>
                <Link
                  href={STOREFRONT_ROUTES.dataPolicy}
                  className={footerLinkClassName}
                >
                  Políticas de tratamiento de datos
                </Link>
              </li>
              <li>
                <PrivacyPreferencesButton />
              </li>
            </ul>
          </section>
          <section aria-labelledby="footer-redes" className="min-w-0">
            <h2
              id="footer-redes"
              className="text-left font-semibold uppercase tracking-wide"
            >
              Redes Sociales
            </h2>
            <div className="mt-4 flex justify-start gap-3">
              <Link
                rel="noopener noreferrer"
                href="https://instagram.com/papeleria.pdepapel?igshid=OGQ5ZDc2ODk2ZA=="
                aria-label="Visitar Instagram de Papelería P de Papel"
                className="flex h-11 w-11 items-center justify-center rounded-full border bg-background text-blue-yankees hover:border-pink-shell hover:text-pink-shell focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-shell focus-visible:ring-offset-2"
                target="_blank"
              >
                <Icons.instagram aria-hidden="true" className="h-5 w-5" />
              </Link>
              <Link
                rel="noopener noreferrer"
                href="https://www.tiktok.com/@papeleria.pdepapel?_t=8gctJXIdqD7&_r=1"
                aria-label="Visitar TikTok de Papelería P de Papel"
                className="flex h-11 w-11 items-center justify-center rounded-full border bg-background text-blue-yankees hover:border-pink-shell hover:text-pink-shell focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-shell focus-visible:ring-offset-2"
                target="_blank"
              >
                <Icons.tiktok aria-hidden="true" className="h-5 w-5" />
              </Link>
            </div>
          </section>
        </div>
      </div>
      <div className="container mx-auto py-6 text-left text-sm text-muted-foreground sm:text-center">
        &copy; {new Date().getFullYear()} P de papel. Todos los derechos
        reservados.
      </div>
    </footer>
  );
};
