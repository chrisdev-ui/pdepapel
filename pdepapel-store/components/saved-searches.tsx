"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Bookmark, LogIn, Search, Trash2 } from "lucide-react";
import Link from "next/link";

import { deleteSavedSearch, getSavedSearches, SavedSearch } from "@/actions/account-saved-searches";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { NoResults } from "@/components/ui/no-results";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { accountAccessPath, STOREFRONT_ROUTES } from "@/lib/routes";

const FILTER_LABELS: Record<string, string> = {
  typeId: "tipo",
  categoryId: "categoría",
  colorId: "color",
  sizeId: "tamaño",
  optionValueId: "opción",
  designId: "diseño",
  minPrice: "precio",
  maxPrice: "precio",
  isOnSale: "en oferta",
  sortOption: "orden",
};

/** Resumen legible de la query guardada, sin depender de los catálogos. */
export function describeSavedQuery(query: string): string {
  const params = new URLSearchParams(query);
  const parts: string[] = [];
  const search = params.get("search");
  if (search) parts.push(`«${search}»`);
  const labels = new Set<string>();
  params.forEach((_, key) => {
    if (key !== "search" && FILTER_LABELS[key]) labels.add(FILTER_LABELS[key]);
  });
  if (labels.size > 0) parts.push(`filtros: ${Array.from(labels).join(", ")}`);
  return parts.join(" · ") || "Todos los productos";
}

export const SavedSearches: React.FC = () => {
  const { userId, isLoaded, getToken } = useAuth();
  const queryClient = useQueryClient();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["saved-searches", userId],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("No session token available");
      return getSavedSearches(token);
    },
    enabled: isLoaded && Boolean(userId),
    staleTime: 60 * 1000,
    retry: 1,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      if (!token) throw new Error("No session token available");
      await deleteSavedSearch(token, id);
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData<SavedSearch[]>(["saved-searches", userId], (current) => current?.filter((item) => item.id !== id) ?? []);
      toast({ variant: "success", description: "Búsqueda eliminada." });
    },
    onError: () => toast({ variant: "destructive", description: "No pudimos eliminar la búsqueda. Inténtalo de nuevo." }),
  });

  if (!isLoaded || (userId && isPending)) {
    return (
      <Container className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </Container>
    );
  }

  if (!userId) {
    return (
      <Container className="space-y-6">
        <div className="rounded-2xl border-2 border-purple-100 bg-gradient-to-br from-purple-50 to-pink-50 p-6 text-center shadow-sm">
          <h1 className="font-serif text-2xl font-extrabold">Tus búsquedas favoritas, a un clic</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Inicia sesión o crea una cuenta gratis para guardar combinaciones de filtros y volver a ellas cuando quieras.
          </p>
          <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild>
              <Link href={accountAccessPath(STOREFRONT_ROUTES.signIn, STOREFRONT_ROUTES.savedSearches)}>
                <LogIn className="mr-2 h-5 w-5" /> Iniciar sesión
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={accountAccessPath(STOREFRONT_ROUTES.signUp, STOREFRONT_ROUTES.savedSearches)}>Crear cuenta</Link>
            </Button>
          </div>
        </div>
      </Container>
    );
  }

  if (isError) {
    return (
      <Container className="space-y-4">
        <NoResults message="No pudimos cargar tus búsquedas. Inténtalo de nuevo en unos minutos." />
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => refetch()}>
            Reintentar
          </Button>
        </div>
      </Container>
    );
  }

  const searches = data ?? [];

  return (
    <Container className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-extrabold text-blue-yankees sm:text-3xl">Mis búsquedas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Filtros que guardaste desde la tienda. Hasta 20 búsquedas.</p>
        </div>
        <Button variant="outline" asChild>
          <Link href={STOREFRONT_ROUTES.shop}>
            <Search className="mr-2 h-4 w-4" /> Ir a la tienda
          </Link>
        </Button>
      </div>

      {searches.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-pink-200 bg-pink-50/40 p-8 text-center">
          <Bookmark aria-hidden="true" className="mx-auto h-8 w-8 text-pink-froly" />
          <p className="mt-3 font-sans font-semibold text-blue-yankees">Todavía no has guardado búsquedas</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Filtra la tienda como te guste y pulsa «Guardar búsqueda» para tenerla aquí.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {searches.map((search) => (
            <li key={search.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
              <div className="min-w-0">
                <h2 className="truncate font-sans text-base font-semibold text-blue-yankees">{search.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{describeSavedQuery(search.query)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Guardada el {format(new Date(search.createdAt), "d 'de' MMMM 'de' yyyy", { locale: es })}
                </p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button size="sm" asChild>
                  <Link href={`${STOREFRONT_ROUTES.shop}?${search.query}`}>Ver resultados</Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove.mutate(search.id)}
                  disabled={remove.isPending}
                  aria-label={`Eliminar la búsqueda ${search.name}`}
                >
                  <Trash2 aria-hidden="true" className="mr-1.5 h-4 w-4" /> Eliminar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
};
