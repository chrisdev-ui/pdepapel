import { cn } from "@/lib/utils";
import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";
import React from "react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
  isCurrent?: boolean;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, className }) => {
  return (
    <nav aria-label="Breadcrumb" className={cn("flex", className)}>
      <ol className="flex flex-wrap items-center space-x-2 text-sm text-gray-500">
        <li className="flex items-center">
          <Link
            href="/"
            className="flex items-center transition-colors hover:text-black hover:underline"
          >
            <Home className="h-4 w-4" />
            <span className="sr-only">Inicio</span>
          </Link>
        </li>

        {items.map((item, index) => (
          <li key={index} className="flex items-center">
            <ChevronRight className="mx-2 h-4 w-4 flex-shrink-0 text-gray-400" />

            {item.isCurrent ? (
              <span className="font-medium text-gray-900" aria-current="page">
                {item.label}
              </span>
            ) : item.href ? (
              <Link
                href={item.href}
                className="transition-colors hover:text-black hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span>{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};
