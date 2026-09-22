/**
 * El pitido del escáner: cómo suena, cuánto vibra y dónde se guarda el
 * silencio.
 *
 * Paula pidió «que suene como la pistola del supermercado»: sin confirmación
 * no hay forma de saber si una lectura entró, y menos cuando se escanea la
 * misma etiqueta varias veces para sumar unidades. El tono se sintetiza con
 * Web Audio (un oscilador y una envolvente) en vez de traer un archivo: no
 * añade peso, no depende de la red y no hay un `.mp3` que se quede sin cargar
 * justo en la feria.
 *
 * Módulo **neutro a propósito**: sin `"use client"`, sin React. Aquí viven la
 * forma del sonido y la regla del silencio —lo que se puede probar— y el
 * gancho de arriba solo pone el `AudioContext` de verdad.
 */

export interface ToneSpec {
  frequency: number;
  /** Duración audible; la parada del oscilador va un pelo después. */
  durationMs: number;
  type: OscillatorType;
  /** Pico de volumen, de 0 a 1. Bajo a propósito: es un mostrador, no una alarma. */
  volume: number;
}

/**
 * Aceptado: corto y agudo, como un lector de mano. Un seno en vez de una
 * cuadrada porque a este volumen la cuadrada raspa en el altavoz del celular.
 */
export const SCAN_SUCCESS_TONE: ToneSpec = { frequency: 1180, durationMs: 100, type: "sine", volume: 0.16 };

/**
 * Rechazado: más grave y más largo, para que se distinga de espaldas y sin
 * mirar. No es una alarma: el error ya se lee en pantalla.
 */
export const SCAN_REJECT_TONE: ToneSpec = { frequency: 300, durationMs: 220, type: "triangle", volume: 0.2 };

/** Lo que vibra el celular al aceptar. Un toque, no un zumbido. */
export const SCAN_SUCCESS_VIBRATION_MS = 30;

/** Cuánto dura el destello en pantalla. Se ve sin llegar a molestar. */
export const SCAN_FLASH_MS = 420;

export const SCAN_MUTE_STORAGE_KEY = "pdepapel:escaner:silencio";

/** Lo mínimo de `Storage` que se usa, para poder probar sin navegador. */
export interface MutePreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Lee el silencio guardado. Cualquier fallo responde «con sonido»: en pestaña
 * privada, con el almacenamiento bloqueado o con un valor corrupto, el
 * escáner tiene que seguir avisando, que es justo lo que se vino a arreglar.
 */
export function readMutePreference(storage: MutePreferenceStorage | null | undefined): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(SCAN_MUTE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Guarda el silencio. Si no se puede guardar, vale para esta sesión y ya. */
export function writeMutePreference(storage: MutePreferenceStorage | null | undefined, muted: boolean): void {
  if (!storage) return;
  try {
    storage.setItem(SCAN_MUTE_STORAGE_KEY, muted ? "1" : "0");
  } catch {
    // Sin almacenamiento: la preferencia vive solo en esta pestaña.
  }
}

/** Lo que se necesita de un `AudioContext`; así la prueba pasa uno de mentira. */
export interface ToneGainNode {
  gain: {
    setValueAtTime(value: number, when: number): void;
    linearRampToValueAtTime(value: number, when: number): void;
    exponentialRampToValueAtTime(value: number, when: number): void;
  };
  connect(destination: unknown): unknown;
}

export interface ToneOscillatorNode {
  type: OscillatorType;
  frequency: { setValueAtTime(value: number, when: number): void };
  connect(destination: ToneGainNode): unknown;
  start(when: number): void;
  stop(when: number): void;
}

export interface ToneContext {
  currentTime: number;
  destination: unknown;
  createOscillator(): ToneOscillatorNode;
  createGain(): ToneGainNode;
}

/**
 * Suelta un tono.
 *
 * La envolvente no es adorno: arrancar y cortar un oscilador en seco produce
 * un chasquido que se oye más que el propio tono. Sube en 8 ms y cae en
 * exponencial hasta casi cero, que es como suena un lector de verdad.
 */
export function playTone(context: ToneContext, spec: ToneSpec): void {
  const start = context.currentTime;
  const end = start + spec.durationMs / 1000;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = spec.type;
  oscillator.frequency.setValueAtTime(spec.frequency, start);
  // `exponentialRamp` no admite cero, de ahí el valor mínimo audible.
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(spec.volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  // Un pelo después del final de la envolvente: parar justo en el cero vuelve
  // a chasquear en algunos navegadores.
  oscillator.stop(end + 0.02);
}
