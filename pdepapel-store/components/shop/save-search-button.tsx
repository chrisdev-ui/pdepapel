"use client";

import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

import { createSavedSearch } from "@/actions/account-saved-searches";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import { STOREFRONT_ROUTES } from "@/lib/routes";

interface SaveSearchButtonProps {
  /** Nombre sugerido a partir de los filtros activos. */
  suggestedName: string;
  /** En páginas de categoría la URL no lleva categoryId; se agrega al guardar. */
  fixedCategoryId?: string;
  className?: string;
}

/** Guarda la combinación actual de filtros en la cuenta de la clienta (solo con sesión). */
export function SaveSearchButton({ suggestedName, fixedCategoryId, className }: SaveSearchButtonProps) {
  const { isLoaded, userId, getToken } = useAuth();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  if (!isLoaded || !userId) return null;

  const buildQuery = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (fixedCategoryId && !params.has("categoryId")) params.set("categoryId", fixedCategoryId);
    return params.toString();
  };

  const openDialog = () => {
    setName(suggestedName.slice(0, 80));
    setOpen(true);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      setSaving(true);
      const token = await getToken();
      if (!token) throw new Error("Sin sesión");
      const { duplicate } = await createSavedSearch(token, { name: trimmed, query: buildQuery() });
      await queryClient.invalidateQueries({ queryKey: ["saved-searches", userId] });
      trackCustomerEvent("saved_search_create", { duplicate: Boolean(duplicate) });
      setOpen(false);
      toast({
        variant: "success",
        title: duplicate ? "Ya tenías esta búsqueda guardada" : "Búsqueda guardada",
        description: (
          <Link href={STOREFRONT_ROUTES.savedSearches} className="font-semibold underline underline-offset-4">
            Ver mis búsquedas
          </Link>
        ),
      });
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast({ variant: "destructive", description: message || "No pudimos guardar la búsqueda. Inténtalo de nuevo." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={openDialog} className={className}>
        <BookmarkPlus aria-hidden="true" className="mr-1.5 h-4 w-4" />
        Guardar búsqueda
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={onSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="font-serif">Guardar esta búsqueda</DialogTitle>
              <DialogDescription>Guardamos los filtros y el orden actuales para que vuelvas a ellos desde Mis búsquedas.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="saved-search-name">Nombre</Label>
              <Input id="saved-search-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoFocus required />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !name.trim()}>
                {saving && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
