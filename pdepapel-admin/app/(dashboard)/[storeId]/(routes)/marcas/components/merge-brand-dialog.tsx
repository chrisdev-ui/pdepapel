"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { brandsApi, canOfferLogoCopy, mergeCandidates, mergeSummaryLines, plural } from "@/lib/brand-admin";
import type { MergeSummary } from "@/lib/brands";

import type { BrandRow } from "../server/get-brands";
import { BrandLogoTile } from "./brand-logo-tile";

const NARROW_QUERY = "(max-width: 639px)";

/** Teléfono: el diálogo sale como hoja desde abajo. */
export function useIsNarrow() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(NARROW_QUERY).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(NARROW_QUERY);
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return narrow;
}

interface MergeBrandDialogProps {
  storeId: string;
  source: BrandRow;
  /** Todas las marcas de la lista: se ofrecen las activas que pueden recibirla (`mergeCandidates`). */
  brands: BrandRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MergeBrandDialog({ storeId, source, brands, open, onOpenChange }: MergeBrandDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const narrow = useIsNarrow();
  const fieldId = useId();
  const [targetId, setTargetId] = useState<string | null>(null);
  const [copyLogo, setCopyLogo] = useState(false);
  const [loading, setLoading] = useState(false);

  const candidates = useMemo(() => mergeCandidates(source, brands), [brands, source]);
  const target = candidates.find((brand) => brand.id === targetId) ?? null;
  const offerLogo = canOfferLogoCopy(source, target);

  useEffect(() => {
    if (!offerLogo) setCopyLogo(false);
  }, [offerLogo]);

  const onMerge = async () => {
    if (!target) return;
    try {
      setLoading(true);
      const { data } = await axios.post<MergeSummary>(`${brandsApi(storeId)}/${source.id}/merge`, {
        targetBrandId: target.id,
        copyLogo: offerLogo && copyLogo,
      });
      toast({
        description: `Fusionadas: ${plural(data.movedProducts, "producto ahora es", "productos ahora son")} de ${data.target.name}.`,
        variant: "success",
      });
      onOpenChange(false);
      router.push(`/${storeId}/marcas/${data.target.id}`);
      router.refresh();
    } catch (error) {
      toast({ title: "No se pudo fusionar", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const title = `Fusionar «${source.name}» en…`;
  const description = "Para una marca repetida o un nombre que es otra forma de escribirla. Si es una línea de otra marca, usa «Es una línea de» en su ficha.";

  const body = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={fieldId} className="text-sm font-medium text-primary">
          Marca de destino
        </label>
        <Combobox
          id={fieldId}
          options={candidates.map((brand) => ({
            value: brand.id,
            label: brand.name,
            description: brand.parentName ? `línea de ${brand.parentName}` : undefined,
            keywords: brand.aliases,
            icon: <BrandLogoTile logoUrl={brand.logoUrl} size="sm" className="h-8 w-8 p-0.5 text-[8px]" />,
          }))}
          value={targetId}
          onChange={setTargetId}
          placeholder="Elige la marca que se queda"
          searchPlaceholder="Buscar marca…"
          emptyText="No hay otra marca activa."
          className="min-h-11 w-full"
        />
      </div>

      {target && (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-bold text-primary">Al fusionar:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-primary">
            {mergeSummaryLines(
              { name: source.name, slug: source.slug, productCount: source.totalProducts, lineCount: source.lines },
              target,
            ).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {offerLogo && target && (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm text-primary">
          <input
            type="checkbox"
            className="h-5 w-5 accent-primary"
            checked={copyLogo}
            onChange={(event) => setCopyLogo(event.target.checked)}
          />
          Usar el logo de {source.name} en {target.name}
        </label>
      )}

      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <span aria-hidden="true" className="font-bold">
          !{" "}
        </span>
        No se puede deshacer; {source.name} queda archivada, no borrada.
      </p>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={loading}>
          Cancelar
        </Button>
        <Button
          className="min-h-11"
          onClick={() => void onMerge()}
          disabled={!target}
          isLoading={loading}
          loadingText="Fusionando…"
        >
          {target ? `Fusionar en ${target.name}` : "Fusionar"}
        </Button>
      </div>
    </div>
  );

  return narrow ? (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] rounded-t-2xl p-4">
        <SheetHeader className="p-0">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  ) : (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

