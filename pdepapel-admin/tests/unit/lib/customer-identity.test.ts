import { describe, expect, it } from "vitest";

import { segmentLabel } from "@/lib/admin-navigation";
import { CUSTOMER_ID_PATTERN, customerIdFromPhone, isCustomerId } from "@/lib/customer-identity";
import { normalizePhone } from "@/lib/customer-views";

const STORE = "store_pdepapel";

describe("el identificador de un cliente ya no es su teléfono", () => {
  it("no contiene el número por ningún lado", () => {
    const phone = normalizePhone("+57 301 555 0001");
    const id = customerIdFromPhone(STORE, phone);
    expect(phone).toBe("573015550001");
    expect(id).not.toContain(phone);
    expect(id).not.toContain("3015550001");
    expect(id).not.toContain("5550001");
    expect(id).toMatch(CUSTOMER_ID_PATTERN);
  });

  it("es el mismo siempre: los enlaces no se rompen entre despliegues", () => {
    const phone = normalizePhone("3015550001");
    expect(customerIdFromPhone(STORE, phone)).toBe(customerIdFromPhone(STORE, phone));
    // El mismo número escrito de otra forma normaliza igual, así que es el mismo cliente.
    expect(customerIdFromPhone(STORE, normalizePhone("+57 301 555 0001"))).toBe(customerIdFromPhone(STORE, phone));
  });

  it("dos personas distintas no comparten identificador", () => {
    expect(customerIdFromPhone(STORE, normalizePhone("3015550001"))).not.toBe(
      customerIdFromPhone(STORE, normalizePhone("3015550002")),
    );
  });

  it("va salado con la tienda: la misma persona no se correlaciona entre tiendas", () => {
    const phone = normalizePhone("3015550001");
    expect(customerIdFromPhone("tienda-a", phone)).not.toBe(customerIdFromPhone("tienda-b", phone));
  });

  it("un teléfono en la URL ya no se acepta como identificador", () => {
    expect(isCustomerId("573015550001")).toBe(false);
    expect(isCustomerId("+573015550001")).toBe(false);
    expect(isCustomerId("")).toBe(false);
    expect(isCustomerId(null)).toBe(false);
    expect(isCustomerId(customerIdFromPhone(STORE, "573015550001"))).toBe(true);
  });

  it("la miga de pan lo lee como «Detalle», no lo pinta en crudo", () => {
    const id = customerIdFromPhone(STORE, normalizePhone("3015550001"));
    expect(segmentLabel(id)).toBe("Detalle");
    expect(segmentLabel(id)).not.toContain(id);
  });
});
