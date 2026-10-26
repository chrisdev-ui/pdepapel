import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDaneLocations: vi.fn() }));

vi.mock("@/actions/get-dane-locations", () => ({
  getDaneLocations: mocks.getDaneLocations,
  EMPTY_DANE_RESPONSE: { results: [], count: 0 },
}));

import { GET, dynamic } from "@/app/api/locations/route";

const request = (search: string) =>
  new NextRequest(`https://papeleriapdepapel.com/api/locations${search}`);

const option = (daneCode: string, city: string, department: string) => ({
  value: daneCode,
  label: `${city} - ${department}`,
  daneCode,
  city,
  department,
});

const MEDELLIN = option("05001000", "MEDELLÍN", "ANTIOQUIA");
const ARIARI = option("50325000", "MEDELLIN DEL ARIARI", "META");

describe("/api/locations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDaneLocations.mockResolvedValue({ results: [], count: 0 });
  });

  it("never gets prerendered", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("forwards a one-word search and the limit", async () => {
    await GET(request("?q=medell&limit=5"));
    expect(mocks.getDaneLocations).toHaveBeenCalledWith({ q: "medell", limit: 5 });
  });

  it("uses the default limit when the given one is not a usable number", async () => {
    await GET(request("?q=cali&limit=cero"));
    expect(mocks.getDaneLocations).toHaveBeenCalledWith({ q: "cali", limit: 50 });

    await GET(request("?q=cali&limit=-3"));
    expect(mocks.getDaneLocations).toHaveBeenLastCalledWith({ q: "cali", limit: 50 });
  });

  it("with less than two letters asks for the frequent cities, not the whole country", async () => {
    await GET(request("?q=b"));
    expect(mocks.getDaneLocations).toHaveBeenCalledWith({ limit: 50 });
  });

  it("returns what the DANE search answered", async () => {
    mocks.getDaneLocations.mockResolvedValue({ results: [MEDELLIN], count: 1 });

    const response = await GET(request("?q=medell"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ results: [MEDELLIN], count: 1 });
  });

  it("with city and department asks the admin for one word and keeps only what matches both", async () => {
    // La administración de antes buscaba la frase entera: aquí se le pide una palabra.
    mocks.getDaneLocations.mockResolvedValue({ results: [ARIARI, MEDELLIN], count: 2 });

    const response = await GET(request(`?q=${encodeURIComponent("Medellín, Antioquia")}`));

    expect(mocks.getDaneLocations).toHaveBeenCalledWith({ q: "antioquia", limit: 300 });
    await expect(response.json()).resolves.toEqual({ results: [MEDELLIN], count: 1 });
  });
});
