// @vitest-environment jsdom

import { BarcodeScanner } from "@/components/ui/barcode-scanner";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getRemoteScannerController, resetRemoteScannerControllers } from "@/hooks/use-remote-scanner";
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

  it("cancels the delayed close when the scanner unmounts right after a read", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<BarcodeScanner onDetected={() => undefined} />);

    await user.click(screen.getByRole("button", { name: "Escanear" }));
    await waitFor(() => expect(mocks.decodeFromStream).toHaveBeenCalled());
    const onResult = mocks.decodeFromStream.mock.calls[0][2] as (result: { getText: () => string }) => void;
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    act(() => onResult({ getText: () => "PDP:product-1" }));
    const closeTimer = setTimeoutSpy.mock.results.find((_, index) => setTimeoutSpy.mock.calls[index][1] === 350)?.value;
    expect(closeTimer).toBeDefined();
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(closeTimer);
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
  /**
   * Issue #2: con varias líneas, cada una con su lector, la etiqueta larga se
   * pintaba como texto y el sonido y el celular se repetían por línea. Estas
   * opciones separan el nombre accesible del texto visible y reparten los
   * botones entre una instancia por línea (`camera`) y una por pantalla
   * (`secondary`). Sin ellas, el lector se ve igual que antes.
   */
  describe("iconOnly y controls", () => {
    afterEach(() => resetRemoteScannerControllers());

    it("by default keeps the camera text, the sound toggle and, with a store, the linked phone", () => {
      render(<BarcodeScanner onDetected={() => undefined} storeId="store-1" />);
      expect(screen.getByRole("button", { name: "Escanear" })).toHaveTextContent("Escanear");
      expect(screen.getByRole("button", { name: /sonido al escanear/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Usar el celular como escáner" })).toBeInTheDocument();
    });

    it("iconOnly keeps the label as the accessible name and tooltip, never as visible text", () => {
      render(<BarcodeScanner onDetected={() => undefined} label="Escanear producto de la línea 3" iconOnly compact />);
      const button = screen.getByRole("button", { name: "Escanear producto de la línea 3" });
      expect(button.textContent?.trim()).toBe("");
      expect(button).toHaveAttribute("title", "Escanear producto de la línea 3");
      expect(screen.queryByText("Escanear producto de la línea 3")).toBeNull();
    });

    it("controls=camera paints only the camera and does not take the linked phone's reads", () => {
      render(<BarcodeScanner onDetected={() => undefined} storeId="store-1" controls="camera" />);
      expect(screen.getByRole("button", { name: "Escanear" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /sonido al escanear/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /celular/i })).toBeNull();
      expect(getRemoteScannerController("store-1").getState().activeTargetId).toBeNull();
    });

    it("controls=secondary paints only the sound and linked-phone toggles and receives the phone's reads", () => {
      render(<BarcodeScanner onDetected={() => undefined} storeId="store-1" controls="secondary" />);
      expect(screen.queryByRole("button", { name: "Escanear" })).toBeNull();
      expect(screen.getByRole("button", { name: /sonido al escanear/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Usar el celular como escáner" })).toBeInTheDocument();
      expect(getRemoteScannerController("store-1").getState().activeTargetId).not.toBeNull();
    });
  });
});
