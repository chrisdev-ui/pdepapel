// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

type Fields = { website: string; formStartedAt?: number; turnstileToken?: string };

async function harness(siteKey: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", siteKey ?? "");
  const { BotChallengeSlot, BotTrapField, useBotTrap } = await import("@/components/bot-trap");
  const result: { fields?: () => Promise<Fields> } = {};
  function Form() {
    const trap = useBotTrap();
    result.fields = trap.fields;
    return (
      <form>
        <BotTrapField trap={trap} />
        <BotChallengeSlot trap={trap} />
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

  it("con clave, no carga nada al abrir: carga y muestra el desafío solo al enviar, y manda su token", async () => {
    const { result } = await harness("site-key");
    await act(async () => {});
    expect(document.head.querySelector("script[data-turnstile]")).toBeNull();

    const widget = { render: vi.fn(), execute: vi.fn(), reset: vi.fn() };
    let options: { callback: (token: string) => void } | null = null;
    widget.render.mockImplementation((_el: unknown, opts: typeof options) => {
      options = opts;
      queueMicrotask(() => options?.callback("tok-1"));
      return "widget-1";
    });
    widget.reset.mockImplementation(() => queueMicrotask(() => options?.callback("tok-2")));

    const pending = result.fields!();
    const script = document.head.querySelector("script[data-turnstile]") as HTMLScriptElement;
    expect(script.src).toContain("challenges.cloudflare.com/turnstile/v0/api.js");
    (window as { turnstile?: unknown }).turnstile = widget;
    script.dispatchEvent(new Event("load"));

    const fields = await pending;
    expect(widget.render).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ sitekey: "site-key" }));
    expect(fields.turnstileToken).toBe("tok-1");

    const again = await result.fields!();
    expect(widget.reset).toHaveBeenCalledWith("widget-1");
    expect(again.turnstileToken).toBe("tok-2");
  });
});
