// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetScanFeedback, useScanFeedback } from "@/hooks/use-scan-feedback";
import { SCAN_MUTE_STORAGE_KEY, SCAN_SUCCESS_VIBRATION_MS } from "@/lib/scan-feedback";

const oscillators: { type: string; frequency: number; started: boolean }[] = [];

/** `AudioContext` de mentira: apunta cada tono que se habría oído. */
class FakeAudioContext {
  currentTime = 0;
  state = "running";
  destination = {};
  createGain() {
    return {
      gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
  }
  createOscillator() {
    const entry = { type: "", frequency: 0, started: false };
    oscillators.push(entry);
    return {
      set type(value: string) {
        entry.type = value;
      },
      get type() {
        return entry.type;
      },
      frequency: {
        setValueAtTime: (value: number) => {
          entry.frequency = value;
        },
      },
      connect: vi.fn(),
      start: () => {
        entry.started = true;
      },
      stop: vi.fn(),
    };
  }
}

function Harness() {
  const { playSuccess, playReject, flash, muted, toggleMuted } = useScanFeedback();
  return (
    <div>
      <span data-testid="flash">{flash ?? "ninguno"}</span>
      <span data-testid="muted">{String(muted)}</span>
      <button type="button" onClick={playSuccess}>
        aceptar
      </button>
      <button type="button" onClick={playReject}>
        rechazar
      </button>
      <button type="button" onClick={toggleMuted}>
        silenciar
      </button>
    </div>
  );
}

const pulsar = (nombre: string) => act(() => void screen.getByText(nombre).click());

describe("el aviso de una lectura", () => {
  const vibrate = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    oscillators.length = 0;
    resetScanFeedback();
    window.localStorage.clear();
    vibrate.mockReset();
    vi.stubGlobal("AudioContext", FakeAudioContext);
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("aceptar suena, vibra y destella", () => {
    render(<Harness />);
    pulsar("aceptar");

    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].started).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(SCAN_SUCCESS_VIBRATION_MS);
    expect(screen.getByTestId("flash")).toHaveTextContent("success");
  });

  /** El tono de rechazo es distinto y no vibra: el error ya se lee en pantalla. */
  it("rechazar suena distinto y no vibra", () => {
    render(<Harness />);
    pulsar("aceptar");
    pulsar("rechazar");

    expect(oscillators).toHaveLength(2);
    expect(oscillators[1].frequency).toBeLessThan(oscillators[0].frequency);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("flash")).toHaveTextContent("reject");
  });

  it("el destello se apaga solo", () => {
    render(<Harness />);
    pulsar("aceptar");
    expect(screen.getByTestId("flash")).toHaveTextContent("success");
    act(() => void vi.advanceTimersByTime(500));
    expect(screen.getByTestId("flash")).toHaveTextContent("ninguno");
  });

  it("en silencio no suena ni vibra, pero se sigue viendo", () => {
    render(<Harness />);
    pulsar("silenciar");
    pulsar("aceptar");
    pulsar("rechazar");

    expect(oscillators).toHaveLength(0);
    expect(vibrate).not.toHaveBeenCalled();
    // El destello es la confirmación de quien trabaja en silencio: apagarlo
    // también dejaría la lectura sin ninguna señal.
    expect(screen.getByTestId("flash")).toHaveTextContent("reject");
  });

  it("el silencio se recuerda entre pantallas", () => {
    const primera = render(<Harness />);
    pulsar("silenciar");
    expect(window.localStorage.getItem(SCAN_MUTE_STORAGE_KEY)).toBe("1");
    primera.unmount();

    resetScanFeedback();
    render(<Harness />);
    expect(screen.getByTestId("muted")).toHaveTextContent("true");
    pulsar("aceptar");
    expect(oscillators).toHaveLength(0);
  });

  /** Dos lectores en la misma página comparten silencio y destello. */
  it("todos los lectores de la página van a una", () => {
    render(
      <>
        <Harness />
        <Harness />
      </>,
    );
    act(() => void screen.getAllByText("silenciar")[0].click());
    for (const marca of screen.getAllByTestId("muted")) expect(marca).toHaveTextContent("true");
  });

  it("sin Web Audio ni vibración, la lectura sigue su curso", () => {
    vi.stubGlobal("AudioContext", undefined);
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: undefined });
    render(<Harness />);

    expect(() => pulsar("aceptar")).not.toThrow();
    // iOS no vibra desde la web y algunos navegadores no traen Web Audio: se
    // pierde el ruido, no la venta, y el destello sigue avisando.
    expect(screen.getByTestId("flash")).toHaveTextContent("success");
  });

  it("si el almacenamiento está bloqueado, arranca con sonido y no revienta", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    render(<Harness />);

    expect(screen.getByTestId("muted")).toHaveTextContent("false");
    expect(() => pulsar("silenciar")).not.toThrow();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
