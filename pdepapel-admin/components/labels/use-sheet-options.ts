"use client";

import { useCallback, useEffect, useState } from "react";

import { DEFAULT_SHEET_OPTIONS, type LabelSheetOptions } from "@/lib/label-printing";
import { labelDraftStorageKey, parseLabelDraft, serializeLabelDraft } from "@/lib/label-sheet-draft";

/**
 * Las opciones de la hoja (desplazamiento y guías de corte) viven en el
 * borrador guardado por navegador, junto a las etiquetas. Este gancho las
 * lee y escribe desde cualquier página (panel, impresión, calibración) sin
 * tocar el resto del borrador, así el ajuste hecho mirando la hoja de
 * calibración es el mismo que usa la siguiente impresión.
 */
export function useSheetOptions(storeId: string) {
  const [options, setOptions] = useState<LabelSheetOptions>(DEFAULT_SHEET_OPTIONS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setOptions(parseLabelDraft(window.localStorage.getItem(labelDraftStorageKey(storeId))).sheet);
    } catch {
      setOptions(DEFAULT_SHEET_OPTIONS);
    }
    setHydrated(true);
  }, [storeId]);

  const update = useCallback(
    (next: LabelSheetOptions) => {
      setOptions(next);
      try {
        const key = labelDraftStorageKey(storeId);
        const draft = parseLabelDraft(window.localStorage.getItem(key));
        window.localStorage.setItem(key, serializeLabelDraft({ ...draft, sheet: next }));
      } catch {
        // Sin almacenamiento: el ajuste vale solo para esta página.
      }
    },
    [storeId],
  );

  return { options, setOptions: update, hydrated };
}
