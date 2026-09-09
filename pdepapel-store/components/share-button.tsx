"use client";

import { Share2 } from "lucide-react";

import { toast } from "@/hooks/use-toast";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import { cn } from "@/lib/utils";

interface ShareButtonProps {
  title: string;
  /** Ruta relativa; se completa con el origen al compartir. */
  path: string;
  className?: string;
}

/** Compartir nativo cuando existe; si no, copia el enlace. */
export function ShareButton({ title, path, className }: ShareButtonProps) {
  const share = async () => {
    const url = `${window.location.origin}${path}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url });
        trackCustomerEvent("share_product", { method: "native" });
        return;
      }
      await navigator.clipboard.writeText(url);
      trackCustomerEvent("share_product", { method: "clipboard" });
      toast({ description: "Enlace copiado. Pégalo donde quieras compartirlo.", variant: "success" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast({ description: "No pudimos compartir el enlace. Cópialo desde la barra de direcciones.", variant: "warning" });
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 font-sans text-[13px] font-semibold text-gray-500 transition-colors hover:text-blue-yankees focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2",
        className,
      )}
    >
      <Share2 aria-hidden="true" className="h-4 w-4" />
      Compartir
    </button>
  );
}
