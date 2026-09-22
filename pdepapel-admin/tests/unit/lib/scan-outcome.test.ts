import { describe, expect, it } from "vitest";

import { scanAccepted, scanRejected, settleScan } from "@/lib/scan-outcome";

/**
 * El pitido tiene que decir la verdad. Estas son las cuatro formas en que una
 * pantalla contesta cómo le fue con un código, y la que faltaba —no contestar—
 * es la que permite no tocar las pantallas que ya enseñan el resultado solas.
 */
describe("cómo termina una lectura", () => {
  it("quien no contesta nada se da por bueno", async () => {
    await expect(settleScan(() => undefined)).resolves.toEqual({ ok: true, label: null });
    await expect(settleScan(() => Promise.resolve(undefined))).resolves.toEqual({ ok: true, label: null });
  });

  it("acepta con el nombre de lo que resolvió", async () => {
    await expect(settleScan(() => scanAccepted("Guillotina"))).resolves.toEqual({ ok: true, label: "Guillotina" });
    await expect(settleScan(() => Promise.resolve(scanAccepted()))).resolves.toEqual({ ok: true, label: null });
  });

  it("rechaza sin perder el nombre, que sirve para nombrar lo que no entró", async () => {
    await expect(settleScan(() => scanRejected("Libreta rosa"))).resolves.toEqual({ ok: false, label: "Libreta rosa" });
  });

  /**
   * Si la pantalla revienta buscando, la lectura no sirvió. Antes esto habría
   * subido como promesa rechazada hasta el lector y habría dejado el escáner
   * mudo justo cuando más falta hace saber que algo salió mal.
   */
  it("lo que lanza cuenta como rechazado y no propaga el error", async () => {
    await expect(settleScan(() => Promise.reject(new Error("sin red")))).resolves.toEqual({ ok: false, label: null });
    // Y el síncrono, que es el que se escapaba cuando esto recibía el
    // resultado ya calculado en vez de la llamada sin hacer.
    await expect(
      settleScan(() => {
        throw new Error("revienta antes del primer await");
      }),
    ).resolves.toEqual({ ok: false, label: null });
  });
});
