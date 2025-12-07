"use client";
import { parseAsInteger, useQueryState } from "nuqs";
import { useEffect, useState } from "react";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { DOTS, MAX_PAGES } from "@/constants";

interface PaginatorProps {
  totalPages: number;
}

const Paginator: React.FC<PaginatorProps> = ({ totalPages }) => {
  const [isMounted, setIsMounted] = useState(false);
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

  const currentPage = page ?? 1;

  const getPagesToShow = () => {
    if (totalPages <= MAX_PAGES) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    } else if (currentPage <= 2) {
      return [1, 2, DOTS, totalPages - 1, totalPages];
    } else if (currentPage >= totalPages) {
      return [1, 2, DOTS, totalPages - 1, totalPages];
    } else {
      const pages = [
        currentPage - 1,
        currentPage,
        DOTS,
        totalPages - 1,
        totalPages,
      ];
      return pages.filter((page, index, self) => self.indexOf(page) === index);
    }
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  const pagesToShow = getPagesToShow();

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
      <PaginationContent>
        <PaginationPrevious
          onClick={goToPreviousPage}
          disabled={currentPage === 1}
        />
        {pagesToShow.map((page) => {
          if (page === DOTS) {
            return (
              <PaginationItem key={page}>
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
        />
      </PaginationContent>
    </Pagination>
  );
};

export default Paginator;
