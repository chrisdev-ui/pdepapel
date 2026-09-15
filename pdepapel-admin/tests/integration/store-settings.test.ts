import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  formatOpeningHours,
  getStoreSettings,
  saveStoreSettings,
} from "@/lib/store-settings";
import { testPrisma } from "./helpers/database";

const suffix = randomUUID().slice(0, 8);
let storeId = "";

beforeAll(async () => {
  const store = await testPrisma.store.create({
    data: {
      name: `Ajustes ${suffix}`,
      userId: `owner-${suffix}`,
      freeShippingThreshold: 120000,
    },
  });
  storeId = store.id;
});

afterAll(async () => {
  await testPrisma.storeSettings.deleteMany({ where: { storeId } });
  await testPrisma.store.delete({ where: { id: storeId } });
});

describe("datos del negocio", () => {
  it("sin fila guardada responde con valores por defecto, no con un error", async () => {
    const settings = await getStoreSettings(storeId);

    expect(settings).toMatchObject({
      alwaysOpen: false,
      openingHours: null,
      cityName: null,
      hasPhysicalStore: false,
      minOrderRule: "NONE",
      botEnabled: true,
    });
    // El umbral sale de Store, que es el que usa el checkout.
    expect(settings.freeShippingThreshold).toBe(120000);
  });

  it("guarda y devuelve lo guardado", async () => {
    await saveStoreSettings(storeId, {
      cityName: "Medellín",
      alwaysOpen: true,
      hasPhysicalStore: false,
      minOrderRule: "MATCH_SHIPPING",
      botEnabled: true,
      openingHours: { lun: { abre: "08:00", cierra: "20:00" } },
    });

    const settings = await getStoreSettings(storeId);
    expect(settings).toMatchObject({
      cityName: "Medellín",
      alwaysOpen: true,
      minOrderRule: "MATCH_SHIPPING",
    });
    expect(formatOpeningHours(settings.openingHours, settings.alwaysOpen)).toBe(
      "Todos los días, a toda hora",
    );
  });

  it("guardar dos veces no crea una segunda fila", async () => {
    await saveStoreSettings(storeId, { cityName: "Medellín" });
    await saveStoreSettings(storeId, { cityName: "Envigado" });

    expect(await testPrisma.storeSettings.count({ where: { storeId } })).toBe(
      1,
    );
    expect((await getStoreSettings(storeId)).cityName).toBe("Envigado");
  });

  it("apagar la tienda física borra la dirección en vez de dejarla colgada", async () => {
    await saveStoreSettings(storeId, {
      hasPhysicalStore: true,
      physicalAddress: "Calle 10 #40-20",
    });
    expect((await getStoreSettings(storeId)).physicalAddress).toBe(
      "Calle 10 #40-20",
    );

    await saveStoreSettings(storeId, {
      hasPhysicalStore: false,
      physicalAddress: "Calle 10 #40-20",
    });
    expect((await getStoreSettings(storeId)).physicalAddress).toBeNull();
  });

  it("un monto mínimo no se queda guardado si la regla deja de ser FIXED", async () => {
    await saveStoreSettings(storeId, {
      minOrderRule: "FIXED",
      minOrderAmount: 50000,
    });
    expect((await getStoreSettings(storeId)).minOrderAmount).toBe(50000);

    await saveStoreSettings(storeId, {
      minOrderRule: "MATCH_SHIPPING",
      minOrderAmount: 50000,
    });
    expect((await getStoreSettings(storeId)).minOrderAmount).toBeNull();
  });

  it("un horario corrupto en la base no tumba la lectura", async () => {
    await testPrisma.storeSettings.update({
      where: { storeId },
      data: { openingHours: { lun: "a las ocho" } as never },
    });

    await expect(getStoreSettings(storeId)).resolves.toMatchObject({
      openingHours: null,
    });
  });
});
