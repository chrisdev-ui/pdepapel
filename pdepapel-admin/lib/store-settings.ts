import { BotAssistMode, MinimumOrderRule } from "@prisma/client";
import { z } from "zod";

import { ErrorFactory } from "@/lib/api-errors";
import { DAY_LABELS, DEFAULT_DELIVERY_ESTIMATE, WEEK_DAYS, type WeekDay } from "@/lib/store-settings-labels";
import { normalizeWhatsappNumber } from "@/lib/whatsapp-number";
import { ALERT_MINUTES_MAX, ALERT_MINUTES_MIN, clampAlertMinutes } from "@/lib/whatsapp/waiting";
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

/**
 * Margen neto objetivo en Mercado Libre (% del precio). Ausente deja el valor
 * guardado; vacío es 0. Más de 60 % no se alcanza con la comisión y el envío
 * de Mercado Libre, así que el asistente nunca sugeriría precio.
 */
export function parseMercadoLibreTargetMarginPercent(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return 0;
  const percent = typeof value === "string" ? Number(value.replace(",", ".").trim()) : value;
  if (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 60) {
    throw ErrorFactory.InvalidRequest("El margen objetivo de Mercado Libre debe ser un porcentaje entre 0 y 60");
  }
  return Math.round(percent * 10) / 10;
}

/** Ganancia neta mínima por unidad en Mercado Libre, en COP. Ausente deja el valor guardado. */
export function parseMercadoLibreMinNetPerUnit(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return 0;
  const amount = typeof value === "string" ? Number(value.replace(/[.\s]/g, "")) : value;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0 || amount > 10_000_000) {
    throw ErrorFactory.InvalidRequest("La ganancia mínima por unidad en Mercado Libre debe ser un número entero en pesos");
  }
  return amount;
}

/**
 * Margen bruto mínimo sobre el precio en la tienda (%). Ausente deja el valor
 * guardado; vacío es «sin mínimo» (null) y entonces nada se marca por debajo.
 */
export function parseStoreMinMarginPercent(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const percent = typeof value === "string" ? Number(value.replace(",", ".").trim()) : value;
  if (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 90) {
    throw ErrorFactory.InvalidRequest("El margen mínimo de la tienda debe ser un porcentaje entre 0 y 90, o vacío para no usar mínimo");
  }
  return Math.round(percent * 10) / 10;
}

/** Un valor opcional en pesos de los ajustes de Mercado Libre. Ausente deja el guardado; vacío es «no registrado» (null). */
export function parseOptionalMercadoLibrePesos(value: unknown, label: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const amount = typeof value === "string" ? Number(value.replace(/[.\s]/g, "")) : value;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0 || amount > 10_000_000) {
    throw ErrorFactory.InvalidRequest(`${label} debe ser un número entero en pesos, o vacío si no lo sabes`);
  }
  return amount;
}

/** Aumento propio de una categoría (%). Ausente deja el guardado; vacío vuelve a la mediana (null). */
export function parseMarkupOverridePercent(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const percent = typeof value === "string" ? Number(value.replace(",", ".").trim()) : value;
  if (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 1000) {
    throw ErrorFactory.InvalidRequest("El aumento sugerido debe ser un porcentaje entre 0 y 1000, o vacío para usar la mediana");
  }
  return Math.round(percent * 10) / 10;
}

// --- Datos del negocio editables desde Configuración -----------------------
export { DAY_LABELS, DEFAULT_DELIVERY_ESTIMATE, WEEK_DAYS, type WeekDay } from "@/lib/store-settings-labels";

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
    paymentCashInfo: z.string().trim().max(300).nullable().optional(),
    paymentBancolombiaAccount: z.string().trim().max(300).nullable().optional(),
    paymentNequiNumber: z.string().trim().max(300).nullable().optional(),
    paymentDaviplataNumber: z.string().trim().max(300).nullable().optional(),
    paymentBreBKey: z.string().trim().max(120).nullable().optional(),
    whatsappNumber: z
      .string()
      .trim()
      .nullable()
      .optional()
      .refine((value) => !value || normalizeWhatsappNumber(value) !== null, {
        message: "Escribe un celular colombiano: 10 dígitos que empiezan por 3",
      }),
    paymentCardInfo: z.string().trim().max(300).nullable().optional(),
    botEnabled: z.boolean().optional(),
    botReadBursts: z.boolean().optional(),
    botFallbackMode: z.nativeEnum(BotAssistMode).optional(),
    botHoldingMode: z.nativeEnum(BotAssistMode).optional(),
    botHoldingText: z.string().trim().max(500).nullable().optional(),
    botHoldingNightText: z.string().trim().max(500).nullable().optional(),
    waitingReminderEmail: z.boolean().optional(),
    waitingAlertMinutes: z
      .number({ invalid_type_error: "Escribe los minutos con números" })
      .int("Escribe los minutos sin decimales")
      .min(ALERT_MINUTES_MIN, `El aviso necesita al menos ${ALERT_MINUTES_MIN} minutos`)
      .max(ALERT_MINUTES_MAX, `El aviso puede esperar como mucho ${ALERT_MINUTES_MAX} minutos`)
      .optional(),
    whatsappOrderUpdatesEnabled: z.boolean().optional(),
    // El nombre exacto de la plantilla aprobada en WhatsApp Manager.
    whatsappTemplateGuide: z.string().trim().max(100).regex(/^[a-z0-9_]*$/, "Solo minúsculas, números y _").nullable().optional(),
    whatsappTemplateDelivered: z.string().trim().max(100).regex(/^[a-z0-9_]*$/, "Solo minúsculas, números y _").nullable().optional(),
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
  /** Lo que se le promete a la clienta («2 a 6 días hábiles»), desde que se confirma el pago. */
  deliveryEstimate: string | null;
  /**
   * Las formas de pago, una por campo. Vacía = no se ofrece, y el menú del bot
   * ni la enseña.
   */
  paymentCashInfo: string | null;
  paymentBancolombiaAccount: string | null;
  paymentNequiNumber: string | null;
  paymentDaviplataNumber: string | null;
  /** Llave Bre-B para transferir; con la cuenta y el WhatsApp arma las instrucciones de pago. */
  paymentBreBKey: string | null;
  /** WhatsApp del negocio en dígitos con indicativo (573…), para el comprobante. */
  whatsappNumber: string | null;
  paymentCardInfo: string | null;
  botEnabled: boolean;
  /** Leer los mensajes seguidos de una clienta como uno solo. */
  botReadBursts: boolean;
  /** Respuesta del bot a los 10 min sin respuesta de nadie: apagada, sombra o encendida. */
  botFallbackMode: BotAssistMode;
  /** Mensaje de espera: apagado, sombra o encendido. */
  botHoldingMode: BotAssistMode;
  /** Textos que escribe Paula; vacíos, el mensaje de espera no sale. */
  botHoldingText: string | null;
  botHoldingNightText: string | null;
  /** «Avisarme por correo cuando un cliente espere»; apagado por defecto. */
  waitingReminderEmail: boolean;
  /** Minutos sin respuesta para «Clientas esperando» (Inicio, menú y aviso push); 30 por defecto. */
  waitingAlertMinutes: number;
  /** Avisos de envío por WhatsApp (plantillas de utilidad); apagado por defecto. El correo sale siempre. */
  whatsappOrderUpdatesEnabled: boolean;
  whatsappTemplateGuide: string | null;
  whatsappTemplateDelivered: string | null;
  /** Visto bueno a los textos con los que el bot da los datos del negocio. */
  botFactsApprovedAt: Date | null;
  botFactsVersion: string | null;
  /** Visto bueno aparte, para lo que contesta sobre productos. */
  botProductsApprovedAt: Date | null;
  botProductsVersion: string | null;
  botCasualApprovedAt: Date | null;
  botCasualVersion: string | null;
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
    paymentCashInfo: settings?.paymentCashInfo?.trim() || null,
    paymentBancolombiaAccount: settings?.paymentBancolombiaAccount?.trim() || null,
    paymentNequiNumber: settings?.paymentNequiNumber?.trim() || null,
    paymentDaviplataNumber: settings?.paymentDaviplataNumber?.trim() || null,
    paymentBreBKey: settings?.paymentBreBKey?.trim() || null,
    whatsappNumber: normalizeWhatsappNumber(settings?.whatsappNumber),
    paymentCardInfo: settings?.paymentCardInfo?.trim() || null,
    // Sin fila guardada el bot queda APAGADO. Al revés —que una tabla vacía
    // lo diera por encendido— es como se enciende solo el día que alguien
    // conecte esta bandera.
    botEnabled: settings?.botEnabled ?? false,
    botReadBursts: settings?.botReadBursts ?? false,
    // En sombra por defecto: se anota lo que haría y no sale nada.
    botFallbackMode: settings?.botFallbackMode ?? BotAssistMode.SHADOW,
    botHoldingMode: settings?.botHoldingMode ?? BotAssistMode.SHADOW,
    botHoldingText: settings?.botHoldingText?.trim() || null,
    botHoldingNightText: settings?.botHoldingNightText?.trim() || null,
    waitingReminderEmail: settings?.waitingReminderEmail ?? false,
    waitingAlertMinutes: clampAlertMinutes(settings?.waitingAlertMinutes),
    whatsappOrderUpdatesEnabled: settings?.whatsappOrderUpdatesEnabled ?? false,
    whatsappTemplateGuide: settings?.whatsappTemplateGuide?.trim() || null,
    whatsappTemplateDelivered: settings?.whatsappTemplateDelivered?.trim() || null,
    botFactsApprovedAt: settings?.botFactsApprovedAt ?? null,
    botFactsVersion: settings?.botFactsVersion ?? null,
    botProductsApprovedAt: settings?.botProductsApprovedAt ?? null,
    botProductsVersion: settings?.botProductsVersion ?? null,
    botCasualApprovedAt: settings?.botCasualApprovedAt ?? null,
    botCasualVersion: settings?.botCasualVersion ?? null,
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
    botReadBursts: input.botReadBursts ?? false,
    ...(input.botFallbackMode === undefined ? {} : { botFallbackMode: input.botFallbackMode }),
    ...(input.botHoldingMode === undefined ? {} : { botHoldingMode: input.botHoldingMode }),
    ...(input.botHoldingText === undefined ? {} : { botHoldingText: input.botHoldingText?.trim() || null }),
    ...(input.botHoldingNightText === undefined ? {} : { botHoldingNightText: input.botHoldingNightText?.trim() || null }),
    ...(input.waitingReminderEmail === undefined ? {} : { waitingReminderEmail: input.waitingReminderEmail }),
    ...(input.waitingAlertMinutes === undefined ? {} : { waitingAlertMinutes: input.waitingAlertMinutes }),
    ...(input.whatsappOrderUpdatesEnabled === undefined ? {} : { whatsappOrderUpdatesEnabled: input.whatsappOrderUpdatesEnabled }),
    ...(input.whatsappTemplateGuide === undefined ? {} : { whatsappTemplateGuide: input.whatsappTemplateGuide?.trim() || null }),
    ...(input.whatsappTemplateDelivered === undefined ? {} : { whatsappTemplateDelivered: input.whatsappTemplateDelivered?.trim() || null }),
    // Un campo que no venga se deja como estaba, en vez de borrarlo.
    ...(input.deliveryEstimate === undefined
      ? {}
      : { deliveryEstimate: input.deliveryEstimate?.trim() || null }),
    // Un campo que no venga se deja como estaba, igual que los de arriba.
    ...(input.paymentCashInfo === undefined
      ? {}
      : { paymentCashInfo: input.paymentCashInfo?.trim() || null }),
    ...(input.paymentBancolombiaAccount === undefined
      ? {}
      : { paymentBancolombiaAccount: input.paymentBancolombiaAccount?.trim() || null }),
    ...(input.paymentNequiNumber === undefined
      ? {}
      : { paymentNequiNumber: input.paymentNequiNumber?.trim() || null }),
    ...(input.paymentDaviplataNumber === undefined
      ? {}
      : { paymentDaviplataNumber: input.paymentDaviplataNumber?.trim() || null }),
    ...(input.paymentCardInfo === undefined
      ? {}
      : { paymentCardInfo: input.paymentCardInfo?.trim() || null }),
    ...(input.paymentBreBKey === undefined
      ? {}
      : { paymentBreBKey: input.paymentBreBKey?.trim() || null }),
    ...(input.whatsappNumber === undefined
      ? {}
      : { whatsappNumber: normalizeWhatsappNumber(input.whatsappNumber) }),
  };

  return prismadb.storeSettings.upsert({
    where: { storeId },
    update: data,
    create: { storeId, ...data },
  });
}


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

/** Días por defecto de una reserva (Reservas). Ausente deja el valor guardado. */
export function parseReservationDefaultDays(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const days = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 60) {
    throw ErrorFactory.InvalidRequest("Los días de una reserva deben ser un número entero entre 1 y 60");
  }
  return days;
}
