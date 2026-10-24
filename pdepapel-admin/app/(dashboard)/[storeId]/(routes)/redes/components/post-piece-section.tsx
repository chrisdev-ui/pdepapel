"use client";

import axios from "axios";
import { Loader2 } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { formatPct, multiplierText } from "@/lib/social/display";
import type { SocialPieceSummary, SocialPostSummary } from "@/lib/social/report";
import { mergeTags, missingTags, NETWORK_NAME, tagCount } from "@/lib/social/tags";

const NUMBER = new Intl.NumberFormat("es-CO");
const DATE = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" });
const MAX_OPTIONS = 10;
const short = (caption: string | null) => (caption ? (caption.length > 50 ? `${caption.slice(0, 49)}…` : caption) : "Sin texto");

/** «La misma pieza en otras redes»: tabla lado a lado si ya está unida; si no, sugerencias y «Unir con…». */
export function PostPieceSection({ storeId, post, posts, pieces, onChanged }: { storeId: string; post: SocialPostSummary; posts: SocialPostSummary[]; pieces: SocialPieceSummary[]; onChanged: () => Promise<void> }) {
  const { toast } = useToast();
  const id = useId();
  const [busy, setBusy] = useState(false);
  // `busy` deshabilita el botón en el siguiente render; el ref corta en seco un segundo clic antes de eso.
  const inFlight = useRef(false);
  const piece = post.pieceId ? pieces.find((item) => item.id === post.pieceId) : undefined;
  const suggested = post.pieceSuggestions.map((suggestedId) => posts.find((item) => item.id === suggestedId)).filter((item): item is SocialPostSummary => Boolean(item));
  const options = posts
    .filter((item) => item.platform !== post.platform && !item.pieceId)
    .sort((a, b) => Math.abs(Date.parse(a.postedAt) - Date.parse(post.postedAt)) - Math.abs(Date.parse(b.postedAt) - Date.parse(post.postedAt)))
    .slice(0, MAX_OPTIONS);
  const [choice, setChoice] = useState("");

  const run = async (action: () => Promise<unknown>, done: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await action();
      await onChanged();
      toast({ title: done });
    } catch (error) {
      toast({ title: "No se pudo guardar la pieza", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  // Copiar etiquetas de la otra red: una sola vez, solo agrega; cada red se sigue editando por su lado.
  const copyFrom = piece
    ? piece.posts
        .filter((item) => item.id !== post.id)
        .map((item) => posts.find((candidate) => candidate.id === item.id))
        .filter((item): item is SocialPostSummary => Boolean(item))
        .map((other) => ({ other, missing: missingTags(post.tags, other.tags) }))
        .filter(({ missing }) => tagCount(missing) > 0)
    : [];
  const copyTags = async (other: SocialPostSummary) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await axios.put(`/api/${storeId}/social/posts/${post.id}/tags`, mergeTags(post.tags, other.tags));
      await onChanged();
      toast({ title: `Etiquetas copiadas de ${NETWORK_NAME[other.platform]}` });
    } catch (error) {
      toast({ title: "No se pudieron copiar las etiquetas", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const link = (otherPostId: string) => run(() => axios.post(`/api/${storeId}/social/posts/${post.id}/piece`, { otherPostId }), "Publicaciones unidas en una pieza");
  const unlink = () => run(() => axios.delete(`/api/${storeId}/social/posts/${post.id}/piece`), "Publicación separada de la pieza");

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3 rounded-lg border p-3">
      <h3 id={`${id}-title`} className="text-sm font-semibold text-primary">
        La misma pieza en otras redes
      </h3>
      {piece ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-left text-sm">
              <caption className="sr-only">Esta pieza en cada red</caption>
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="py-1 font-medium">Red</th>
                  <th scope="col" className="py-1 text-right font-medium">Vistas</th>
                  <th scope="col" className="py-1 text-right font-medium">× mediana</th>
                  <th scope="col" className="py-1 text-right font-medium">% visto</th>
                  <th scope="col" className="py-1 text-right font-medium">Salto 3 s</th>
                </tr>
              </thead>
              <tbody>
                {piece.posts.map((item) => (
                  <tr key={item.id} className="border-t">
                    <th scope="row" className="py-1.5 font-medium text-primary">
                      {NETWORK_NAME[item.platform]}
                      {item.id === post.id && <span className="text-xs font-normal text-muted-foreground"> · esta</span>}
                    </th>
                    <td className="py-1.5 text-right tabular-nums">{item.views == null ? "—" : NUMBER.format(item.views)}</td>
                    <td className="py-1.5 text-right tabular-nums">{multiplierText(item)}</td>
                    <td className="py-1.5 text-right tabular-nums">{item.watchedPct == null ? "—" : formatPct(item.watchedPct)}</td>
                    <td className="py-1.5 text-right tabular-nums">{item.skipRate == null ? "—" : formatPct(item.skipRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {copyFrom.map(({ other, missing }) => (
            <div key={other.id} className="flex flex-wrap items-center gap-2 rounded-md bg-muted p-2 text-sm">
              <p className="min-w-0 flex-1 text-muted-foreground">
                La de {NETWORK_NAME[other.platform]} tiene {tagCount(missing) === 1 ? "1 etiqueta" : `${tagCount(missing)} etiquetas`} que esta no: {[...missing.FORMATO, ...missing.GANCHO].join(", ")}.
              </p>
              <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => copyTags(other)}>
                Copiar etiquetas de {NETWORK_NAME[other.platform]}
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" className="h-11 self-start" disabled={busy} onClick={unlink}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Separar de la pieza
          </Button>
        </>
      ) : (
        <>
          {suggested.length > 0 ? (
            <ul className="flex flex-col gap-2" aria-label="Parece la misma pieza">
              {suggested.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted p-2 text-sm">
                  <span className="min-w-0">
                    <span className="text-xs text-muted-foreground">
                      Parece la misma · {NETWORK_NAME[item.platform]} · {DATE.format(new Date(item.postedAt))}
                    </span>
                    <span className="block truncate text-primary">{short(item.caption)}</span>
                  </span>
                  <Button type="button" className="h-11" disabled={busy} onClick={() => link(item.id)} aria-label={`Unir con la de ${NETWORK_NAME[item.platform]} del ${DATE.format(new Date(item.postedAt))}`}>
                    Unir
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No encontramos una publicación parecida en la otra red. Puedes unirla a mano.</p>
          )}
          {options.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <label htmlFor={`${id}-select`} className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-primary">
                Unir con…
                <select id={`${id}-select`} value={choice} onChange={(event) => setChoice(event.target.value)} className="h-11 min-w-0 rounded-md border bg-white px-2 text-sm">
                  <option value="">Elige una publicación de la otra red</option>
                  {options.map((item) => (
                    <option key={item.id} value={item.id}>
                      {NETWORK_NAME[item.platform]} · {DATE.format(new Date(item.postedAt))} · {short(item.caption)}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="button" variant="outline" className="h-11" disabled={busy || !choice} onClick={() => link(choice)}>
                Unir
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
