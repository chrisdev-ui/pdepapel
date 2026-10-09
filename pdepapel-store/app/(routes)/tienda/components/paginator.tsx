"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { parseAsInteger, useQueryState } from "nuqs";
import { MouseEvent, useEffect, useRef } from "react";

import { Pagination, PaginationContent, PaginationEllipsis, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { DOTS, LIMIT_SHOP_ITEMS } from "@/constants";
import { isModifiedClick } from "@/lib/link-click";
import { getPaginationPages } from "@/lib/pagination";

interface PaginatorProps {
  totalPages: number;
  /** Elemento al que se sube al cambiar de página (la cuadrícula). */
  scrollTargetId?: string;
}

/** Páginas numeradas: la página va en la URL, se comparte y el «atrás» vuelve al mismo sitio. */
const Paginator: React.FC<PaginatorProps> = ({ totalPages, scrollTargetId = "catalog-results" }) => {
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPage = page ?? 1;
  const previousPageRef = useRef(currentPage);

  useEffect(() => {
    if (previousPageRef.current === currentPage) return;
    previousPageRef.current = currentPage;
    const target = document.getElementById(scrollTargetId);
    if (target) {
      const offset = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--storefront-header-offset"), 10) || 0;
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset - 12, behavior: "smooth" });
      target.focus({ preventScroll: true });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentPage, scrollTargetId]);

  if (totalPages <= 1) return null;

  const pagesToShow = getPaginationPages(currentPage, totalPages);
  const goToPage = (next: number) => setPage(next === 1 ? null : next, { history: "push" });
  /** La misma URL con los demás filtros; la página 1 no lleva `page`. */
  const pageHref = (next: number) => {
    const params = new URLSearchParams(searchParams?.toString());
    if (next === 1) params.delete("page");
    else params.set("page", String(next));
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };
  /** El clic normal cambia de página sin recargar, como antes; Cmd/Ctrl+clic abre la URL. */
  const linkTo = (next: number) => ({
    href: pageHref(next),
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      if (isModifiedClick(event)) return;
      event.preventDefault();
      goToPage(next);
    },
  });

  return (
    <div className="flex flex-col items-center gap-2.5">
      <Pagination>
        <PaginationContent className="max-w-full gap-1 sm:gap-1.5">
          <PaginationPrevious {...linkTo(currentPage - 1)} disabled={currentPage === 1} />
          {pagesToShow.map((item, index) =>
            item === DOTS ? (
              <PaginationEllipsis key={`dots-${index}`} />
            ) : (
              <PaginationLink key={item} isActive={item === currentPage} {...linkTo(item as number)}>
                {item}
              </PaginationLink>
            ),
          )}
          <PaginationNext {...linkTo(currentPage + 1)} disabled={currentPage === totalPages} />
        </PaginationContent>
      </Pagination>
      <p className="font-sans text-[13px] font-medium text-muted-foreground">
        Página {currentPage} de {totalPages} · {LIMIT_SHOP_ITEMS} productos por página
      </p>
    </div>
  );
};

export default Paginator;
