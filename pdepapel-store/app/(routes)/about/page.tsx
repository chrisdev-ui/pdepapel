import {
  BookHeartIcon,
  Facebook,
  HeartHandshake,
  Instagram,
  Palette,
  Sparkles,
} from "lucide-react";
import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AboutPage, WithContext } from "schema-dts";

import { getPosts } from "@/actions/get-posts";
import { Icons } from "@/components/icons";
import Newsletter from "@/components/newsletter";
import { Container } from "@/components/ui/container";
import { BASE_URL } from "@/constants";
import SocialMedia from "./components/social-media";

export const revalidate = 60;

const jsonLd: WithContext<AboutPage> = {
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
    canonical: "/about",
  },
  openGraph: {
    title: "Nuestra Historia | Papelería P de Papel",
    description:
      "Conoce la magia detrás de P de Papel. Somos más que una papelería, somos una comunidad apasionada por lo kawaii y la creatividad.",
    url: "/about",
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

export default async function AboutPage() {
  const posts = await getPosts();
  return (
    <div className="bg-[#fffdfd]">
      <Container>
        {/* --- Hero Header --- */}
        <div className="flex flex-col items-center justify-center space-y-4 py-8 text-center lg:py-16">
          <div className="inline-flex items-center justify-center rounded-full bg-pink-100 px-4 py-1.5 text-sm font-medium text-pink-600 ring-1 ring-inset ring-pink-200">
            <Sparkles className="mr-2 h-4 w-4" />
            Conoce nuestra magia
          </div>
          <h1 className="font-serif text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            Nuestra Historia
            <span className="ml-3 inline-block text-pink-400">
              <BookHeartIcon className="h-10 w-10 sm:h-14 sm:w-14" />
            </span>
          </h1>
          <p className="max-w-2xl text-lg text-gray-600">
            Donde la organización se encuentra con la ternura. Bienvenidos al
            mundo de P de Papel.
          </p>
        </div>

        {/* --- Main Story Section --- */}
        <section className="mt-8 grid gap-12 lg:grid-cols-2 lg:items-center">
          {/* Image Side - Polaroid Style */}
          <div className="relative mx-auto w-full max-w-md lg:mx-0">
            {/* Decorative background blob */}
            <div className="absolute -inset-4 rotate-6 rounded-[3rem] bg-pink-100 opacity-60 blur-xl" />

            <div className="relative aspect-[4/3] rotate-[-3deg] transform overflow-hidden rounded-2xl bg-white p-3 shadow-xl transition-transform duration-500 hover:rotate-0">
              <div className="relative h-full w-full overflow-hidden rounded-xl bg-pink-50">
                <Image
                  src="/images/text-beside-lightpink-bg.webp"
                  alt="Logo Papelería P de Papel con fondo rosado"
                  fill
                  sizes="(max-width: 640px) 100vw, 640px"
                  className="object-cover"
                  unoptimized
                />
              </div>
            </div>
          </div>

          {/* Text Side */}
          <article className="flex flex-col gap-6 text-lg leading-relaxed text-gray-600">
            <p>
              Somos una tienda de papelería en línea especializada en productos
              <span className="mx-1 font-semibold text-pink-500">kawaii</span>,
              esos adorables artículos que no solo alegran tu día, sino que
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
            <div className="rounded-2xl border-l-4 border-pink-300 bg-pink-50 p-6 italic text-pink-800">
              &ldquo;Creemos firmemente que los pequeños detalles pueden hacer
              una gran diferencia en tu día a día.&rdquo;
            </div>
          </article>
        </section>

        {/* --- Values Cards (The "Why") --- */}
        <section className="my-20">
          <div className="grid gap-8 md:grid-cols-3">
            {/* Card 1 */}
            <div className="group rounded-3xl border border-pink-100 bg-white p-8 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-pink-100 text-pink-600 transition-colors group-hover:bg-pink-500 group-hover:text-white">
                <Palette className="h-6 w-6" />
              </div>
              <h3 className="mb-2 font-serif text-xl font-bold">Creatividad</h3>
              <p className="text-gray-500">
                Cada lapicero y libreta está pensado para despertar tu
                imaginación y animarte a expresarte libremente.
              </p>
            </div>

            {/* Card 2 */}
            <div className="group rounded-3xl border border-pink-100 bg-white p-8 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-pink-100 text-pink-600 transition-colors group-hover:bg-pink-500 group-hover:text-white">
                <HeartHandshake className="h-6 w-6" />
              </div>
              <h3 className="mb-2 font-serif text-xl font-bold">Comunidad</h3>
              <p className="text-gray-500">
                Nuestros clientes son amigos. Nos sentimos orgullosos de
                construir una comunidad vibrante y acogedora.
              </p>
            </div>

            {/* Card 3 */}
            <div className="group rounded-3xl border border-pink-100 bg-white p-8 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-pink-100 text-pink-600 transition-colors group-hover:bg-pink-500 group-hover:text-white">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="mb-2 font-serif text-xl font-bold">
                Calidad Kawaii
              </h3>
              <p className="text-gray-500">
                Seleccionamos cuidadosamente cada producto para asegurar que
                aporte alegría, color y texturas únicas.
              </p>
            </div>
          </div>
        </section>

        {/* --- Social CTA Section --- */}
        <section className="relative mb-20 overflow-hidden rounded-3xl bg-gradient-to-br from-pink-100 via-pink-50 to-white px-6 py-12 text-center shadow-inner sm:px-12 sm:py-16">
          <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center gap-6">
            <h2 className="font-serif text-3xl font-bold text-gray-900">
              ¡Se parte de nuestro mundo colorido!
            </h2>
            <p className="text-lg text-gray-600">
              Síguenos para estar al día con las últimas novedades y ofertas.
              ¡Estamos emocionados de conectar contigo!
            </p>

            <div className="mt-4 flex flex-wrap justify-center gap-6">
              <SocialButton
                href="https://instagram.com/papeleria.pdepapel?igshid=OGQ5ZDc2ODk2ZA=="
                icon={<Instagram className="h-6 w-6" />}
                label="Instagram"
              />
              <SocialButton
                href="https://instagram.com/papeleria.pdepapel?igshid=OGQ5ZDc2ODk2ZA=="
                icon={<Facebook className="h-6 w-6" />}
                label="Facebook"
              />
              <SocialButton
                href="https://www.tiktok.com/@papeleria.pdepapel?_t=8gctJXIdqD7&_r=1"
                icon={<Icons.tiktok className="h-5 w-5" />} // Adjusted size for uniformity
                label="TikTok"
              />
            </div>
          </div>

          {/* Background decoration circles */}
          <div className="absolute right-0 top-0 -mr-16 -mt-16 h-48 w-48 rounded-full bg-white opacity-40 blur-2xl" />
          <div className="absolute bottom-0 left-0 -mb-16 -ml-16 h-48 w-48 rounded-full bg-pink-200 opacity-30 blur-2xl" />
        </section>

        <SocialMedia data={posts} />
      </Container>
      <Newsletter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
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
      className="group flex items-center gap-2 rounded-full bg-white px-6 py-3 font-medium text-gray-700 shadow-sm transition-all hover:scale-105 hover:bg-pink-500 hover:text-white hover:shadow-md"
    >
      <span className="text-pink-400 transition-colors group-hover:text-white">
        {icon}
      </span>
      {label}
    </Link>
  );
}
