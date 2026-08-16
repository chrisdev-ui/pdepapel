// @vitest-environment jsdom

import { BarcodeScanner } from "@/components/ui/barcode-scanner";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
});
