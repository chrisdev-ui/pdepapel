"use client";

import Image from "next/image";

import { DeferredNewsletterForm } from "@/components/deferred-newsletter-form";
import { Container } from "@/components/ui/container";

const Newsletter: React.FC = () => {
  return (
    <Container
      component="section"
      className="mx-0 my-6 max-w-full p-0 sm:p-0 lg:p-0"
    >
      <div className="relative flex w-full flex-wrap items-center justify-between gap-5 overflow-hidden bg-pink-shell px-2 py-10 sm:px-20 xl:gap-0">
        <Image
          src="/images/pdp-signup.png"
          alt="Fondo de la sección de suscripción"
          fill
          className="-z-10 object-cover opacity-50"
          sizes="100vw"
        />
        <div className="z-10 max-w-2xl">
          <h2 className="font-serif text-3xl font-bold text-white">
            Entérate primero de lo nuevo en P de Papel
          </h2>
          <p className="mt-2 font-serif text-sm font-semibold text-blue-yankees">
            Confirma tu correo para recibir lanzamientos, llegada de mercancía y
            ofertas especiales. Máximo dos mensajes al mes.
          </p>
        </div>
        <DeferredNewsletterForm />
      </div>
    </Container>
  );
};

export default Newsletter;
