import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const Pagination = ({ className, ...props }: React.ComponentProps<"nav">) => (
  <nav role="navigation" aria-label="Paginación" className={cn("mx-auto flex w-full justify-center", className)} {...props} />
);

const PaginationContent = React.forwardRef<HTMLUListElement, React.ComponentProps<"ul">>(({ className, ...props }, ref) => (
  <ul ref={ref} className={cn("flex flex-row items-center gap-1", className)} {...props} />
));
PaginationContent.displayName = "PaginationContent";

const PaginationItem = React.forwardRef<HTMLLIElement, React.ComponentProps<"li">>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("", className)} {...props} />
));
PaginationItem.displayName = "PaginationItem";

type PaginationLinkProps = { isActive?: boolean } & React.ComponentProps<"button">;

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2";

const PaginationLink = ({ className, isActive, ...props }: PaginationLinkProps) => (
  <PaginationItem>
    <button
      type="button"
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "inline-flex h-10 w-10 touch-manipulation items-center justify-center rounded-full font-sans text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40",
        isActive ? "bg-blue-yankees text-white" : "text-blue-yankees hover:bg-kawaii-lavender-light",
        focusRing,
        className,
      )}
      {...props}
    />
  </PaginationItem>
);
PaginationLink.displayName = "PaginationLink";

const edgeClass = "h-10 w-auto gap-1.5 rounded-full border-[1.5px] border-blue-yankees px-3 hover:bg-kawaii-lavender-light sm:px-4";

const PaginationPrevious = ({ className, ...props }: React.ComponentProps<typeof PaginationLink>) => (
  <PaginationLink aria-label="Ir a la página anterior" className={cn(edgeClass, className)} {...props}>
    <ChevronLeft aria-hidden="true" className="h-4 w-4" />
    <span className="hidden sm:inline">Anterior</span>
  </PaginationLink>
);
PaginationPrevious.displayName = "PaginationPrevious";

const PaginationNext = ({ className, ...props }: React.ComponentProps<typeof PaginationLink>) => (
  <PaginationLink aria-label="Ir a la página siguiente" className={cn(edgeClass, className)} {...props}>
    <span className="hidden sm:inline">Siguiente</span>
    <ChevronRight aria-hidden="true" className="h-4 w-4" />
  </PaginationLink>
);

const PaginationEllipsis = ({ className, ...props }: React.ComponentProps<"span">) => (
  <span aria-hidden className={cn("flex h-10 w-8 items-center justify-center text-muted-foreground", className)} {...props}>
    <MoreHorizontal className="h-4 w-4" />
    <span className="sr-only">Más páginas</span>
  </span>
);

export { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious };
