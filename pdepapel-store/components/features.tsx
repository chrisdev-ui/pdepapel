"use client";

import { Icons } from "@/components/icons";
import { Container } from "@/components/ui/container";
import { DELAY } from "@/constants";
import { useEffect, useRef, useState } from "react";

interface Feature {
  title: string;
  description: string;
  icon: JSX.Element;
}

const features: Feature[] = [
  {
    title: "Catálogo de productos",
    description: "¡Descubre todos los productos que tenemos para ti!",
    icon: <Icons.catalog className="h-16 w-16 text-pink-shell" />,
  },
  {
    title: "Envíos nacionales",
    description: "Desde Medellín enviamos a toda Colombia.",
    icon: <Icons.truck className="h-16 w-16 text-pink-shell" />,
  },
  {
    title: "Ofertas especiales",
    description: "¡Descubre nuestros precios en combos y productos!",
    icon: <Icons.discount className="h-16 w-16 text-pink-shell" />,
  },
  {
    title: "Métodos de pago",
    description: "¡Paga con tarjeta de crédito o débito!",
    icon: <Icons.creditCards className="h-16 w-16 text-pink-shell" />,
  },
  {
    title: "Atención al cliente",
    description: "¡Contáctanos para cualquier duda o sugerencia!",
    icon: <Icons.support className="h-16 w-16 text-pink-shell" />,
  },
];

const Features: React.FC<{}> = () => {
  const [index, setIndex] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };

  useEffect(() => {
    resetTimeout();
    timeoutRef.current = setTimeout(
      () =>
        setIndex((prevIndex) =>
          prevIndex === features?.length - 1 ? 0 : prevIndex + 1,
        ),
      DELAY,
    );
    return () => {
      resetTimeout();
    };
  }, [index]);

  return (
    <Container component="section">
      <section className="mx-auto my-0 overflow-hidden rounded-xl p-4 sm:p-6 lg:hidden lg:p-8">
        <div className="overflow-hidden">
          <div
            className="whitespace-nowrap"
            style={{
              transform: `translate3d(${-index * 100}%, 0, 0)`,
              transition: "ease 1000ms",
            }}
          >
            {features.map(({ title, description, icon }, idx) => (
              <div key={title} className="relative inline-block w-full">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-start justify-center">{icon}</div>
                  <div className="flex flex-col gap-2">
                    <span className="text-center font-serif text-sm font-semibold">
                      {title}
                    </span>
                    <span className="text-left text-xs">{description}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="hidden w-full grid-cols-5 items-start gap-x-6 lg:grid">
        {features.map(({ title, description, icon }) => (
          <div
            key={title}
            className="flex min-w-0 items-start"
          >
            <div className="flex shrink-0 items-start justify-center pr-3">
              {icon}
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-left font-serif text-sm font-semibold">
                {title}
              </span>
              <span className="text-left text-xs">{description}</span>
            </div>
          </div>
        ))}
      </section>
    </Container>
  );
};

export default Features;
