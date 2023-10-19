"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

interface NavigationLinkProps {
  href: string;
  children: React.ReactNode;
}

export const NavigationLink: React.FC<NavigationLinkProps> = ({
  href,
  children,
}) => {
  const pathname = usePathname();
  const active = useMemo(() => pathname === href, [pathname, href]);
  return (
    <Link
      href={href}
      className={cn(
        "relative font-serif font-semibold no-underline after:absolute after:bottom-0 after:left-0 after:h-0.5 after:bg-blue-yankees after:content-['']",
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
