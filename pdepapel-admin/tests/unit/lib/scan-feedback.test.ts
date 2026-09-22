import { describe, expect, it, vi } from "vitest";

import {
  SCAN_MUTE_STORAGE_KEY,
  SCAN_REJECT_TONE,
  SCAN_SUCCESS_TONE,
  playTone,
  readMutePreference,
  writeMutePreference,
  type ToneContext,
} from "@/lib/scan-feedback";

/** Un `AudioContext` de mentira que apunta lo que se le pidió. */
function fakeContext() {
  const gain = {
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  };
  const oscillator = {
    type: "sine" as OscillatorType,
    frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const context: ToneContext = {
    currentTime: 10,
    destination: "altavoz",
    createOscillator: () => oscillator,
    createGain: () => gain,
  };
  return { context, gain, oscillator };
}

describe("el tono del escáner", () => {
  it("aceptado y rechazado no suenan igual", () => {
    // Si coincidieran, el aviso no distinguiría la unidad que entró de la que
    // no, que es justo lo que se vino a arreglar.
    expect(SCAN_SUCCESS_TONE.frequency).toBeGreaterThan(SCAN_REJECT_TONE.frequency);
    expect(SCAN_REJECT_TONE.durationMs).toBeGreaterThan(SCAN_SUCCESS_TONE.durationMs);
  });

  it("es corto, como el de un lector de mano", () => {
    expect(SCAN_SUCCESS_TONE.durationMs).toBeGreaterThanOrEqual(80);
    expect(SCAN_SUCCESS_TONE.durationMs).toBeLessThanOrEqual(120);
  });

  it("suena a un volumen de mostrador, no de alarma", () => {
    for (const tone of [SCAN_SUCCESS_TONE, SCAN_REJECT_TONE]) {
      expect(tone.volume).toBeGreaterThan(0);
      expect(tone.volume).toBeLessThanOrEqual(0.25);
    }
  });

  it("conecta oscilador → ganancia → salida y programa el tono", () => {
    const { context, gain, oscillator } = fakeContext();
    playTone(context, SCAN_SUCCESS_TONE);

    expect(oscillator.type).toBe(SCAN_SUCCESS_TONE.type);
    expect(oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(SCAN_SUCCESS_TONE.frequency, 10);
    expect(oscillator.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith("altavoz");
    expect(oscillator.start).toHaveBeenCalledWith(10);
  });

  /**
   * Arrancar y cortar un oscilador en seco chasquea más fuerte que el propio
   * tono. La envolvente sube en rampa y cae en exponencial, y el oscilador se
   * para después del final, no justo encima.
   */
  it("lleva envolvente para no chasquear", () => {
    const { context, gain, oscillator } = fakeContext();
    playTone(context, SCAN_SUCCESS_TONE);

    const fin = 10 + SCAN_SUCCESS_TONE.durationMs / 1000;
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(SCAN_SUCCESS_TONE.volume, 10.008);
    // Nunca cero: `exponentialRamp` no lo admite y deja de sonar del todo.
    const [valorFinal] = gain.gain.exponentialRampToValueAtTime.mock.calls[0];
    expect(valorFinal).toBeGreaterThan(0);
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(valorFinal, fin);
    expect(oscillator.stop.mock.calls[0][0]).toBeGreaterThan(fin);
  });
});

describe("recordar el silencio", () => {
  const memoria = () => {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      raw: data,
    };
  };

  it("guarda y devuelve la preferencia", () => {
    const storage = memoria();
    expect(readMutePreference(storage)).toBe(false);
    writeMutePreference(storage, true);
    expect(storage.raw.get(SCAN_MUTE_STORAGE_KEY)).toBe("1");
    expect(readMutePreference(storage)).toBe(true);
    writeMutePreference(storage, false);
    expect(readMutePreference(storage)).toBe(false);
  });

  /**
   * En pestaña privada o con el almacenamiento bloqueado, `localStorage`
   * lanza al tocarlo. El escáner tiene que seguir sonando: quedarse mudo por
   * no poder leer una preferencia sería perder justo lo que se añadió.
   */
  it("un almacenamiento que revienta no deja al escáner mudo ni tumba la venta", () => {
    const roto = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    };
    expect(readMutePreference(roto)).toBe(false);
    expect(() => writeMutePreference(roto, true)).not.toThrow();
  });

  it("sin almacenamiento (servidor) tampoco falla", () => {
    expect(readMutePreference(null)).toBe(false);
    expect(() => writeMutePreference(undefined, true)).not.toThrow();
  });

  it("cualquier valor que no sea «1» es con sonido", () => {
    const storage = memoria();
    storage.raw.set(SCAN_MUTE_STORAGE_KEY, "true");
    expect(readMutePreference(storage)).toBe(false);
  });
});
