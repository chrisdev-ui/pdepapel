import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));

vi.mock("@/lib/env.mjs", () => ({ env: new Proxy({}, { get: () => "test" }) }));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    static fromEnv() {
      return { get: mocks.get, set: mocks.set };
    }
    get = mocks.get;
    set = mocks.set;
  },
}));

import { searchLocations } from "@/lib/dane-api";

const location = (locationCode: string, locationName: string, departmentOrStateName: string) => ({
  locationCode,
  locationName,
  departmentOrStateName,
});

const CACHED = [
  location("05001000", "MEDELLÍN", "ANTIOQUIA"),
  location("50325000", "MEDELLIN DEL ARIARI", "META"),
  location("11001000", "BOGOTÁ D.C.", "BOGOTÁ D.C."),
  location("13001000", "CARTAGENA", "BOLÍVAR"),
  ...Array.from({ length: 80 }, (_, index) => location(`99${String(index).padStart(6, "0")}`, `PUEBLO ${index}`, "SUCRE")),
];

describe("searchLocations (búsqueda pública de la tienda)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue(CACHED);
  });

  it("encuentra por ciudad y departamento juntos", async () => {
    expect((await searchLocations("Medellín, Antioquia")).map((l) => l.locationCode)).toEqual(["05001000"]);
    expect((await searchLocations("bogota dc"))[0].locationCode).toBe("11001000");
    expect((await searchLocations("Cartagena de Indias"))[0].locationCode).toBe("13001000");
  });

  it("con una letra no devuelve las 1.100 ciudades: respeta el límite", async () => {
    expect(await searchLocations("a", 50)).toHaveLength(50);
  });
});
