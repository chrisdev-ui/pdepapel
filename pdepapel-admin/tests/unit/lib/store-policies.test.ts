import { describe, expect, it } from "vitest";

import { readStorePolicies } from "@/lib/store-policies";

describe("readStorePolicies", () => {
  it("acepta el texto JSON que guarda producción y el objeto del valor por defecto", () => {
    expect(readStorePolicies('{"shipping":"2 a 6 días","returns":"30 días"}')).toEqual({ shipping: "2 a 6 días", returns: "30 días" });
    expect(readStorePolicies({ payment: "Pago en línea" })).toEqual({ payment: "Pago en línea" });
    expect(readStorePolicies({})).toEqual({});
  });

  it("nunca lanza: texto vacío, JSON roto, listas, números y null cuentan como sin políticas", () => {
    for (const value of ["", "   ", "{roto", "[1,2]", '"texto"', "42", "null", [], 42, null, undefined, true]) {
      expect(readStorePolicies(value), JSON.stringify(value)).toBeNull();
    }
  });
});
