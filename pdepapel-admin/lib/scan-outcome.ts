/**
 * Cómo le cuenta una pantalla al lector si la lectura sirvió.
 *
 * El pitido tiene que decir la verdad: suena distinto cuando el producto entró
 * y cuando no. Quien consume un escaneo (la venta, la feria, cada pantalla con
 * botón de escanear) es el único que sabe cómo terminó, así que lo devuelve y
 * el lector se limita a sonar. Sin esto habría que adivinar desde el lector, y
 * adivinar aquí significa celebrar una unidad que nunca se agregó.
 *
 * Módulo **neutro a propósito**: sin `"use client"`, sin React, sin nada del
 * servidor. Lo leen a la vez componentes de cliente y el gancho del escáner
 * remoto; misma lección que `lib/scanned-code.ts`.
 */

export interface ScanOutcome {
  /** `true` si la lectura terminó en algo: se agregó, se eligió, se abrió. */
  ok: boolean;
  /** Cómo se llama lo que se resolvió, para decirlo en vez del código crudo. */
  label?: string | null;
}

/** Lo que puede devolver quien recibe un código: nada, o cómo le fue. */
export type ScanResult = void | ScanOutcome | Promise<void | ScanOutcome>;

export const scanAccepted = (label?: string | null): ScanOutcome => ({ ok: true, label: label ?? null });

export const scanRejected = (label?: string | null): ScanOutcome => ({ ok: false, label: label ?? null });

/**
 * Llama a la pantalla y normaliza cómo le fue.
 *
 * Recibe la llamada sin hacer, no su resultado: si recibiera el resultado, la
 * pantalla ya se habría ejecutado fuera de este `try` y un error síncrono
 * —una excepción antes del primer `await`— se escaparía. Eso tumbaría la
 * consulta del escáner remoto o el cierre de la cámara, y dejaría el lector
 * mudo justo cuando hay algo que avisar.
 *
 * Quien no informa nada se da por bueno: son las pantallas que ya enseñan el
 * resultado por su cuenta, y cambiarles la firma solo para que suenen sería
 * ruido.
 */
export async function settleScan(run: () => ScanResult): Promise<ScanOutcome> {
  try {
    const value = await run();
    return value ?? scanAccepted();
  } catch {
    return scanRejected();
  }
}
