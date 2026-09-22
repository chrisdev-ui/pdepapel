// @vitest-environment jsdom

import { BarcodeScanner } from "@/components/ui/barcode-scanner";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetScanFeedback } from "@/hooks/use-scan-feedback";
import { SCAN_REJECT_TONE, SCAN_SUCCESS_TONE } from "@/lib/scan-feedback";
import { scanAccepted, scanRejected } from "@/lib/scan-outcome";

const mocks = vi.hoisted(() => ({
  decodeFromStream: vi.fn(),
}));

vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    decodeFromStream = mocks.decodeFromStream;
  },
}));

describe("BarcodeScanner", () => {
  const stopTrack = vi.fn();
  const scannerControls = { stop: vi.fn() };
  const cameraStream = {
    getTracks: () => [{ stop: stopTrack }],
  } as unknown as MediaStream;
  const getUserMedia = vi.fn();

  beforeEach(() => {
    mocks.decodeFromStream.mockReset();
    mocks.decodeFromStream.mockResolvedValue(scannerControls);
    getUserMedia.mockReset();
    getUserMedia.mockResolvedValue(cameraStream);
    stopTrack.mockReset();
    scannerControls.stop.mockReset();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("requests the camera from the scan action and starts after the video mounts", async () => {
    const user = userEvent.setup();
    render(<BarcodeScanner onDetected={() => undefined} />);

    await user.click(screen.getByRole("button", { name: "Escanear" }));

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    await waitFor(() => {
      expect(mocks.decodeFromStream).toHaveBeenCalledWith(
        cameraStream,
        expect.any(HTMLVideoElement),
        expect.any(Function),
      );
    });
  });

  it("uses a detected QR only once and releases the camera", async () => {
    const onDetected = vi.fn();
    const user = userEvent.setup();
    render(<BarcodeScanner onDetected={onDetected} />);

    await user.click(screen.getByRole("button", { name: "Escanear" }));
    await waitFor(() => expect(mocks.decodeFromStream).toHaveBeenCalled());
    const onResult = mocks.decodeFromStream.mock.calls[0][2] as (
      result: { getText: () => string } | undefined,
    ) => void;

    onResult({ getText: () => "  PDP:product-1  " });
    onResult({ getText: () => "PDP:product-1" });

    expect(onDetected).toHaveBeenCalledTimes(1);
    expect(onDetected).toHaveBeenCalledWith("PDP:product-1");
    expect(stopTrack).toHaveBeenCalled();
  });

  it("shows a clear permission error instead of an empty scanner", async () => {
    const user = userEvent.setup();
    getUserMedia.mockRejectedValue(
      new DOMException("Denied", "NotAllowedError"),
    );
    render(<BarcodeScanner onDetected={() => undefined} />);

    await user.click(screen.getByRole("button", { name: "Escanear" }));

    expect(
      await screen.findByText(/Permite el uso de la cámara en los permisos/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Intentar de nuevo" }),
    ).toBeVisible();
  });

  /**
   * El lector es el único sitio donde suena el panel: la cámara local y el
   * celular vinculado pasan los dos por aquí, así que el aviso se escribe una
   * vez y vale para las once pantallas con lector. Suena después de saber cómo
   * terminó la lectura, no al leerla.
   */
  describe("el aviso de la lectura", () => {
    const tonos: number[] = [];

    beforeEach(() => {
      tonos.length = 0;
      resetScanFeedback();
      window.localStorage.clear();
      Object.defineProperty(navigator, "vibrate", { configurable: true, value: vi.fn() });
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
    });
    afterEach(() => vi.unstubAllGlobals());

    async function leer(onDetected: (code: string) => unknown) {
      const user = userEvent.setup();
      render(<BarcodeScanner onDetected={onDetected as never} />);
      await user.click(screen.getByRole("button", { name: "Escanear" }));
      await waitFor(() => expect(mocks.decodeFromStream).toHaveBeenCalled());
      const callback = mocks.decodeFromStream.mock.calls[0][2];
      await act(async () => callback({ getText: () => "PDP:p-1" }));
    }

    it("aceptada suena agudo", async () => {
      await leer(() => scanAccepted("Guillotina"));
      await waitFor(() => expect(tonos).toEqual([SCAN_SUCCESS_TONE.frequency]));
    });

    /** Un código que no resuelve: el tono grave, que se distingue sin mirar. */
    it("rechazada suena grave", async () => {
      await leer(() => scanRejected());
      await waitFor(() => expect(tonos).toEqual([SCAN_REJECT_TONE.frequency]));
    });

    it("la pantalla que no contesta nada se da por buena", async () => {
      await leer(() => undefined);
      await waitFor(() => expect(tonos).toEqual([SCAN_SUCCESS_TONE.frequency]));
    });

    /** Un fallo de la pantalla no puede dejar el lector mudo ni tumbar la página. */
    it("si la pantalla revienta, suena a rechazo", async () => {
      await leer(() => {
        throw new Error("sin red");
      });
      await waitFor(() => expect(tonos).toEqual([SCAN_REJECT_TONE.frequency]));
    });

    it("el botón de silencio apaga el tono y se recuerda", async () => {
      const user = userEvent.setup();
      render(<BarcodeScanner onDetected={() => scanAccepted()} />);
      await user.click(screen.getByRole("button", { name: "Silenciar el sonido al escanear" }));
      // El botón cambia de sentido en el sitio, sin abrir nada.
      expect(screen.getByRole("button", { name: "Activar el sonido al escanear" })).toHaveAttribute("aria-pressed", "true");

      await user.click(screen.getByRole("button", { name: "Escanear" }));
      await waitFor(() => expect(mocks.decodeFromStream).toHaveBeenCalled());
      const callback = mocks.decodeFromStream.mock.calls[0][2];
      await act(async () => callback({ getText: () => "PDP:p-1" }));

      expect(tonos).toEqual([]);
    });
  });
});
