import { DOTS, MAX_PAGES } from "@/constants";

export type PaginationPage = number | typeof DOTS;

export function getPaginationPages(
  currentPage: number,
  totalPages: number,
): PaginationPage[] {
  if (totalPages <= 0) return [];

  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);

  if (totalPages <= MAX_PAGES) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (safeCurrentPage <= 3) {
    return [1, 2, 3, DOTS, totalPages];
  }

  if (safeCurrentPage >= totalPages - 2) {
    return [1, DOTS, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, DOTS, safeCurrentPage, DOTS, totalPages];
}
