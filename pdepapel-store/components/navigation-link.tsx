"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { useMemo } from "react";
import { useStorefrontPathname } from "@/hooks/use-storefront-pathname";

interface NavigationLinkProps {
  href: string;
  children: React.ReactNode;
  prefetch?: boolean;
  /** También activo en las páginas que cuelgan de `href` (`/marcas/kiut`). */
  matchPrefix?: boolean;
}

export const NavigationLink: React.FC<NavigationLinkProps> = ({
  href,
  children,
  prefetch,
  matchPrefix = false,
}) => {
  const pathname = useStorefrontPathname();
  const active = useMemo(() => pathname === href || (matchPrefix && pathname.startsWith(`${href}/`)), [pathname, href, matchPrefix]);
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={cn(
        "relative font-sans font-semibold no-underline after:absolute after:bottom-0 after:left-0 after:h-0.5 after:bg-blue-yankees after:content-['']",
        {
          "after:w-full": active,
          "after:w-0 after:transition-all after:duration-300 after:ease-in-out lg:hover:after:w-full":
            !active,
        },
      )}
    >
      {children}
    </Link>
  );
};
