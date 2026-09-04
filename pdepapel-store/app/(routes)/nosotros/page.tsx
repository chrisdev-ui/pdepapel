import {
  BookHeartIcon,
  ChevronRight,
  Clock,
  HeartHandshake,
  MapPin,
  Palette,
  Sparkles,
  Truck,
} from "lucide-react";
import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { AboutPage as AboutPageSchema, WithContext } from "schema-dts";

import { getPosts } from "@/actions/get-posts";
import { Icons } from "@/components/icons";
import Newsletter from "@/components/newsletter";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { BASE_URL } from "@/constants";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import SocialMedia from "./components/social-media";

export const revalidate = 60;

const INSTAGRAM_URL =
  "https://instagram.com/papeleria.pdepapel?igshid=OGQ5ZDc2ODk2ZA==";
const TIKTOK_URL =
  "https://www.tiktok.com/@papeleria.pdepapel?_t=8gctJXIdqD7&_r=1";
const FACEBOOK_URL = "https://www.facebook.com/papeleria.pdepapel";

const jsonLd: WithContext<AboutPageSchema> = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  mainEntity: {
    "@type": "Organization",
    name: "Papelería P de Papel",
    url: BASE_URL,
    logo: `${BASE_URL}/images/no-text-lightpink-bg.webp`,
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+57-313-258-2293",
      contactType: "customer service",
      areaServed: "CO",
      availableLanguage: "es",
    },
    sameAs: [
      "https://instagram.com/papeleria.pdepapel",
      "https://tiktok.com/@papeleria.pdepapel",
    ],
  },
  name: "Nuestra Historia | P de Papel",
  description:
    "Descubre la historia de pasión kawaii detrás de P de Papel. Tu tienda online de papelería en Colombia.",
};

export const metadata: Metadata = {
  title: "Nuestra Historia | Papelería P de Papel",
  description:
    "¿Quiénes somos? En Papelería P de Papel somos amantes de lo kawaii. Descubre nuestra historia, nuestra misión y por qué somos tu tienda de papelería online favorita en Colombia para útiles escolares y de oficina.",
  keywords: [
    "quienes somos",
    "historia p de papel",
    "tienda kawaii colombia",
    "papelería online",
    "pasión kawaii",
    "útiles escolares",
    "oficina",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: STOREFRONT_ROUTES.about,
  },
  openGraph: {
    title: "Nuestra Historia | Papelería P de Papel",
    description:
      "Conoce la magia detrás de P de Papel. Somos más que una papelería, somos una comunidad apasionada por lo kawaii y la creatividad.",
    url: STOREFRONT_ROUTES.about,
    siteName: "Papelería P de Papel",
    locale: "es_CO",
    type: "website",
    images: [
      {
        url: "/images/about-us.webp", // Specific image for About Page
        width: 1080,
        height: 720,
        alt: "Equipo de Papelería P de Papel",
      },
      {
        url: "/images/no-text-lightpink-bg.webp", // Fallback Logo
        width: 800,
        height: 600,
        alt: "Logo P de Papel",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nuestra Historia | Papelería P de Papel",
    description:
      "Conoce la magia detrás de P de Papel. Amantes de lo kawaii en Colombia.",
    images: ["/images/about-us.webp"],
  },
};

const values = [
  {
    id: "creatividad",
    title: "Creatividad",
    description:
      "Cada lapicero y libreta está pensado para despertar tu imaginación y animarte a expresarte libremente.",
    icon: <Palette className="h-6 w-6" aria-hidden="true" />,
    tileClassName: "bg-kawaii-pink-light",
  },
  {
    id: "comunidad",
    title: "Comunidad",
    description:
      "Nuestros clientes son amigos. Nos sentimos orgullosos de construir una comunidad vibrante y acogedora.",
    icon: <HeartHandshake className="h-6 w-6" aria-hidden="true" />,
    tileClassName: "bg-kawaii-mint-light",
  },
  {
    id: "calidad",
    title: "Calidad kawaii",
    description:
      "Seleccionamos cuidadosamente cada producto para asegurar que aporte alegría, color y texturas únicas.",
    icon: <Sparkles className="h-6 w-6" aria-hidden="true" />,
    tileClassName: "bg-kawaii-lavender-light",
  },
];

const facts = [
  {
    id: "medellin",
    title: "Operamos desde Medellín",
    description: "Atención y preparación de pedidos en Antioquia.",
    icon: <MapPin className="h-7 w-7 xl:h-8 xl:w-8" aria-hidden="true" />,
  },
  {
    id: "envios",
    title: "Envíos a toda Colombia",
    description: "Ciudades y municipios con cobertura de transportadoras.",
    icon: <Truck className="h-7 w-7 xl:h-8 xl:w-8" aria-hidden="true" />,
  },
  {
    id: "horario",
    title: "Atención todos los días",
    description: (
      <span className="inline-flex items-center gap-1.5">
        8:00 a. m. a 8:00 p. m.
        <Icons.flags.colombia className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    ),
    icon: <Clock className="h-7 w-7 xl:h-8 xl:w-8" aria-hidden="true" />,
  },
];

async function SocialMediaSection() {
  const posts = await getPosts();

  return <SocialMedia data={posts} />;
}

function SocialMediaSkeleton() {
  return (
    <section className="mx-auto max-w-5xl space-y-4 py-12" aria-busy="true">
      <Skeleton className="mx-auto h-9 w-60" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="aspect-square rounded-2xl" />
        ))}
      </div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <div className="bg-white">
      {/* --- Hero --- */}
      <section className="sparkle bg-kawaii-pink-light/15 relative overflow-hidden py-10 lg:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-kawaii-blue-light blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-36 -right-16 h-80 w-80 rounded-full bg-kawaii-lavender-light blur-3xl"
        />
        <div className="relative mx-auto grid max-w-screen-2xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16 lg:px-8">
          <div className="flex flex-col items-center gap-5 text-center lg:items-start lg:text-left">
            <span className="bg-kawaii-pink-light/35 inline-flex items-center gap-2 rounded-full border border-kawaii-pink-light px-3.5 py-1.5 text-sm font-medium">
              <Sparkles
                className="h-4 w-4 text-pink-froly"
                aria-hidden="true"
              />
              Conoce nuestra magia
            </span>
            <h1 className="text-balance font-serif text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Nuestra historia
              <BookHeartIcon
                className="ml-3 inline-block h-8 w-8 align-middle text-pink-froly sm:h-10 sm:w-10 lg:h-12 lg:w-12"
                aria-hidden="true"
              />
            </h1>
            <p className="text-pretty max-w-lg text-lg text-muted-foreground lg:text-xl">
              Donde la organización se encuentra con la ternura. Bienvenidos al
              mundo de P de Papel.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-3 lg:justify-start">
              <Link
                href={STOREFRONT_ROUTES.shop}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border-2 border-kawaii-pink-light/20 bg-gradient-to-r from-kawaii-pink-light via-[hsl(280_60%_80%)] to-[hsl(200_80%_75%)] px-8 text-sm font-bold text-blue-yankees shadow-lg transition-all hover:-translate-y-1 hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink focus-visible:ring-offset-2 active:scale-95"
              >
                Explorar la tienda
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <SocialOutlineLink
                href={INSTAGRAM_URL}
                icon={<Icons.instagram className="h-[18px] w-[18px]" />}
                label="Instagram"
              />
              <SocialOutlineLink
                href={TIKTOK_URL}
                icon={<Icons.tiktok className="h-[18px] w-[18px]" />}
                label="TikTok"
              />
            </div>
          </div>

          {/* Polaroid photo */}
          <div className="relative mx-auto w-full max-w-sm px-6 pt-6 lg:mx-0 lg:max-w-xl lg:justify-self-end">
            <div
              aria-hidden="true"
              className="absolute inset-0 rotate-6 rounded-[3rem] bg-kawaii-pink-light opacity-60 blur-xl"
            />
            <figure className="relative rotate-[-3deg] rounded-2xl bg-white p-3 pb-12 shadow-xl transition-transform duration-500 hover:rotate-0">
              <span
                aria-hidden="true"
                className="absolute -top-3 left-1/2 h-6 w-28 -translate-x-1/2 -rotate-2 rounded-sm bg-[repeating-linear-gradient(135deg,hsl(var(--kawaii-pink-light))_0_8px,hsl(var(--kawaii-yellow-light))_8px_16px)] opacity-90 shadow-sm"
              />
              <Image
                src="/images/about-us.webp"
                alt="Nuestro stand con papelería kawaii"
                width={1080}
                height={720}
                sizes="(max-width: 1024px) 384px, 576px"
                className="bg-kawaii-pink-light/15 aspect-[4/3] w-full rounded-xl object-cover"
                priority
                unoptimized
              />
              <figcaption className="absolute bottom-2.5 left-5 right-20 font-serif text-[15px] italic leading-tight">
                Nuestro stand, con todo el amor kawaii
              </figcaption>
              <span
                aria-hidden="true"
                className="absolute -bottom-5 -right-5 inline-flex h-20 w-20 rotate-[8deg] items-center justify-center rounded-full bg-white shadow-[0_8px_32px_hsl(330_85%_70%/0.25)]"
              >
                <Image
                  src="/images/no-text-transparent-bg.webp"
                  alt=""
                  width={64}
                  height={64}
                  className="h-16 w-16 object-contain"
                  unoptimized
                />
              </span>
            </figure>
          </div>
        </div>
      </section>

      <Container>
        {/* --- Story --- */}
        <section className="grid items-center gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] lg:gap-16 lg:py-16">
          <article className="flex flex-col gap-5 text-base leading-relaxed text-muted-foreground lg:text-lg">
            <div className="flex flex-col gap-1.5 self-start">
              <h2 className="font-serif text-3xl font-bold text-blue-yankees">
                Un pequeño proyecto de amor
              </h2>
              <svg
                width="180"
                height="10"
                viewBox="0 0 180 10"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M2 7c30-6 60-6 88-2s58 2 88-3"
                  stroke="hsl(var(--kawaii-pink))"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <p>
              Somos una tienda de papelería en línea especializada en productos{" "}
              <span className="bg-[linear-gradient(transparent_55%,hsl(var(--kawaii-pink-light))_55%)] px-0.5 font-semibold text-kawaii-pink">
                kawaii
              </span>
              , esos adorables artículos que no solo alegran tu día, sino que
              también añaden un toque de encanto y diversión a tu rutina diaria.
            </p>
            <p>
              Nuestra aventura comenzó como un pequeño proyecto de amor. Mi
              pareja y yo siempre hemos compartido una fascinación por lo único.
              Inspirados por esta pasión, decidimos lanzar
              <Image
                src="/images/text-beside-transparent-bg.webp"
                alt="Logo Papelería P de Papel con nombre en un costado"
                width={80}
                height={20}
                title="P de Papel"
                className="inline-flex object-contain"
                unoptimized
              />
              . Lo que empezó como un sueño compartido en nuestra sala de estar,
              se ha transformado en una próspera comunidad.
            </p>
          </article>
          <aside className="relative flex flex-col gap-4 rounded-3xl bg-kawaii-lavender-light px-6 pb-6 pt-9 sm:px-9 sm:pb-8 sm:pt-11">
            <span
              aria-hidden="true"
              className="absolute -top-4 left-6 font-serif text-8xl font-bold leading-none text-kawaii-pink"
            >
              “
            </span>
            <blockquote className="font-serif text-xl italic leading-snug text-blue-yankees sm:text-2xl">
              Creemos firmemente que los pequeños detalles pueden hacer una gran
              diferencia en tu día a día.
            </blockquote>
            <span className="inline-flex items-center gap-2.5 text-sm font-semibold">
              <Image
                src="/images/no-text-transparent-bg.webp"
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 object-contain"
                unoptimized
              />
              El equipo de P de Papel
            </span>
          </aside>
        </section>

        {/* --- Values --- */}
        <section className="flex flex-col gap-6 pb-12 lg:pb-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-serif text-3xl font-bold">Lo que nos mueve</h2>
            <p className="mt-2 text-muted-foreground">
              Tres cosas que cuidamos en cada pedido.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3 md:gap-8">
            {values.map((value) => (
              <div
                key={value.id}
                className="group flex flex-col gap-3 rounded-3xl border border-pink-shell/30 bg-white p-8 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
              >
                <span
                  className={cn(
                    "inline-flex h-12 w-12 items-center justify-center rounded-2xl text-blue-yankees transition-colors group-hover:bg-kawaii-pink group-hover:text-white",
                    value.tileClassName,
                  )}
                >
                  {value.icon}
                </span>
                <h3 className="mt-1 font-serif text-xl font-bold">
                  {value.title}
                </h3>
                <p className="text-muted-foreground">{value.description}</p>
              </div>
            ))}
          </div>
        </section>
      </Container>

      {/* --- Facts band --- */}
      <section
        aria-label="Datos de la tienda"
        className="bg-kawaii-pink-light/20 py-8 lg:py-10"
      >
        <ul className="mx-auto grid max-w-screen-2xl gap-4 px-4 sm:px-6 lg:grid-cols-3 lg:gap-6 lg:px-8 xl:gap-8">
          {facts.map((fact) => (
            <li
              key={fact.id}
              className="flex items-center gap-4 rounded-3xl border border-pink-shell/30 bg-white px-5 py-5 shadow-sm sm:px-6 xl:gap-5 xl:px-7 xl:py-6"
            >
              <span className="bg-kawaii-pink-light/40 inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-pink-shell xl:h-16 xl:w-16">
                {fact.icon}
              </span>
              <div className="min-w-0">
                <p className="font-serif text-base font-bold xl:text-lg">
                  {fact.title}
                </p>
                <p className="text-sm text-muted-foreground">
                  {fact.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <Container>
        {/* --- Social CTA --- */}
        <section className="relative my-8 overflow-hidden rounded-3xl bg-gradient-to-br from-kawaii-pink-light via-kawaii-blue-light to-kawaii-lavender-light px-6 py-12 text-center shadow-inner sm:px-12 sm:py-16 lg:my-16">
          <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center gap-6">
            <h2 className="text-balance font-serif text-3xl font-bold">
              ¡Sé parte de nuestro mundo colorido!
            </h2>
            <p className="text-lg">
              Síguenos para estar al día con las últimas novedades y ofertas.
              ¡Estamos emocionados de conectar contigo!
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3 sm:gap-6">
              <SocialButton
                href={INSTAGRAM_URL}
                icon={<Icons.instagram className="h-6 w-6" />}
                label="Instagram"
              />
              <SocialButton
                href={FACEBOOK_URL}
                icon={<Icons.facebook className="h-6 w-6" />}
                label="Facebook"
              />
              <SocialButton
                href={TIKTOK_URL}
                icon={<Icons.tiktok className="h-5 w-5" />}
                label="TikTok"
              />
            </div>
          </div>

          <div
            aria-hidden="true"
            className="absolute right-0 top-0 -mr-16 -mt-16 h-48 w-48 rounded-full bg-white opacity-40 blur-2xl"
          />
          <div
            aria-hidden="true"
            className="absolute bottom-0 left-0 -mb-16 -ml-16 h-48 w-48 rounded-full bg-kawaii-pink-light opacity-50 blur-2xl"
          />
        </section>

        <Suspense fallback={<SocialMediaSkeleton />}>
          <SocialMediaSection />
        </Suspense>
      </Container>
      <Newsletter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}

function SocialOutlineLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Visitar ${label} de Papelería P de Papel`}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-input bg-background px-5 text-sm font-medium transition-colors hover:border-pink-shell hover:text-pink-shell focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink focus-visible:ring-offset-2"
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </Link>
  );
}

function SocialButton({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Visitar ${label} de Papelería P de Papel`}
      className="group flex min-h-[44px] items-center gap-2 rounded-full bg-white px-6 py-3 font-medium text-blue-yankees shadow-sm transition-all hover:scale-105 hover:bg-kawaii-pink hover:text-white hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink focus-visible:ring-offset-2"
    >
      <span
        aria-hidden="true"
        className="text-kawaii-pink transition-colors group-hover:text-white"
      >
        {icon}
      </span>
      {label}
    </Link>
  );
}
