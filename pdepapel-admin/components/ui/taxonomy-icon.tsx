"use client";

import {
  Backpack,
  BookOpen,
  Briefcase,
  CalendarDays,
  Flower,
  Folder,
  Gift,
  type LucideIcon,
  NotebookPen,
  Palette,
  Paperclip,
  PenLine,
  Pencil,
  Scissors,
  Sparkles,
  Sticker,
  Tag,
} from "lucide-react";
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";
import { createElement, useMemo } from "react";

import {
  LUCIDE_SVG_ATTRIBUTES,
  parseIconSvgElements,
  type IconSvgElement,
} from "@/lib/svg-icon";
import {
  DEFAULT_TAXONOMY_ICON,
  isLucideIconName,
  resolveFallbackIconName,
} from "@/lib/taxonomy-icons";
import { cn } from "@/lib/utils";

/** Los iconos curados van en el paquete inicial; cualquier otro nombre se carga bajo demanda. */
const STATIC_ICONS: Record<string, LucideIcon> = {
  backpack: Backpack,
  "book-open": BookOpen,
  briefcase: Briefcase,
  "calendar-days": CalendarDays,
  flower: Flower,
  folder: Folder,
  gift: Gift,
  "notebook-pen": NotebookPen,
  palette: Palette,
  paperclip: Paperclip,
  "pen-line": PenLine,
  pencil: Pencil,
  scissors: Scissors,
  sparkles: Sparkles,
  sticker: Sticker,
  tag: Tag,
};

let knownIconNames: Set<string> | null = null;
const isKnownIconName = (name: string): name is IconName => {
  if (!knownIconNames) knownIconNames = new Set(iconNames);
  return knownIconNames.has(name);
};

export interface TaxonomyIconSource {
  icon?: string | null;
  iconSvg?: string | null;
  name?: string | null;
  slug?: string | null;
}

interface TaxonomyIconProps extends TaxonomyIconSource {
  className?: string;
  /** Con `true` se anuncia el nombre del icono a lectores de pantalla; por defecto es decorativo. */
  labelled?: boolean;
}

/** Pinta los trazos saneados de un icono propio con el envoltorio de Lucide. */
export function IconSvg({
  elements,
  className,
  title,
}: {
  elements: IconSvgElement[];
  className?: string;
  title?: string;
}) {
  return (
    <svg
      {...LUCIDE_SVG_ATTRIBUTES}
      className={className}
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
      data-taxonomy-icon="svg"
    >
      {title && <title>{title}</title>}
      {elements.map((element, index) =>
        createElement(element.tag, { key: `${element.tag}-${index}`, ...element.attrs }),
      )}
    </svg>
  );
}

/**
 * Icono de una categoría en el panel, con la misma prioridad que la tienda:
 * icono propio (`iconSvg`) → nombre de Lucide (`icon`) → palabra clave del
 * slug/nombre → etiqueta neutra.
 */
export function TaxonomyIcon({ icon, iconSvg, name, slug, className, labelled = false }: TaxonomyIconProps) {
  const elements = useMemo(() => parseIconSvgElements(iconSvg), [iconSvg]);
  const fallbackName = resolveFallbackIconName({ name, slug });
  const Fallback = STATIC_ICONS[fallbackName] ?? STATIC_ICONS[DEFAULT_TAXONOMY_ICON];

  if (elements.length > 0) {
    return <IconSvg elements={elements} className={className} title={labelled ? "Icono propio" : undefined} />;
  }

  const explicit = icon?.trim().toLowerCase();
  if (explicit && isLucideIconName(explicit)) {
    const Static = STATIC_ICONS[explicit];
    if (Static) {
      return <Static aria-hidden={labelled ? undefined : "true"} aria-label={labelled ? explicit : undefined} className={className} data-taxonomy-icon={explicit} />;
    }
    if (isKnownIconName(explicit)) {
      return (
        <DynamicIcon
          name={explicit}
          aria-hidden={labelled ? undefined : "true"}
          aria-label={labelled ? explicit : undefined}
          className={className}
          data-taxonomy-icon={explicit}
          fallback={() => <Fallback aria-hidden="true" className={cn(className, "opacity-40")} />}
        />
      );
    }
  }

  return <Fallback aria-hidden={labelled ? undefined : "true"} aria-label={labelled ? fallbackName : undefined} className={className} data-taxonomy-icon={fallbackName} />;
}
