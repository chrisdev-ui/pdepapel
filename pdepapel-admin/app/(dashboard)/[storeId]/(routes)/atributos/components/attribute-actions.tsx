"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import type { MergeableKind } from "@/lib/attribute-merge";

import { MergeAttributesDialog, type MergeCandidate } from "./merge-dialog";
import { MoveCategoriesDialog, type MoveTarget } from "./move-dialog";

export interface AttributeActionsValue {
  storeId: string;
  /** URL pública de la tienda para «Ver en la tienda»; null cuando no está configurada. */
  storeUrl: string | null;
  /** Abre «Unir con…»: con un id, la fila elige destino; con varios, se elige cuál se queda. */
  openMerge: (kind: MergeableKind, sourceIds: string[]) => void;
  /** Abre «Mover a otra categoría» para subcategorías. */
  openMove: (ids: string[]) => void;
}

const AttributeActionsContext = createContext<AttributeActionsValue | null>(null);

/** Acciones del centro de Atributos; `null` cuando la columna se pinta fuera del centro. */
export function useAttributeActions(): AttributeActionsValue | null {
  return useContext(AttributeActionsContext);
}

interface AttributeActionsProviderProps {
  storeId: string;
  storeUrl: string | null;
  /** Filas activas por familia, para elegir el destino de una unión. */
  candidates: Record<MergeableKind, MergeCandidate[]>;
  /** Categorías activas, destino de «Mover a otra categoría». */
  types: MoveTarget[];
  onDone: () => void;
  children: ReactNode;
}

/** Provee «Unir con…» y «Mover…» a los menús de fila y a las acciones en lote, y pinta sus ventanas. */
export function AttributeActionsProvider({ storeId, storeUrl, candidates, types, onDone, children }: AttributeActionsProviderProps) {
  const [merge, setMerge] = useState<{ kind: MergeableKind; sourceIds: string[] } | null>(null);
  const [move, setMove] = useState<string[] | null>(null);

  return (
    <AttributeActionsContext.Provider
      value={{
        storeId,
        storeUrl,
        openMerge: (kind, sourceIds) => setMerge({ kind, sourceIds }),
        openMove: (ids) => setMove(ids),
      }}
    >
      {children}
      {merge && (
        <MergeAttributesDialog
          storeId={storeId}
          kind={merge.kind}
          selectedIds={merge.sourceIds}
          candidates={candidates[merge.kind]}
          open
          onOpenChange={(open) => !open && setMerge(null)}
          onDone={() => {
            setMerge(null);
            onDone();
          }}
        />
      )}
      {move && (
        <MoveCategoriesDialog
          storeId={storeId}
          ids={move}
          types={types}
          open
          onOpenChange={(open) => !open && setMove(null)}
          onDone={() => {
            setMove(null);
            onDone();
          }}
        />
      )}
    </AttributeActionsContext.Provider>
  );
}
