"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

interface UpstreamUnavailableProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export function UpstreamUnavailable({
  error,
  reset,
}: UpstreamUnavailableProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="flex min-h-[50vh] items-center justify-center py-12">
      <div className="max-w-md space-y-4 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-pink-froly" />
        <h1 className="font-serif text-3xl font-extrabold text-primary">
          Estamos actualizando la tienda
        </h1>
        <p className="text-muted-foreground">
          No pudimos cargar esta información por un momento. Tu carrito no se
          modificó; intenta de nuevo en unos segundos.
        </p>
        <Button onClick={reset} className="gap-2 bg-pink-froly">
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </Button>
      </div>
    </Container>
  );
}
