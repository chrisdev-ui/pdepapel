"use client";

import { Container } from "@/components/ui/container";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface ForbiddenProps {
  timeForRedirect?: number;
}

export const Forbidden: React.FC<ForbiddenProps> = ({
  timeForRedirect = 5,
}) => {
  const router = useRouter();
  const [seconds, setSeconds] = useState(timeForRedirect);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((seconds) => (seconds > 0 ? seconds - 1 : 0));
    }, 1000);

    if (seconds === 0) {
      router.push("/");
    }

    return () => clearInterval(interval);
  }, [router, seconds]);

  return (
    <Container className="flex items-center justify-center">
      <div className="w-full max-w-md space-y-8 lg:py-20">
        <div className="relative mx-auto h-48 w-48">
          <Image
            src="/images/text-below-transparent-bg.webp"
            fill
            alt="text-below"
            sizes="(max-width: 640px) 100vw, 640px"
            priority
            quality={100}
            className="object-cover"
          />
        </div>
        <h2 className="mt-6 text-center font-serif text-3xl font-extrabold text-pink-froly">
          !Acceso denegado!
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          No tienes permiso para acceder a esta página.
          <br />
          <br />
          Serás redirigido al inicio en {seconds} segundos.
        </p>
      </div>
    </Container>
  );
};
