"use client";

import { usePathname } from "next/navigation";

import { publicPathname } from "@/lib/routes";

/**
 * `usePathname` sin el prefijo de las copias en caché de /tienda y
 * /categoria: en el servidor esas páginas se pintan bajo `/catalogo-cache`, en
 * el navegador bajo la URL pública, y los enlaces activos deben coincidir.
 */
export function useStorefrontPathname(): string {
  return publicPathname(usePathname() ?? "/");
}
