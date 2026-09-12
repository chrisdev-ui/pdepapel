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
  Sparkles,
  Sticker,
  Tag,
} from "lucide-react";
import type { IconName } from "lucide-react/dynamic";
import { createElement } from "react";

import { stripTaxonomyIcon } from "@/lib/catalog-labels";
import { LUCIDE_SVG_ATTRIBUTES, parseIconSvgElements, type IconSvgElement } from "@/lib/svg-icon";
import { DynamicTypeIcon } from "@/lib/type-icon-dynamic";

/**
 * Lucide icon per catalog type. `Type.icon` may carry a Lucide name set from
 * the admin; otherwise the slug or name decides, and unknown types fall back
 * to a neutral tag so a new category never renders without an icon.
 */
export const TYPE_ICONS: Record<string, LucideIcon> = {
  cuadernos: NotebookPen,
  escritura: PenLine,
  lapices: Pencil,
  journal: Sticker,
  scrap: Sticker,
  planeacion: CalendarDays,
  organizacion: CalendarDays,
  utiles: Paperclip,
  kits: Gift,
  accesorios: Sparkles,
  bolsos: Backpack,
  morrales: Backpack,
  carpetas: Folder,
  oficina: Briefcase,
  lectura: BookOpen,
  creatividad: Palette,
  juego: Palette,
  belleza: Flower,
  cuidado: Flower,
};

/** Icons the storefront ships in its initial bundle; any other Lucide name loads on demand. */
const LUCIDE_BY_NAME: Record<string, LucideIcon> = {
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
  sparkles: Sparkles,
  sticker: Sticker,
  tag: Tag,
};

/** Same rule the admin enforces on `Type.icon`. */
const LUCIDE_ICON_NAME_PATTERN = /^[a-z0-9-]{2,32}$/;

export interface TypeIconInput {
  slug?: string | null;
  name?: string | null;
  icon?: string | null;
  iconSvg?: string | null;
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Keyword fallback: the icon the slug/name suggests, or a neutral tag. */
function resolveKeywordIcon(type: TypeIconInput): LucideIcon {
  const haystack = normalizeKey(`${type.slug ?? ""} ${stripTaxonomyIcon(type.name)}`);
  for (const [keyword, icon] of Object.entries(TYPE_ICONS)) {
    if (haystack.includes(keyword)) return icon;
  }
  return Tag;
}

/**
 * Static resolution (explicit bundled name → keyword → tag). Kept for callers
 * that need a component synchronously; `TypeIcon` adds the custom SVG and
 * lazily loaded Lucide names on top.
 */
export function resolveTypeIcon(type: TypeIconInput): LucideIcon {
  const explicit = type.icon?.trim().toLowerCase();
  if (explicit && LUCIDE_BY_NAME[explicit]) return LUCIDE_BY_NAME[explicit];
  return resolveKeywordIcon(type);
}

export type TypeIconSource =
  | { kind: "svg"; elements: IconSvgElement[] }
  | { kind: "static"; Icon: LucideIcon }
  | { kind: "dynamic"; name: IconName; Fallback: LucideIcon };

/**
 * Which drawing a type gets, in priority order: the admin's custom SVG,
 * a bundled Lucide icon, any other Lucide name (lazy, keyword icon while it
 * loads) or the keyword fallback.
 */
export function resolveTypeIconSource(type: TypeIconInput): TypeIconSource {
  const elements = parseIconSvgElements(type.iconSvg);
  if (elements.length > 0) return { kind: "svg", elements };

  const explicit = type.icon?.trim().toLowerCase();
  if (explicit && LUCIDE_BY_NAME[explicit]) return { kind: "static", Icon: LUCIDE_BY_NAME[explicit] };
  if (explicit && LUCIDE_ICON_NAME_PATTERN.test(explicit)) {
    return { kind: "dynamic", name: explicit as IconName, Fallback: resolveKeywordIcon(type) };
  }
  return { kind: "static", Icon: resolveKeywordIcon(type) };
}

export function TypeIcon({ type, className }: { type: TypeIconInput; className?: string }) {
  const source = resolveTypeIconSource(type);
  if (source.kind === "svg") {
    return (
      <svg {...LUCIDE_SVG_ATTRIBUTES} aria-hidden="true" className={className} data-type-icon="svg">
        {source.elements.map((element, index) => createElement(element.tag, { key: `${element.tag}-${index}`, ...element.attrs }))}
      </svg>
    );
  }
  if (source.kind === "dynamic") {
    return <DynamicTypeIcon name={source.name} Fallback={source.Fallback} className={className} />;
  }
  const Icon = source.Icon;
  return <Icon aria-hidden="true" className={className} />;
}
