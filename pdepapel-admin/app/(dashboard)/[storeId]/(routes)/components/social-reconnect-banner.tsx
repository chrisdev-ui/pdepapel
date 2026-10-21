import type { SocialPlatform } from "@prisma/client";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";

import { SOCIAL_PLATFORM_LABEL } from "@/lib/social/reconnect";

/** Aviso de Inicio (solo la dueña) mientras una red pide volver a conectarla. */
export function SocialReconnectBanner({ storeId, platforms }: { storeId: string; platforms: SocialPlatform[] }) {
  if (platforms.length === 0) return null;
  const names = platforms.map((platform) => SOCIAL_PLATFORM_LABEL[platform]).join(" y ");
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-tint-pink bg-tint-pink p-4 text-sm text-primary">
      <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 font-semibold">Hay que reconectar {names}</p>
      <Link href={`/${storeId}/redes`} className="inline-flex min-h-[44px] items-center font-semibold underline underline-offset-4">
        Ir a Métricas de redes
      </Link>
    </div>
  );
}
