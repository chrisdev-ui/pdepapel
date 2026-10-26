import { describe, expect, it } from "vitest";

import {
  filterLocations,
  findExactLocation,
  locationSearchTokens,
} from "@/lib/location-search";

const LOCATIONS = [
  { city: "BOGOTÁ D.C.", department: "BOGOTÁ D.C." },
  { city: "PUERTO BOGOTA", department: "CUNDINAMARCA" },
  { city: "MEDELLÍN", department: "ANTIOQUIA" },
  { city: "MEDELLIN DEL ARIARI", department: "META" },
  { city: "CALI", department: "VALLE DEL CAUCA" },
  { city: "CALIMA", department: "VALLE DEL CAUCA" },
  { city: "CALIFORNIA", department: "SANTANDER" },
  { city: "CARTAGENA", department: "BOLÍVAR" },
  { city: "CARTAGENA DEL CHAIRÁ", department: "CAQUETÁ" },
  { city: "BARRANQUILLA", department: "ATLÁNTICO" },
  { city: "MOSQUERA", department: "CUNDINAMARCA" },
  { city: "MOSQUERA", department: "NARIÑO" },
  { city: "ITAGUI", department: "ANTIOQUIA" },
];

const cities = (query: string) => filterLocations(LOCATIONS, query).map((l) => `${l.city}|${l.department}`);

describe("búsqueda de ciudades por palabras (misma regla que la administración)", () => {
  it("encuentra la ciudad aunque escriban también el departamento", () => {
    expect(cities("Medellín, Antioquia")).toEqual(["MEDELLÍN|ANTIOQUIA"]);
    expect(cities("cali valle")[0]).toBe("CALI|VALLE DEL CAUCA");
    expect(cities("barranquilla atlantico")).toEqual(["BARRANQUILLA|ATLÁNTICO"]);
  });

  it("entiende «DC», «D.C.» y alias comunes", () => {
    expect(cities("Bogotá DC")[0]).toBe("BOGOTÁ D.C.|BOGOTÁ D.C.");
    expect(cities("Bogotá, D.C.")[0]).toBe("BOGOTÁ D.C.|BOGOTÁ D.C.");
    expect(cities("Cartagena de Indias")[0]).toBe("CARTAGENA|BOLÍVAR");
    expect(cities("Itagüí")).toEqual(["ITAGUI|ANTIOQUIA"]);
  });

  it("pone primero la ciudad exacta", () => {
    expect(cities("bogota")[0]).toBe("BOGOTÁ D.C.|BOGOTÁ D.C.");
    expect(cities("cali")[0]).toBe("CALI|VALLE DEL CAUCA");
  });

  it("ignora letras sueltas y palabras de enlace", () => {
    expect(locationSearchTokens("a")).toEqual([]);
    expect(locationSearchTokens("Cartagena del Chairá")).toEqual(["cartagena", "chaira"]);
  });

  it("solo hay coincidencia exacta cuando es una sola ciudad", () => {
    expect(findExactLocation(LOCATIONS, "Bogotá")?.city).toBe("BOGOTÁ D.C.");
    expect(findExactLocation(LOCATIONS, "medellin antioquia")?.city).toBe("MEDELLÍN");
    expect(findExactLocation(LOCATIONS, "Mosquera")).toBeUndefined();
    expect(findExactLocation(LOCATIONS, "Mosquera Nariño")?.department).toBe("NARIÑO");
    expect(findExactLocation(LOCATIONS, "Medel")).toBeUndefined();
  });
});
