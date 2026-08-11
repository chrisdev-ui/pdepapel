"use client";
import { parseAsInteger, useQueryState } from "nuqs";
import { useEffect, useRef } from "react";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { DOTS } from "@/constants";
import { getPaginationPages } from "@/lib/pagination";

interface PaginatorProps {
  totalPages: number;
}

const Paginator: React.FC<PaginatorProps> = ({ totalPages }) => {
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

  const currentPage = page ?? 1;
  const previousPageRef = useRef(currentPage);

  useEffect(() => {
    if (previousPageRef.current === currentPage) return;

    window.scrollTo({ top: 0, behavior: "smooth" });
    previousPageRef.current = currentPage;
  }, [currentPage]);

  const pagesToShow = getPaginationPages(currentPage, totalPages);

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setPage(currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setPage(currentPage + 1);
    }
  };

  const goToPage = (page: number) => {
    setPage(page === 1 ? null : page);
  };

  return (
    <Pagination>
      <PaginationContent className="max-w-full gap-0.5 sm:gap-1">
        <PaginationPrevious
          onClick={goToPreviousPage}
          disabled={currentPage === 1}
          className="h-9 w-9 p-0 sm:h-10 sm:w-auto sm:px-2.5 [&>span]:hidden sm:[&>span]:inline"
        />
        {pagesToShow.map((page, index) => {
          if (page === DOTS) {
            return (
              <PaginationItem key={`${page}-${index}`}>
                <PaginationEllipsis />
              </PaginationItem>
            );
          }
          return (
            <PaginationLink
              key={page}
              isActive={page === currentPage}
              onClick={() => goToPage(page as number)}
            >
              {page}
            </PaginationLink>
          );
        })}
        <PaginationNext
          onClick={goToNextPage}
          disabled={currentPage === totalPages}
          className="h-9 w-9 p-0 sm:h-10 sm:w-auto sm:px-2.5 [&>span]:hidden sm:[&>span]:inline"
        />
      </PaginationContent>
    </Pagination>
  );
};

export default Paginator;
