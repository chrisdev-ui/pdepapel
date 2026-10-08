import { afterEach, describe, expect, it } from "vitest";

import { guardMutation, needsReloadPrompt, useVersionGuard } from "@/lib/version-guard";

afterEach(() => useVersionGuard.setState({ stale: false, acknowledged: false, prompt: null }));

describe("needsReloadPrompt", () => {
  it("solo pregunta antes de guardar, crear o borrar, y solo con una versión nueva sin aceptar", () => {
    const stale = { stale: true, acknowledged: false };
    expect(needsReloadPrompt("post", stale)).toBe(true);
    expect(needsReloadPrompt("PATCH", stale)).toBe(true);
    expect(needsReloadPrompt("put", stale)).toBe(true);
    expect(needsReloadPrompt("delete", stale)).toBe(true);
    expect(needsReloadPrompt("get", stale)).toBe(false);
    expect(needsReloadPrompt(undefined, stale)).toBe(false);
    expect(needsReloadPrompt("post", { stale: false, acknowledged: false })).toBe(false);
    expect(needsReloadPrompt("post", { stale: true, acknowledged: true })).toBe(false);
  });
});

describe("guardMutation", () => {
  it("sigue sin preguntar cuando la versión es la misma", async () => {
    await expect(guardMutation("post")).resolves.toBe("proceed");
  });

  it("con versión nueva pregunta; «Continuar» deja seguir y no vuelve a preguntar", async () => {
    useVersionGuard.setState({ stale: true });
    const pending = guardMutation("patch");
    expect(useVersionGuard.getState().prompt).not.toBeNull();
    useVersionGuard.getState().answer("continue");
    await expect(pending).resolves.toBe("proceed");
    await expect(guardMutation("post")).resolves.toBe("proceed");
    expect(useVersionGuard.getState().prompt).toBeNull();
  });

  it("«Recargar» detiene la acción", async () => {
    useVersionGuard.setState({ stale: true });
    const pending = guardMutation("delete");
    useVersionGuard.getState().answer("reload");
    await expect(pending).resolves.toBe("reload");
  });

  it("dos acciones a la vez esperan la misma respuesta", async () => {
    useVersionGuard.setState({ stale: true });
    const first = guardMutation("post");
    const second = guardMutation("patch");
    useVersionGuard.getState().answer("continue");
    await expect(Promise.all([first, second])).resolves.toEqual(["proceed", "proceed"]);
  });
});
