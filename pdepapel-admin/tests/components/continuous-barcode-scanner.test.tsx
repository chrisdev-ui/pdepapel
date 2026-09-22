// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ decodeFromStream: vi.fn() }));
vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    decodeFromStream = mocks.decodeFromStream;
  },
}));

import { ContinuousBarcodeScanner } from "@/components/ui/continuous-barcode-scanner";
import { resetScanFeedback } from "@/hooks/use-scan-feedback";

const QR = "PDP:fc555542-87dc-45db-8c0c-54ff366b0a51";

/**
 * El lector del celular vinculado. Lo que se prueba aquí es el flujo de Paula:
 * escanear la misma etiqueta varias veces seguidas para sumar unidades, como
 * con la pistola del supermercado. Antes había un bloqueo fijo de 2500 ms por
 * código, así que la segunda unidad tardaba dos segundos y medio y no había
 * ninguna señal de si había entrado.
 */
describe("ContinuousBarcodeScanner", () => {
  const getUserMedia = vi.fn();
  const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
  let leer: ((result: { getText: () => string } | null) => void) | null = null;

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    resetScanFeedback();
    window.localStorage.clear();
    leer = null;
    mocks.decodeFromStream.mockReset().mockImplementation((_s, _v, callback) => {
      leer = callback;
      return Promise.resolve({ stop: vi.fn() });
    });
    getUserMedia.mockReset().mockResolvedValue(stream);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function arrancar(onDetected: (code: string) => void) {
    render(<ContinuousBarcodeScanner onDetected={onDetected} />);
    await act(async () => void screen.getByText("Iniciar cámara").click());
    await waitFor(() => expect(leer).toBeTypeOf("function"));
  }

  /** Decodificar es lo que hace la cámara sola varias veces por segundo. */
  const decodificar = (code = QR) => act(() => leer?.({ getText: () => code }));
  const esperar = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

  it("la primera lectura entra", async () => {
    const onDetected = vi.fn();
    await arrancar(onDetected);
    decodificar();
    expect(onDetected).toHaveBeenCalledExactlyOnceWith(QR);
  });

  /**
   * El caso que obliga a tener un freno: la etiqueta quieta delante de la
   * cámara se decodifica sin parar. Sin freno, una sola etiqueta sumaría
   * decenas de unidades.
   */
  it("la etiqueta quieta en el encuadre no se repite sola", async () => {
    const onDetected = vi.fn();
    await arrancar(onDetected);
    for (let i = 0; i < 12; i += 1) {
      decodificar();
      esperar(60);
    }
    expect(onDetected).toHaveBeenCalledTimes(1);
  });

  /**
   * El caso de Paula: apartar la etiqueta y volver a ponerla es otra lectura
   * deliberada y entra al momento. La ausencia se nota porque la cámara deja
   * de decodificar ese código mientras no está en el encuadre.
   */
  it("apartar la etiqueta y volver a ponerla suma otra unidad enseguida", async () => {
    const onDetected = vi.fn();
    await arrancar(onDetected);

    decodificar();
    esperar(400); // fuera del encuadre: no se decodifica nada
    decodificar();
    esperar(400);
    decodificar();

    expect(onDetected).toHaveBeenCalledTimes(3);
    // Tres unidades en menos de un segundo, que antes eran cinco segundos.
    expect(onDetected).toHaveBeenNthCalledWith(3, QR);
  });

  it("sostenida sin apartarla, se repite solo al llegar al tope", async () => {
    const onDetected = vi.fn();
    await arrancar(onDetected);

    // Se ve sin interrupción: nunca hay hueco que cuente como otra
    // presentación, así que solo puede repetir por el tope de 900 ms.
    decodificar();
    for (let transcurrido = 0; transcurrido < 880; transcurrido += 80) {
      esperar(80);
      decodificar();
    }
    expect(onDetected).toHaveBeenCalledTimes(1);

    esperar(80);
    decodificar();
    expect(onDetected).toHaveBeenCalledTimes(2);
  });

  it("dos etiquetas distintas no se estorban", async () => {
    const onDetected = vi.fn();
    await arrancar(onDetected);
    decodificar("PDP:uno");
    decodificar("PDP:dos");
    expect(onDetected).toHaveBeenCalledTimes(2);
  });

  it("cada lectura aceptada avisa: suena, vibra y destella", async () => {
    const tonos: number[] = [];
    vi.stubGlobal(
      "AudioContext",
      class {
        currentTime = 0;
        destination = {};
        createGain() {
          return { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
        }
        createOscillator() {
          return { type: "", frequency: { setValueAtTime: (v: number) => tonos.push(v) }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
        }
      },
    );
    await arrancar(vi.fn());

    decodificar();
    expect(tonos).toHaveLength(1);
    expect(navigator.vibrate).toHaveBeenCalled();
    await waitFor(() => expect(document.querySelector('[data-scan-flash="success"]')).not.toBeNull());

    esperar(400);
    decodificar();
    // La repetición también avisa: sin esto, bajar el freno solo cambiaría un
    // fallo invisible por otro.
    expect(tonos).toHaveLength(2);
  });
});
