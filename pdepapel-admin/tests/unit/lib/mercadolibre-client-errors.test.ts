import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { MercadoLibreRequestError, toMercadoLibreRequestError } from "@/lib/mercadolibre/client";

describe("Mercado Libre client errors", () => {
  it("maps each upstream failure to a panel status and a Spanish message", () => {
    expect(toMercadoLibreRequestError(401, null)).toMatchObject({ statusCode: 401, upstreamStatus: 401, message: expect.stringMatching(/Reconecta/) });
    expect(toMercadoLibreRequestError(404, null)).toMatchObject({ statusCode: 404 });
    expect(toMercadoLibreRequestError(429, null)).toMatchObject({ statusCode: 429, message: expect.stringMatching(/limitó/) });
    expect(toMercadoLibreRequestError(503, null)).toMatchObject({ statusCode: 502 });
    const other = toMercadoLibreRequestError(400, { message: "Invalid price", cause: [{ message: "price too low" }] }, "actualización");
    expect(other).toBeInstanceOf(MercadoLibreRequestError);
    expect(other.statusCode).toBe(400);
    expect(other.message).toContain("Invalid price");
    expect(other.details).toEqual({ upstreamStatus: 400, upstreamMessage: "Invalid price · price too low" });
  });
});
