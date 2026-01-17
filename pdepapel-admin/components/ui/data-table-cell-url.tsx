"use client";

import { ExternalLink } from "lucide-react";

interface DataTableCellUrlProps {
  url?: string | null;
}

export const DataTableCellUrl = ({ url }: DataTableCellUrlProps) => {
  if (!url) {
    return <span className="italic text-muted-foreground">Sin link</span>;
  }

  const maxLength = 50;
  const displayUrl =
    url.length > maxLength ? `${url.substring(0, maxLength)}...` : url;

  const isRelative = url.startsWith("/");
  const storeUrl =
    process.env.NEXT_PUBLIC_FRONTEND_STORE_URL ||
    process.env.FRONTEND_STORE_URL ||
    "http://localhost:3001";
  const href = isRelative ? `${storeUrl}${url}` : url;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="relative z-10 flex items-center gap-x-2 text-blue-500 hover:text-blue-700 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      <span>{displayUrl}</span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
};
