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

import { stripTaxonomyIcon } from "@/lib/catalog-labels";

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

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function resolveTypeIcon(type: {
  slug?: string | null;
  name?: string | null;
  icon?: string | null;
}): LucideIcon {
  const explicit = type.icon?.trim().toLowerCase();
  if (explicit && LUCIDE_BY_NAME[explicit]) return LUCIDE_BY_NAME[explicit];

  const haystack = normalizeKey(
    `${type.slug ?? ""} ${stripTaxonomyIcon(type.name)}`,
  );
  for (const [keyword, icon] of Object.entries(TYPE_ICONS)) {
    if (haystack.includes(keyword)) return icon;
  }
  return Tag;
}

export function TypeIcon({
  type,
  className,
}: {
  type: { slug?: string | null; name?: string | null; icon?: string | null };
  className?: string;
}) {
  const Icon = resolveTypeIcon(type);
  return <Icon aria-hidden="true" className={className} />;
}
