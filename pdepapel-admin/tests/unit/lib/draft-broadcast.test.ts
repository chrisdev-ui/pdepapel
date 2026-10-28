// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { announceDraftSaved, createDraftBroadcast, onDraftSaved } from "@/lib/draft-broadcast";

const KEY = "product-group-form-s1-grupo-a";
const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("aviso entre pestañas de un borrador guardado", () => {
  const unsubscribers: Array<() => void> = [];
  afterEach(() => unsubscribers.splice(0).forEach((stop) => stop()));

  it("la pestaña que guarda no se avisa a sí misma (el falso «se guardó en otra pestaña»)", async () => {
    const mine = vi.fn();
    unsubscribers.push(onDraftSaved(KEY, mine));
    announceDraftSaved(KEY, "grupo-a");
    await flush();
    expect(mine).not.toHaveBeenCalled();
  });

  it("otra pestaña con la misma llave sí recibe el aviso, con el id guardado", async () => {
    const tabA = createDraftBroadcast("pestana-a");
    const tabB = createDraftBroadcast("pestana-b");
    const heardInB = vi.fn();
    const heardInA = vi.fn();
    unsubscribers.push(tabB.onDraftSaved(KEY, heardInB), tabA.onDraftSaved(KEY, heardInA));
    tabA.announceDraftSaved(KEY, "grupo-a");
    await vi.waitFor(() => expect(heardInB).toHaveBeenCalledWith(expect.objectContaining({ key: KEY, savedId: "grupo-a", from: "pestana-a" })));
    await flush();
    expect(heardInA).not.toHaveBeenCalled();
  });

  it("guardar el grupo A no toca el borrador del grupo B en otra pestaña", async () => {
    const tabA = createDraftBroadcast("pestana-a");
    const tabB = createDraftBroadcast("pestana-b");
    const groupB = vi.fn();
    unsubscribers.push(tabB.onDraftSaved("product-group-form-s1-grupo-b", groupB));
    tabA.announceDraftSaved(KEY, "grupo-a");
    await flush();
    expect(groupB).not.toHaveBeenCalled();
  });

  it("sin BroadcastChannel (evento storage) también ignora lo propio y avisa a la otra", () => {
    const original = globalThis.BroadcastChannel;
    // @ts-expect-error se simula un navegador sin BroadcastChannel
    delete globalThis.BroadcastChannel;
    try {
      const tabB = createDraftBroadcast("pestana-b");
      const heard = vi.fn();
      unsubscribers.push(tabB.onDraftSaved(KEY, heard));
      const fire = (from: string) =>
        window.dispatchEvent(new StorageEvent("storage", { key: "pdepapel:draft-saved", newValue: JSON.stringify({ key: KEY, savedId: "g", at: 1, from }) }));
      fire("pestana-b");
      expect(heard).not.toHaveBeenCalled();
      fire("pestana-a");
      expect(heard).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.BroadcastChannel = original;
    }
  });
});
