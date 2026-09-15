import { MinimumOrderRule } from "@prisma/client";
import { z } from "zod";

import { ErrorFactory } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";

/**
 * `null`/empty disables free shipping; otherwise a non-negative integer in COP.
 * Anything else is rejected so the storefront never shows a broken promise.
 */
export function parseFreeShippingThreshold(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount =
    typeof value === "string" ? Number(value.replace(/[.\s]/g, "")) : value;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) {
    throw ErrorFactory.InvalidRequest(
      "El umbral de envío gratis debe ser un número entero en pesos, o vacío para desactivarlo",
    );
  }
  return amount === 0 ? null : amount;
}

/**
 * Umbral de "stock crítico" por tienda. `null`/vacío usa el valor por defecto
 * de la aplicación; en otro caso, un entero de al menos 1 (un umbral de 0
 * nunca marcaría nada, para eso está la vista "Agotados").
 */
export function parseLowStockThreshold(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const units = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof units !== "number" || !Number.isInteger(units) || units < 1) {
    throw ErrorFactory.InvalidRequest(
      "El umbral de stock crítico debe ser un número entero de al menos 1, o vacío para usar el valor por defecto",
    );
  }
  return units;
}

// --- Datos del negocio editables desde Configuración -----------------------
export const WEEK_DAYS = [
  "lun",
  "mar",
  "mie",
  "jue",
  "vie",
  "sab",
  "dom",
] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

export const DAY_LABELS: Record<WeekDay, string> = {
  lun: "Lunes",
  mar: "Martes",
  mie: "Miércoles",
  jue: "Jueves",
  vie: "Viernes",
  sab: "Sábado",
  dom: "Domingo",
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const dayScheduleSchema = z
  .object({
    abre: z.string().regex(TIME, "Usa una hora como 08:00"),
    cierra: z.string().regex(TIME, "Usa una hora como 20:00"),
  })
  .refine((day) => day.abre < day.cierra, {
    message: "La hora de cierre debe ser posterior a la de apertura",
  })
  .nullable();

/** Un día ausente o en null es un día cerrado. */
export const openingHoursSchema = z.record(
  z.enum(WEEK_DAYS),
  dayScheduleSchema,
);

export type OpeningHours = z.infer<typeof openingHoursSchema>;

export const storeSettingsInputSchema = z
  .object({
    alwaysOpen: z.boolean().optional(),
    openingHours: openingHoursSchema.nullable().optional(),
    cityName: z.string().trim().max(80).nullable().optional(),
    hasPhysicalStore: z.boolean().optional(),
    physicalAddress: z.string().trim().max(191).nullable().optional(),
    minOrderRule: z.nativeEnum(MinimumOrderRule).optional(),
    minOrderAmount: z.number().int().min(0).nullable().optional(),
    deliveryEstimate: z.string().trim().max(120).nullable().optional(),
    paymentMethodsInfo: z.string().trim().max(1000).nullable().optional(),
    botEnabled: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.minOrderRule !== MinimumOrderRule.FIXED ||
      (input.minOrderAmount ?? 0) > 0,
    {
      message: "Con un mínimo fijo hay que decir de cuánto",
      path: ["minOrderAmount"],
    },
  )
  .refine(
    (input) =>
      !input.hasPhysicalStore || Boolean(input.physicalAddress?.trim()),
    {
      message: "Si hay tienda física, falta la dirección",
      path: ["physicalAddress"],
    },
  );

export type StoreSettingsInput = z.infer<typeof storeSettingsInputSchema>;

export interface ResolvedStoreSettings {
  /** Atención a toda hora; con esto en true el horario por día no aplica. */
  alwaysOpen: boolean;
  openingHours: OpeningHours | null;
  cityName: string | null;
  hasPhysicalStore: boolean;
  physicalAddress: string | null;
  minOrderRule: MinimumOrderRule;
  minOrderAmount: number | null;
  /**
   * Sale de `Store.freeShippingThreshold`, que es el que ya usa el checkout.
   * `StoreSettings` tiene su propia columna preparada, pero no se escribe
   * todavía: dos sitios editables para el mismo número terminarían
   * contradiciéndose, y el que manda en la plata es el del checkout.
   */
  freeShippingThreshold: number | null;
  /** Lo que se le promete a la clienta («2 a 4 días hábiles»). */
  deliveryEstimate: string | null;
  /** Las formas de pago con sus números, una por línea. */
  paymentMethodsInfo: string | null;
  botEnabled: boolean;
  /** Visto bueno a los textos con los que el bot da los datos del negocio. */
  botFactsApprovedAt: Date | null;
  botFactsVersion: string | null;
  /** Visto bueno aparte, para lo que contesta sobre productos. */
  botProductsApprovedAt: Date | null;
  botProductsVersion: string | null;
}

/** Lo que ve quien pregunta, con los valores por defecto cuando no hay fila. */
export async function getStoreSettings(
  storeId: string,
): Promise<ResolvedStoreSettings> {
  const [settings, store] = await Promise.all([
    prismadb.storeSettings.findUnique({ where: { storeId } }),
    prismadb.store.findUnique({
      where: { id: storeId },
      select: { freeShippingThreshold: true },
    }),
  ]);

  const parsedHours = openingHoursSchema.safeParse(
    settings?.openingHours ?? {},
  );

  return {
    alwaysOpen: settings?.alwaysOpen ?? false,
    // Datos guardados por nosotros: si están corruptos se ignoran en vez de
    // tumbar la pantalla, y quien los edite los vuelve a dejar bien.
    openingHours:
      parsedHours.success && Object.keys(parsedHours.data).length > 0
        ? parsedHours.data
        : null,
    cityName: settings?.cityName ?? null,
    hasPhysicalStore: settings?.hasPhysicalStore ?? false,
    physicalAddress: settings?.physicalAddress ?? null,
    minOrderRule: settings?.minOrderRule ?? MinimumOrderRule.NONE,
    minOrderAmount: settings?.minOrderAmount ?? null,
    freeShippingThreshold: store?.freeShippingThreshold ?? null,
    deliveryEstimate: settings?.deliveryEstimate?.trim() || null,
    paymentMethodsInfo: settings?.paymentMethodsInfo?.trim() || null,
    // Sin fila guardada el bot queda APAGADO. Al revés —que una tabla vacía
    // lo diera por encendido— es como se enciende solo el día que alguien
    // conecte esta bandera.
    botEnabled: settings?.botEnabled ?? false,
    botFactsApprovedAt: settings?.botFactsApprovedAt ?? null,
    botFactsVersion: settings?.botFactsVersion ?? null,
    botProductsApprovedAt: settings?.botProductsApprovedAt ?? null,
    botProductsVersion: settings?.botProductsVersion ?? null,
  };
}

export async function saveStoreSettings(
  storeId: string,
  input: StoreSettingsInput,
) {
  const data = {
    alwaysOpen: input.alwaysOpen ?? false,
    openingHours: input.openingHours ?? undefined,
    cityName: input.cityName ?? null,
    hasPhysicalStore: input.hasPhysicalStore ?? false,
    physicalAddress: input.hasPhysicalStore
      ? (input.physicalAddress ?? null)
      : null,
    minOrderRule: input.minOrderRule ?? MinimumOrderRule.NONE,
    minOrderAmount:
      input.minOrderRule === MinimumOrderRule.FIXED
        ? (input.minOrderAmount ?? null)
        : null,
    // Igual que al leer: si el formulario no manda la bandera, el bot NO se
    // enciende solo por guardar los datos del negocio.
    botEnabled: input.botEnabled ?? false,
    // Un campo que no venga se deja como estaba, en vez de borrarlo.
    ...(input.deliveryEstimate === undefined
      ? {}
      : { deliveryEstimate: input.deliveryEstimate?.trim() || null }),
    ...(input.paymentMethodsInfo === undefined
      ? {}
      : { paymentMethodsInfo: input.paymentMethodsInfo?.trim() || null }),
  };

  return prismadb.storeSettings.upsert({
    where: { storeId },
    update: data,
    create: { storeId, ...data },
  });
}

/**
 * Lo que se promete mientras nadie diga otra cosa. No es un número inventado:
 * sobre 106 entregas reales la mediana fue 0,9 días, el 94 % llegó en 4 o
 * menos y el 100 % en 7.
 */
export const DEFAULT_DELIVERY_ESTIMATE = "2 a 4 días hábiles";

export const ALWAYS_OPEN_LABEL = "Todos los días, a toda hora";

/** «08:00 - 20:00, Lun - Dom» a partir del horario guardado. */
export function formatOpeningHours(
  hours: OpeningHours | null,
  alwaysOpen = false,
): string | null {
  if (alwaysOpen) return ALWAYS_OPEN_LABEL;
  if (!hours) return null;
  const abiertos = WEEK_DAYS.filter((day) => hours[day]);
  if (abiertos.length === 0) return null;

  const mismos = abiertos.every(
    (day) =>
      hours[day]!.abre === hours[abiertos[0]]!.abre &&
      hours[day]!.cierra === hours[abiertos[0]]!.cierra,
  );
  const franja = `${hours[abiertos[0]]!.abre} - ${hours[abiertos[0]]!.cierra}`;

  if (mismos && abiertos.length === WEEK_DAYS.length)
    return `${franja}, Lun - Dom`;
  if (mismos) {
    return `${franja}, ${abiertos.map((day) => DAY_LABELS[day].slice(0, 3)).join(", ")}`;
  }
  return abiertos
    .map(
      (day) =>
        `${DAY_LABELS[day].slice(0, 3)} ${hours[day]!.abre}-${hours[day]!.cierra}`,
    )
    .join(" · ");
}
