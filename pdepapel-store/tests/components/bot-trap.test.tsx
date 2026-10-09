// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

type Fields = { website: string; formStartedAt?: number; turnstileToken?: string };

async function harness(siteKey: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", siteKey ?? "");
  const { BotTrapField, useBotTrap } = await import("@/components/bot-trap");
  const result: { fields?: () => Promise<Fields> } = {};
  function Form() {
    const trap = useBotTrap();
    result.fields = trap.fields;
    return (
      <form>
        <BotTrapField trap={trap} />
      </form>
    );
  }
  const view = render(<Form />);
  return { ...view, result };
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete (window as { turnstile?: unknown }).turnstile;
  document.head.querySelectorAll("script[data-turnstile]").forEach((node) => node.remove());
});

describe("trampa y desafío del formulario", () => {
  it("sin clave de Turnstile no carga nada y manda solo la trampa y el reloj", async () => {
    const { result } = await harness(undefined);
    await act(async () => {});
    const fields = await result.fields!();
    expect(fields).toEqual({ website: "", formStartedAt: expect.any(Number) });
    expect(document.head.querySelector("script[data-turnstile]")).toBeNull();
  });

  it("con clave, ejecuta el desafío al enviar y manda su token", async () => {
    const widget = { render: vi.fn(), execute: vi.fn(), reset: vi.fn() };
    let options: { callback: (token: string) => void } | null = null;
    widget.render.mockImplementation((_el: unknown, opts: typeof options) => {
      options = opts;
      return "widget-1";
    });
    widget.execute.mockImplementation(() => options?.callback("tok-ok"));
    (window as { turnstile?: unknown }).turnstile = widget;

    const { result } = await harness("site-key");
    await act(async () => {});
    expect(widget.render).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ sitekey: "site-key", execution: "execute", appearance: "interaction-only" }));
    expect(widget.execute).not.toHaveBeenCalled();

    const fields = await result.fields!();
    expect(widget.execute).toHaveBeenCalledWith("widget-1");
    expect(fields.turnstileToken).toBe("tok-ok");
  });
});
