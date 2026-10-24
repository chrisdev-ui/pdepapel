"use client";

import axios from "axios";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import type { SocialPostSummary } from "@/lib/social/report";

/** Duración a mano de un reel cuyo video Instagram no entrega (audio con derechos): con ella sale el % visto. */
export function PostDurationField({ storeId, post, onChanged }: { storeId: string; post: SocialPostSummary; onChanged: () => Promise<void> }) {
  const { toast } = useToast();
  const id = useId();
  const [value, setValue] = useState(post.durationManualSec == null ? "" : String(post.durationManualSec));
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const save = async (seconds: number | null) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await axios.put(`/api/${storeId}/social/posts/${post.id}/duration`, { seconds });
      await onChanged();
      toast({ title: seconds === null ? "Duración borrada" : "Duración guardada" });
      if (seconds === null) setValue("");
    } catch (error) {
      toast({ title: "No se pudo guardar la duración", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const parsed = Number(value.replace(",", "."));
  const valid = value.trim() !== "" && Number.isFinite(parsed) && parsed >= 1 && parsed <= 3600;

  return (
    <form
      className="flex flex-col gap-2 rounded-lg border p-3 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) void save(parsed);
      }}
    >
      <label htmlFor={`${id}-seconds`} className="font-semibold text-primary">
        Duración (s)
      </label>
      <p id={`${id}-hint`} className="text-muted-foreground">
        Instagram no entrega este video (audio con derechos), así que no sabemos cuánto dura. Escríbela para ver el % visto.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={`${id}-seconds`}
          aria-describedby={`${id}-hint`}
          inputMode="decimal"
          className="h-11 w-28"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button type="submit" className="min-h-[44px]" disabled={busy || !valid}>
          Guardar duración
        </Button>
        {post.durationManualSec != null && (
          <Button type="button" variant="ghost" className="min-h-[44px]" disabled={busy} onClick={() => save(null)}>
            Borrar
          </Button>
        )}
      </div>
    </form>
  );
}
