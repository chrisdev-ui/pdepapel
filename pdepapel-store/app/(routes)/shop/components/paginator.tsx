"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import qs from "query-string";
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

export const Paginator: React.FC<PaginatorProps> = ({ totalPages }) => {
  const [isMounted, setIsMounted] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const currentPage = Number(searchParams.get("page")) || 1;

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
      const current = qs.parse(searchParams.toString(), {
        arrayFormat: "comma",
      });

      const query = {
        ...current,
        page: currentPage - 1,
      };

      const url = qs.stringifyUrl(
        {
          url: pathname,
          query,
        },
        { skipNull: true, arrayFormat: "comma" },
      );

      router.push(url);
    } else {
      const current = qs.parse(searchParams.toString(), {
        arrayFormat: "comma",
      });

      current.page = null;

      const url = qs.stringifyUrl(
        {
          url: pathname,
          query: current,
        },
        { skipNull: true, arrayFormat: "comma" },
      );

      router.push(url);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      const current = qs.parse(searchParams.toString(), {
        arrayFormat: "comma",
      });

      const query = {
        ...current,
        page: currentPage + 1,
      };

      const url = qs.stringifyUrl(
        {
          url: pathname,
          query,
        },
        { skipNull: true, arrayFormat: "comma" },
      );

      router.push(url);
    }
  };

  const goToPage = (page: number) => {
    const current = qs.parse(searchParams.toString(), {
      arrayFormat: "comma",
    });

    const query = {
      ...current,
      page: page === 1 ? null : page,
    };

    const url = qs.stringifyUrl(
      {
        url: pathname,
        query,
      },
      { skipNull: true, arrayFormat: "comma" },
    );

    router.push(url);
  };

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            onClick={goToPreviousPage}
            disabled={currentPage === 1}
          />
        </PaginationItem>
        {pagesToShow.map((page) => {
          if (page === DOTS) {
            return (
              <PaginationItem key={page}>
                <PaginationEllipsis />
              </PaginationItem>
            );
          }

          return (
            <PaginationItem key={page}>
              <PaginationLink
                isActive={page === currentPage}
                onClick={() => goToPage(page as number)}
              >
                {page}
              </PaginationLink>
            </PaginationItem>
          );
        })}
        <PaginationItem>
          <PaginationNext
            onClick={goToNextPage}
            disabled={currentPage === totalPages}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
};
