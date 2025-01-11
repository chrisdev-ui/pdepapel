import { BookHeartIcon, Facebook, Instagram } from "lucide-react";
import { Metadata } from "next";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";

import { getPosts } from "@/actions/get-posts";
import { Icons } from "@/components/icons";
import { Container } from "@/components/ui/container";

const SocialMedia = dynamic(() => import("./components/social-media"), {
  ssr: false,
});

const Newsletter = dynamic(() => import("@/components/newsletter"), {
  ssr: false,
});

export const metadata: Metadata = {
  title: "Nuestra historia",
  description:
    "Descubre la historia detrás de Papelería P de Papel. Aprende sobre nuestra misión de traer productos kawaii y de oficina de alta calidad a tu espacio. Conoce nuestras redes y nuestra pasión por la papelería que inspira creatividad y organización.",
  alternates: {
    canonical: "/about",
  },
};

export const revalidate = 0;

export default async function AboutPage() {
  const posts = await getPosts();
  return (
    <>
      <Container>
        <h1 className="flex items-center justify-start font-serif text-3xl font-bold">
          Nuestra historia
          <BookHeartIcon className="ml-2 h-8 w-8" />
        </h1>
        <section className="mt-12 flex flex-col gap-6 lg:grid lg:grid-cols-8 lg:items-start lg:gap-x-6 xl:gap-x-12">
          <div className="col-span-3">
            <div className="relative h-[15vh] w-full rounded-md bg-[#ffe5ee] transition-all duration-700 ease-in-out hover:scale-105 hover:cursor-zoom-in sm:h-[40vh] xl:h-[30vh]">
              <Image
                src="/images/text-beside-lightpink-bg.webp"
                alt="Logo Papelería P de Papel con fondo rosado"
                fill
                sizes="(max-width: 640px) 100vw, 640px"
                className="rounded-md object-contain shadow-lg"
                unoptimized
              />
            </div>
          </div>
          <article className="col-span-5 flex flex-col gap-2">
            <p>
              Somos una tienda de papelería en línea especializada en productos
              kawaii, esos adorables artículos que no solo alegran tu día, sino
              que también añaden un toque de encanto y diversión a tu rutina
              diaria. Nuestro catálogo incluye una variedad de lapiceros,
              libretas, planeadores, y muchos otros productos que hacen que la
              organización y la escritura sean una experiencia verdaderamente
              mágica.
            </p>
            <p>
              Nuestra aventura comenzó como un pequeño proyecto de amor, nacido
              de una profunda pasión por los artículos kawaii. Mi pareja y yo
              siempre hemos compartido un amor por lo único y lo encantador.
              Inspirados por esta pasión, decidimos lanzar{" "}
              <span className="text-pink-froly">P de Papel</span> para compartir
              con el mundo nuestra fascinación por la papelería kawaii. Lo que
              empezó como un sueño compartido en nuestra sala de estar, se ha
              transformado en una próspera comunidad en línea, uniendo a amantes
              de lo kawaii.
            </p>
            <p>
              Creemos firmemente que los pequeños detalles pueden hacer una gran
              diferencia. Por eso, cada producto en nuestro catálogo ha sido
              cuidadosamente seleccionado para asegurar que aporte alegría y
              creatividad a tu vida. Desde los diseños más dulces y divertidos
              hasta los colores vivos y las texturas únicas, cada artículo de
              nuestra tienda está pensado para despertar tu imaginación y
              animarte a expresarte.
            </p>
          </article>
        </section>
        <article className="mt-6 flex w-full flex-col gap-2">
          <p>
            Nos sentimos orgullosos de ser parte de una comunidad tan vibrante y
            acogedora. Nuestros clientes no solo son compradores; son amigos que
            comparten nuestro amor por lo kawaii. Estamos comprometidos a
            ofrecer no solo productos de alta calidad, sino también un servicio
            al cliente excepcional, asegurando que cada experiencia de compra
            sea tan encantadora como nuestros productos.
          </p>
          <p>
            Te invitamos a sumergirte en nuestro colorido mundo de papelería
            kawaii. Explora, sueña y descubre todo lo que{" "}
            <span className="text-pink-froly">P de Papel</span> tiene para
            ofrecer.
          </p>
          <p className="font-serif font-semibold">
            ¡Síguenos en nuestras redes sociales para estar al día con las
            últimas novedades, ofertas y mucho más! Encuéntranos en Instagram,
            TikTok y Facebook. ¡Estamos emocionados de conectar contigo!
          </p>
          <div className="flex items-center gap-12 self-center">
            <Link
              rel="noopener noreferrer"
              href="https://instagram.com/papeleria.pdepapel?igshid=OGQ5ZDc2ODk2ZA=="
              title="Facebook"
              className="transition-all duration-700 ease-in-out hover:text-pink-froly"
              target="_blank"
            >
              <Facebook className="h-12 w-12" />
            </Link>
            <Link
              rel="noopener noreferrer"
              href="https://instagram.com/papeleria.pdepapel?igshid=OGQ5ZDc2ODk2ZA=="
              title="Instagram"
              className="transition-all duration-700 ease-in-out hover:text-pink-froly"
              target="_blank"
            >
              <Instagram className="h-12 w-12" />
            </Link>
            <Link
              rel="noopener noreferrer"
              href="https://www.tiktok.com/@papeleria.pdepapel?_t=8gctJXIdqD7&_r=1"
              title="TikTok"
              target="_blank"
              className="transition-all duration-700 ease-in-out hover:text-pink-froly"
            >
              <Icons.tiktok className="h-12 w-12" />
            </Link>
          </div>
        </article>
        <SocialMedia data={posts} />
      </Container>
      <Newsletter />
    </>
  );
}
