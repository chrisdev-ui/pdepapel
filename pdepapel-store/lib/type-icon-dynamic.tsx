"use client";

import type { LucideIcon } from "lucide-react";
import type { IconName } from "lucide-react/dynamic";
import { lazy, Suspense } from "react";

/**
 * Icono de Lucide por nombre, cargado bajo demanda: el índice completo de
 * iconos no entra en el paquete inicial de la tienda. Mientras carga (y en
 * el servidor) se pinta el icono de respaldo por palabra clave, idéntico al
 * de siempre, así que nada salta.
 */
const LazyDynamicIcon = lazy(() => import("lucide-react/dynamic").then((mod) => ({ default: mod.DynamicIcon })));

export function DynamicTypeIcon({
  name,
  Fallback,
  className,
}: {
  name: IconName;
  Fallback: LucideIcon;
  className?: string;
}) {
  const fallback = <Fallback aria-hidden="true" className={className} />;
  return (
    <Suspense fallback={fallback}>
      <LazyDynamicIcon name={name} aria-hidden="true" className={className} fallback={() => fallback} />
    </Suspense>
  );
}
