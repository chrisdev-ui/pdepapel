"use client";

import axios from "axios";
import { CheckCircle2, Loader2, Smartphone } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { ContinuousBarcodeScanner } from "@/components/ui/continuous-barcode-scanner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TintBadge } from "@/components/ui/tint-badge";
import { getErrorMessage } from "@/lib/api-errors";
import { isValidPairingCode, normalizePairingCode, PROBLEM_MESSAGES, relativeTime, type ScanProblem } from "@/lib/scanner-pairing";

interface RemoteScannerPhoneProps {
  storeId: string;
  initialCode: string;
}

type Phase = "enter" | "pairing" | "scanning" | "gone";

interface SentScan {
  id: string;
  code: string;
  at: string;
  ok: boolean;
}

function problemFromError(error: unknown): ScanProblem | null {
  if (!axios.isAxiosError(error)) return null;
  const code = (error.response?.data as { details?: { code?: string } } | undefined)?.details?.code;
  return code && code in PROBLEM_MESSAGES ? (code as ScanProblem) : null;
}

/**
 * La página del celular: escribe o trae el código del QR, se vincula con la
 * misma sesión del panel y desde ahí cada lectura viaja a la pantalla. El
 * celular solo envía el código; la pantalla busca el producto.
 */
export function RemoteScannerPhone({ storeId, initialCode }: RemoteScannerPhoneProps) {
  const [code, setCode] = useState(initialCode);
  const [phase, setPhase] = useState<Phase>("enter");
  const [token, setToken] = useState<string | null>(null);
  const [device, setDevice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [sent, setSent] = useState<SentScan[]>([]);

  const pair = useCallback(async () => {
    const normalized = normalizePairingCode(code);
    if (!isValidPairingCode(normalized)) {
      setError("El código tiene 6 letras y números, como aparece en la pantalla.");
      return;
    }
    setError(null);
    setPhase("pairing");
    try {
      const response = await axios.post(`/api/${storeId}/scanner-sessions/${normalized}/pair`);
      setToken(response.data.token as string);
      setDevice((response.data.deviceLabel as string | null) ?? null);
      setCode(normalized);
      setPhase("scanning");
    } catch (pairError) {
      const problem = problemFromError(pairError);
      setError(problem ? PROBLEM_MESSAGES[problem] : getErrorMessage(pairError));
      setPhase("enter");
    }
  }, [code, storeId]);

  const send = useCallback(
    async (scanned: string) => {
      if (!token) return;
      const entry: SentScan = { id: `${Date.now()}-${scanned}`, code: scanned, at: new Date().toISOString(), ok: true };
      setSent((current) => [entry, ...current].slice(0, 20));
      try {
        await axios.post(`/api/${storeId}/scanner-sessions/${code}/scans`, { token, code: scanned });
      } catch (sendError) {
        const problem = problemFromError(sendError);
        if (problem) {
          setGone(PROBLEM_MESSAGES[problem]);
          setPhase("gone");
          return;
        }
        setSent((current) => current.map((item) => (item.id === entry.id ? { ...item, ok: false } : item)));
        setError(getErrorMessage(sendError));
      }
    },
    [code, storeId, token],
  );

  async function unlink() {
    setPhase("gone");
    setGone("Desvinculaste este celular.");
    try {
      await axios.delete(`/api/${storeId}/scanner-sessions/${code}`);
    } catch {
      // La pantalla verá la sesión vencer sola.
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
      <header className="flex items-center gap-2">
        <Smartphone className="h-5 w-5 text-primary" aria-hidden="true" />
        <h1 className="text-xl font-bold text-primary">Escáner del celular</h1>
      </header>

      {phase === "enter" || phase === "pairing" ? (
        <section className="flex flex-col gap-3 rounded-2xl border bg-white p-4" data-phase={phase}>
          <h2 className="text-lg font-semibold text-primary">Vincular con la pantalla</h2>
          <p className="text-sm text-muted-foreground">
            El código viene en el enlace del QR. Si entraste a mano, escríbelo tal como aparece en la pantalla. Se vincula con tu usuario del panel; solo un celular a la vez.
          </p>
          <div className="grid gap-2">
            <Label htmlFor="pairing-code">Código de vinculación</Label>
            <Input
              id="pairing-code"
              value={code}
              onChange={(event) => setCode(normalizePairingCode(event.target.value))}
              placeholder="ABC 123"
              autoComplete="off"
              autoCapitalize="characters"
              inputMode="text"
              className="h-12 text-center font-mono text-xl tracking-[0.2em]"
              maxLength={6}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="button" size="lg" className="w-full" onClick={() => void pair()} disabled={phase === "pairing" || code.length < 6}>
            {phase === "pairing" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Vinculando…
              </>
            ) : (
              "Vincular este celular"
            )}
          </Button>
        </section>
      ) : null}

      {phase === "scanning" && (
        <section className="flex flex-col gap-3 rounded-2xl border bg-white p-4" data-phase="scanning">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-primary">Escáner</h2>
            <TintBadge tone="mint" label={`Vinculado · ${device ?? "este celular"}`} />
          </div>
          <ContinuousBarcodeScanner onDetected={(scanned) => void send(scanned)} />
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Enviado a la pantalla</span>
            {sent.length === 0 ? (
              <p className="text-xs text-muted-foreground">Todavía nada. Encuadra un código de barras o un QR de etiqueta.</p>
            ) : (
              <ul className="flex flex-col gap-2" aria-label="Lecturas enviadas">
                {sent.slice(0, 5).map((item, index) => (
                  <li key={item.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${index > 0 ? "opacity-70" : ""}`}>
                    <CheckCircle2 className={`h-4 w-4 shrink-0 ${item.ok ? "text-green-700" : "text-destructive"}`} aria-hidden="true" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-mono text-xs">{item.code}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.ok ? relativeTime(item.at) : "No se pudo enviar"} · {sent.length} {sent.length === 1 ? "lectura" : "lecturas"} en esta sesión
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-muted-foreground">El celular solo envía el código; la pantalla busca el producto. Si no lo encuentra, lo verás allá, no aquí.</p>
          <Button type="button" variant="outline" size="lg" className="w-full border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100" onClick={() => void unlink()}>
            Desvincular
          </Button>
        </section>
      )}

      {phase === "gone" && (
        <section className="flex flex-col gap-3 rounded-2xl border bg-white p-4" data-phase="gone">
          <h2 className="text-lg font-semibold text-primary">Esta vinculación ya no sirve</h2>
          <TintBadge tone="cream" label={gone ?? "Vencida"} className="self-start whitespace-normal" />
          <p className="text-sm text-muted-foreground">Vuelve a la pantalla, pulsa «Usar el celular como escáner» y apunta al código nuevo.</p>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => {
              setPhase("enter");
              setToken(null);
              setSent([]);
              setError(null);
            }}
          >
            Escribir otro código
          </Button>
        </section>
      )}
    </main>
  );
}
