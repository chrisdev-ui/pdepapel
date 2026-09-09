import NextImage from "next/image";
import Link from "next/link";
import { Fragment, ReactNode } from "react";

import { Currency } from "@/components/ui/currency";
import { productPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { Image } from "@/types";

/** Resalta la coincidencia (sin acentos ni mayúsculas) dentro del nombre. */
export function highlightMatch(text: string, query: string): ReactNode {
  const term = query.trim();
  if (!term) return text;
  const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es-CO");
  const folded = fold(text);
  const needle = fold(term);
  const parts: ReactNode[] = [];
  let cursor = 0;
  let index = folded.indexOf(needle);
  let key = 0;
  while (index !== -1 && needle.length > 0) {
    if (index > cursor) parts.push(<Fragment key={key++}>{text.slice(cursor, index)}</Fragment>);
    parts.push(
      <mark key={key++} className="rounded-[3px] bg-kawaii-yellow-light text-inherit">
        {text.slice(index, index + needle.length)}
      </mark>,
    );
    cursor = index + needle.length;
    index = folded.indexOf(needle, cursor);
  }
  if (cursor < text.length) parts.push(<Fragment key={key++}>{text.slice(cursor)}</Fragment>);
  return parts;
}

interface SearchItemProps {
  id: string;
  slug?: string;
  image?: Image;
  name: string;
  price: number | string;
  minPrice?: number;
  isGroup?: boolean;
  stock?: number;
  query?: string;
  optionId?: string;
  active?: boolean;
  closeAll: () => void;
}

/** Fila de producto del desplegable: miniatura de 44 px, nombre resaltado y precio. */
export const SearchItem: React.FC<SearchItemProps> = ({ id, slug, image, name, price, minPrice, isGroup, stock, query = "", optionId, active = false, closeAll }) => {
  const soldOut = stock === 0;
  return (
    <li id={optionId} role="option" aria-selected={active}>
      <Link
        href={productPath(slug || id)}
        tabIndex={-1}
        onClick={closeAll}
        className={cn(
          "grid min-h-14 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2.5 py-1.5 transition-colors hover:bg-kawaii-lavender-light/60",
          active && "bg-kawaii-lavender-light",
        )}
      >
        <span className="relative block h-11 w-11 overflow-hidden rounded-[10px] bg-gray-100">
          {image?.url ? <NextImage src={image.url} alt="" fill sizes="44px" className="object-cover" /> : null}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-sans text-sm font-semibold leading-tight text-blue-yankees">{highlightMatch(name, query)}</span>
          {soldOut ? <span className="font-sans text-xs font-medium text-rose-700">Agotado</span> : null}
        </span>
        <span className="flex flex-col items-end font-sans text-sm font-bold text-blue-yankees">
          {isGroup && <span className="text-[11px] font-medium text-muted-foreground">Desde</span>}
          <Currency className="text-sm font-bold" value={isGroup && minPrice ? minPrice : price} />
        </span>
      </Link>
    </li>
  );
};
