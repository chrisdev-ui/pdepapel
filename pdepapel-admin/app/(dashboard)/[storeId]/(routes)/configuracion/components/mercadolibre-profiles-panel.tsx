"use client";

import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { parseCategoryCandidates } from "@/lib/mercadolibre/category-profiles";

type Profile = {
  id: string;
  name: string;
  categoryId: string;
  origin?: string;
  state?: string;
  stockSafetyBuffer: number;
  candidates?: unknown;
  localCategory: { id: string; name: string };
};

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? "No fue posible completar la acción";
  } catch {
    return "No fue posible completar la acción";
  }
}

const pill = "rounded-full px-2 py-0.5 text-[11px] font-medium text-foreground";

/**
 * Categorías de Mercado Libre por subcategoría (#22). Las aprendidas de
 * publicaciones anteriores llegan «sugeridas»; «Usar esta» las acepta y
 * desde ahí el asistente las aplica solo.
 */
export function MercadoLibreProfilesPanel({ storeId }: { storeId: string }) {
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/${storeId}/marketplaces/mercadolibre/profiles`;

  const load = useCallback(async () => {
    try {
      const response = await fetch(base);
      if (!response.ok) throw new Error(await readError(response));
      setProfiles((await response.json()) as Profile[]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No fue posible cargar los perfiles");
      setProfiles([]);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const accept = async (profile: Profile, categoryId: string) => {
    setBusy(`${profile.id}:${categoryId}`);
    setError(null);
    try {
      const response = await fetch(`${base}/${encodeURIComponent(profile.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const updated = (await response.json()) as Profile;
      setProfiles((current) => current?.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)) ?? null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No fue posible guardar la categoría");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (profile: Profile) => {
    if (
      !(await requestConfirmation({
        title: `¿Quitar la categoría de ${profile.localCategory.name}?`,
        description: "El asistente dejará de proponerla. Las publicaciones existentes no cambian.",
        confirmLabel: "Quitar",
      }))
    ) {
      return;
    }
    setBusy(`${profile.id}:delete`);
    setError(null);
    try {
      const response = await fetch(`${base}/${encodeURIComponent(profile.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await readError(response));
      setProfiles((current) => current?.filter((item) => item.id !== profile.id) ?? null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No fue posible quitar la categoría");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl border bg-white p-4" aria-labelledby="mercadolibre-profiles-title">
      <h2 id="mercadolibre-profiles-title" className="mb-1 text-base font-semibold text-primary">
        Categorías de Mercado Libre por subcategoría
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Al publicar, el asistente propone la categoría que ya se usó en la subcategoría del producto. Las
        aprendidas llegan sugeridas: «Usar esta» las acepta y desde ahí se aplican solas.
      </p>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {profiles === null ? <p className="text-sm text-muted-foreground">Cargando…</p> : null}
      {profiles?.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay ninguna. Se crean solas al publicar o al guardar un perfil rápido en el asistente.
        </p>
      ) : null}
      <ul className="grid gap-3">
        {profiles?.map((profile) => {
          const candidates = parseCategoryCandidates(profile.candidates);
          const options = candidates.length
            ? candidates
            : [{ categoryId: profile.categoryId, categoryName: null, uses: 0, lastUsedAt: "" }];
          const suggested = profile.state === "SUGGESTED";
          return (
            <li key={profile.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <h3 className="break-words font-medium">{profile.localCategory.name}</h3>
                  <div className="flex flex-wrap gap-1">
                    <span className={`${pill} ${profile.origin === "LEARNED" ? "bg-tint-mint" : "bg-tint-lavender"}`}>
                      {profile.origin === "LEARNED" ? "Aprendido" : "Manual"}
                    </span>
                    <span className={`${pill} ${suggested ? "bg-tint-cream" : "bg-tint-mint"}`}>
                      {suggested ? "Sugerida" : "Aceptada"}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  aria-label={`Quitar la categoría de ${profile.localCategory.name}`}
                  disabled={busy !== null}
                  onClick={() => void remove(profile)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
              <ul className="mt-2 grid gap-1">
                {options.map((candidate) => {
                  const current = candidate.categoryId === profile.categoryId;
                  const label = candidate.categoryName ?? candidate.categoryId;
                  return (
                    <li
                      key={candidate.categoryId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="block break-words">{label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {candidate.categoryId}
                          {candidate.uses > 0
                            ? ` · ${candidate.uses} ${candidate.uses === 1 ? "publicación" : "publicaciones"}`
                            : ""}
                        </span>
                      </span>
                      {current && !suggested ? (
                        <span className="text-xs font-medium text-success">En uso</span>
                      ) : (
                        <Button
                          type="button"
                          size="xs"
                          aria-label={`Usar esta: ${label}`}
                          isLoading={busy === `${profile.id}:${candidate.categoryId}`}
                          disabled={busy !== null}
                          onClick={() => void accept(profile, candidate.categoryId)}
                        >
                          Usar esta
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
      {confirmationDialog}
    </section>
  );
}
