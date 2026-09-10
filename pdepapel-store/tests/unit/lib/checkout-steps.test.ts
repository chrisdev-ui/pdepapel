import { describe, expect, it } from "vitest";

import {
  CHECKOUT_FIELD_STEPS,
  getFirstInvalidStep,
  getStepFields,
  joinFullName,
} from "@/lib/checkout-steps";

describe("joinFullName", () => {
  it("une y recorta las partes, ignorando vacíos", () => {
    expect(joinFullName(" Paula ", "Restrepo")).toBe("Paula Restrepo");
    expect(joinFullName("Ana", null)).toBe("Ana");
    expect(joinFullName(undefined, undefined)).toBe("");
  });
});

describe("getFirstInvalidStep", () => {
  it("devuelve null cuando no hay errores", () => {
    expect(getFirstInvalidStep({})).toBeNull();
  });

  it("devuelve el paso más bajo con errores", () => {
    expect(
      getFirstInvalidStep({
        paymentMethod: { message: "x" },
        daneCode: { message: "y" },
      }),
    ).toBe(2);
  });

  it("usa el paso de respaldo para campos desconocidos", () => {
    expect(getFirstInvalidStep({ unknownField: {} }, 4)).toBe(4);
  });
});

describe("getStepFields", () => {
  it("agrupa los campos del paso de contacto", () => {
    expect(getStepFields(1)).toEqual(
      expect.arrayContaining(["fullName", "email", "telephone", "documentId"]),
    );
  });

  it("cubre todos los campos del formulario", () => {
    const all = [1, 2, 3].flatMap(getStepFields);
    expect(all.sort()).toEqual(Object.keys(CHECKOUT_FIELD_STEPS).sort());
  });
});
