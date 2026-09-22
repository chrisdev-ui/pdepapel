"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  SCAN_FLASH_MS,
  SCAN_REJECT_TONE,
  SCAN_SUCCESS_TONE,
  SCAN_SUCCESS_VIBRATION_MS,
  playTone,
  readMutePreference,
  writeMutePreference,
  type ToneContext,
  type ToneSpec,
} from "@/lib/scan-feedback";

export type ScanFlash = "success" | "reject" | null;

/**
 * El aviso de una lectura, compartido por toda la pestaña.
 *
 * Un solo `AudioContext` y un solo estado de silencio: si cada botón de
 * escanear creara el suyo, el navegador acabaría cortando el audio (hay un
 * tope de contextos por página) y el silencio se desincronizaría entre
 * pantallas. El destello también es global a propósito: cada pantalla monta
 * un solo lector, así que quien lo pinte es quien lo enseña.
 */
let context: ToneContext | null = null;
let contextBroken = false;
let muted: boolean | null = null;
let flash: ScanFlash = null;
let flashTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

const storage = () => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Almacenamiento bloqueado: se vive sin recordar la preferencia.
    return null;
  }
};

function isMuted(): boolean {
  if (muted === null) muted = readMutePreference(storage());
  return muted;
}

function setMuted(next: boolean) {
  muted = next;
  writeMutePreference(storage(), next);
  notify();
}

/**
 * El contexto se crea en la primera lectura, no al montar: los navegadores
 * exigen un gesto de la persona antes de dejar sonar, y para entonces ya
 * hubo uno (abrir la cámara, vincular el celular, escribir en la casilla).
 * Si el navegador no tiene Web Audio, se apunta y no se vuelve a intentar.
 */
function toneContext(): ToneContext | null {
  if (context || contextBroken) return context;
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    contextBroken = true;
    return null;
  }
  try {
    context = new Ctor() as unknown as ToneContext;
    return context;
  } catch {
    contextBroken = true;
    return null;
  }
}

function sound(spec: ToneSpec) {
  if (isMuted()) return;
  const ctx = toneContext();
  if (!ctx) return;
  try {
    // Safari suspende el contexto al perder el foco; reanudarlo es barato.
    const suspended = (ctx as unknown as { state?: string; resume?: () => Promise<void> }).state === "suspended";
    if (suspended) void (ctx as unknown as { resume: () => Promise<void> }).resume().catch(() => undefined);
    playTone(ctx, spec);
  } catch {
    // Un tono perdido no puede tumbar una venta.
  }
}

function buzz() {
  if (isMuted()) return;
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(SCAN_SUCCESS_VIBRATION_MS);
  } catch {
    // iOS no vibra desde la web; no es un error, es que no existe.
  }
}

function showFlash(kind: Exclude<ScanFlash, null>) {
  flash = kind;
  notify();
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flash = null;
    flashTimer = null;
    notify();
  }, SCAN_FLASH_MS);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Solo para pruebas: olvida contexto, silencio y destello. */
export function resetScanFeedback() {
  context = null;
  contextBroken = false;
  muted = null;
  flash = null;
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = null;
  listeners.clear();
}

/**
 * Sonido, vibración y destello de una lectura.
 *
 * `playSuccess` se llama cuando la lectura terminó en algo (se agregó, se
 * eligió); `playReject`, cuando no. El destello se enseña aunque esté en
 * silencio: silenciar apaga el ruido, no la confirmación.
 */
export function useScanFeedback() {
  const flashNow = useSyncExternalStore(
    subscribe,
    () => flash,
    () => null,
  );
  const mutedNow = useSyncExternalStore(
    subscribe,
    () => isMuted(),
    () => false,
  );

  const playSuccess = useCallback(() => {
    sound(SCAN_SUCCESS_TONE);
    buzz();
    showFlash("success");
  }, []);

  const playReject = useCallback(() => {
    sound(SCAN_REJECT_TONE);
    showFlash("reject");
  }, []);

  return {
    playSuccess,
    playReject,
    flash: flashNow,
    muted: mutedNow,
    setMuted: useCallback((next: boolean) => setMuted(next), []),
    toggleMuted: useCallback(() => setMuted(!isMuted()), []),
  };
}
