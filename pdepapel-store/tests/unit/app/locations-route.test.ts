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

describe("/api/locations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDaneLocations.mockResolvedValue({ results: [], count: 0 });
  });

  it("never gets prerendered", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("forwards the search and the limit", async () => {
    await GET(request("?q=medell&limit=5"));
    expect(mocks.getDaneLocations).toHaveBeenCalledWith({
      q: "medell",
      limit: 5,
    });
  });

  it("drops a limit that is not a usable number", async () => {
    await GET(request("?q=cali&limit=cero"));
    expect(mocks.getDaneLocations).toHaveBeenCalledWith({
      q: "cali",
      limit: undefined,
    });

    await GET(request("?q=cali&limit=-3"));
    expect(mocks.getDaneLocations).toHaveBeenLastCalledWith({
      q: "cali",
      limit: undefined,
    });
  });

  it("returns what the DANE search answered", async () => {
    mocks.getDaneLocations.mockResolvedValue({
      results: [{ value: "05001000", label: "MEDELLÍN - ANTIOQUIA" }],
      count: 1,
    });

    const response = await GET(request("?q=medell"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      results: [{ value: "05001000", label: "MEDELLÍN - ANTIOQUIA" }],
      count: 1,
    });
  });
});
