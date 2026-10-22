import { describe, expect, it } from "vitest";

import { MP4_HEAD_BYTES, MP4_MAX_READ_BYTES, MP4_TAIL_BYTES, parseMvhdDuration, probeMp4Duration } from "@/lib/social/mp4-duration";

const u32 = (value: number) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));
const box = (type: string, body: number[]) => [...u32(8 + body.length), ...ascii(type), ...body];

/** mvhd v0: versión+flags, creación, modificación, timescale, duración y el resto hasta 108 bytes. */
function mvhdV0(timescale: number, duration: number) {
  const body = [0, 0, 0, 0, ...u32(0), ...u32(0), ...u32(timescale), ...u32(duration)];
  return box("mvhd", [...body, ...new Array(100 - body.length).fill(0)]);
}

function mvhdV1(timescale: number, duration: number) {
  const high = Math.floor(duration / 2 ** 32);
  const body = [1, 0, 0, 0, ...u32(0), ...u32(0), ...u32(0), ...u32(0), ...u32(timescale), ...u32(high), ...u32(duration >>> 0)];
  return box("mvhd", [...body, ...new Array(112 - body.length).fill(0)]);
}

const ftyp = box("ftyp", ascii("isom0000isomiso2mp41"));
const moov = (mvhd: number[]) => box("moov", mvhd);
const bytes = (values: number[]) => Uint8Array.from(values);

describe("duración del MP4 leyendo mvhd", () => {
  it("moov al principio, versión 0", () => {
    expect(parseMvhdDuration(bytes([...ftyp, ...moov(mvhdV0(1000, 15_500))]))).toBe(15.5);
  });

  it("versión 1 (64 bits)", () => {
    expect(parseMvhdDuration(bytes([...ftyp, ...moov(mvhdV1(90_000, 90_000 * 42))]))).toBe(42);
  });

  it("un «mvhd» suelto dentro de los datos no cuenta: el tamaño de la caja no es el de una mvhd", () => {
    const decoy = [...u32(9999), ...ascii("mvhd"), 0, 0, 0, 0, ...u32(1), ...u32(1), ...u32(1), ...u32(5)];
    expect(parseMvhdDuration(bytes([...ftyp, ...decoy, ...moov(mvhdV0(600, 600 * 12))]))).toBe(12);
  });

  it("archivo cortado a mitad de la mvhd → null", () => {
    const full = [...ftyp, ...moov(mvhdV0(1000, 15_500))];
    expect(parseMvhdDuration(bytes(full.slice(0, ftyp.length + 8 + 20)))).toBeNull();
  });

  it("MP4 fragmentado (duración 0) o sin timescale → null", () => {
    expect(parseMvhdDuration(bytes([...ftyp, ...moov(mvhdV0(1000, 0))]))).toBeNull();
    expect(parseMvhdDuration(bytes([...ftyp, ...moov(mvhdV0(0, 1000))]))).toBeNull();
    expect(parseMvhdDuration(bytes(ftyp))).toBeNull();
  });
});

type Call = { range: string | null };
function fakeFetch(respond: (range: string | null) => Uint8Array | null, calls: Call[] = []) {
  return (async (_url: string, init?: RequestInit) => {
    const range = new Headers(init?.headers).get("range");
    calls.push({ range });
    const body = respond(range);
    if (!body) return new Response(null, { status: 403 });
    return new Response(body as unknown as BodyInit, { status: 206 });
  }) as unknown as typeof fetch;
}

describe("probeMp4Duration (solo encabezados, con Range)", () => {
  it("moov al principio: una sola lectura de los primeros 64 KB", async () => {
    const calls: Call[] = [];
    const seconds = await probeMp4Duration("https://cdn.test/reel.mp4", fakeFetch(() => bytes([...ftyp, ...moov(mvhdV0(1000, 21_000))]), calls));
    expect(seconds).toBe(21);
    expect(calls).toEqual([{ range: `bytes=0-${MP4_HEAD_BYTES - 1}` }]);
  });

  it("moov al final: si no está en los primeros 64 KB, lee los últimos 512 KB", async () => {
    const calls: Call[] = [];
    const head = bytes([...ftyp, ...box("mdat", new Array(2000).fill(7))]);
    const tail = bytes([...new Array(500).fill(7), ...moov(mvhdV0(1000, 33_300))]);
    const seconds = await probeMp4Duration("https://cdn.test/reel.mp4", fakeFetch((range) => (range?.startsWith("bytes=0-") ? head : tail), calls));
    expect(seconds).toBe(33.3);
    expect(calls.map((call) => call.range)).toEqual([`bytes=0-${MP4_HEAD_BYTES - 1}`, `bytes=-${MP4_TAIL_BYTES}`]);
  });

  it("si el servidor ignora el Range y manda el archivo entero, no lee más del tope", async () => {
    const huge = new Uint8Array(MP4_MAX_READ_BYTES + 200_000);
    huge.set(moov(mvhdV0(1000, 9000)), MP4_MAX_READ_BYTES + 1000);
    expect(await probeMp4Duration("https://cdn.test/reel.mp4", fakeFetch(() => huge))).toBeNull();
  });

  it("un error de red o una respuesta 403 da null y nunca lanza", async () => {
    expect(await probeMp4Duration("https://cdn.test/reel.mp4", fakeFetch(() => null))).toBeNull();
    const failing = (async () => {
      throw new Error("red caída");
    }) as unknown as typeof fetch;
    expect(await probeMp4Duration("https://cdn.test/reel.mp4", failing)).toBeNull();
  });
});
