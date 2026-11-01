import { availableStock } from "@/lib/available-stock";
import type { HomeCampaignType, HomeContentPlacement, PresalePaymentMode, Prisma } from "@prisma/client";
import { z } from "zod";

// Contenido de portada: hero y banner de campaña con vigencia. La tienda muestra
// por ubicación la entrada en vivo más reciente y omite la sección si no hay ninguna.

export const HOME_CONTENT_PLACEMENTS: { id: HomeContentPlacement; label: string; description: string }[] = [
  { id: "HERO", label: "Hero", description: "El primer pantallazo: título de la portada, texto, botones e imagen." },
  { id: "CAMPAIGN", label: "Banner de campaña", description: "Bloque promocional en mitad de la portada. Solo aparece mientras está vigente." },
];

export const HOME_CAMPAIGN_TYPES: { id: HomeCampaignType; label: string; description: string }[] = [
  { id: "SEASON", label: "Temporada", description: "Escolar, Halloween, Navidad… con foto y un botón." },
  { id: "SHIPMENT", label: "Cargamento nuevo", description: "Muestra hasta 3 productos «Próximamente» y pide el correo para el acceso anticipado." },
  { id: "COLLECTION", label: "Colección", description: "Una licencia o línea nueva, con foto y un botón." },
  { id: "OFFER", label: "Oferta", description: "Una promoción con fecha de fin, con foto y un botón." },
  { id: "PRESALE", label: "Preventa", description: "Un producto en preventa: precio, anticipo y abono mínimo salen de la preventa. Se oculta sola si la preventa se cierra o el producto se archiva." },
];

export const HOME_CONTENT_LIMITS = {
  eyebrow: 80,
  title: 191,
  subtitle: 300,
  buttonLabel: 40,
  url: 500,
  imageAlt: 160,
  teaserProducts: 3,
  promotionId: 80,
} as const;

/** Botón de un banner de preventa cuando Paula no escribe otro. */
export const PRESALE_CAMPAIGN_DEFAULT_LABEL = "Separar el mío";

// Colombia no tiene horario de verano.
const BOGOTA_OFFSET = "-05:00";
const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;

export function dateInputToBogotaStart(value: string): Date {
  return new Date(`${value}T00:00:00.000${BOGOTA_OFFSET}`);
}

export function dateInputToBogotaEnd(value: string): Date {
  return new Date(`${value}T23:59:59.999${BOGOTA_OFFSET}`);
}

export function dateToBogotaInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() - 5 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

const urlSchema = z
  .string()
  .trim()
  .max(HOME_CONTENT_LIMITS.url)
  .refine(
    (value) => value === "" || value.startsWith("/") || /^https?:\/\//i.test(value),
    "Escribe una ruta interna (/tienda) o una URL completa (https://…)",
  );

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const homeContentSchema = z
  .object({
    placement: z.enum(["HERO", "CAMPAIGN"]),
    campaignType: z.enum(["SEASON", "SHIPMENT", "COLLECTION", "OFFER", "PRESALE"]).optional().nullable(),
    eyebrow: optionalText(HOME_CONTENT_LIMITS.eyebrow),
    title: z.string().trim().min(3, "El título es obligatorio").max(HOME_CONTENT_LIMITS.title),
    subtitle: optionalText(HOME_CONTENT_LIMITS.subtitle),
    primaryLabel: optionalText(HOME_CONTENT_LIMITS.buttonLabel),
    primaryUrl: urlSchema.optional().nullable(),
    secondaryLabel: optionalText(HOME_CONTENT_LIMITS.buttonLabel),
    secondaryUrl: urlSchema.optional().nullable(),
    imageUrl: optionalText(HOME_CONTENT_LIMITS.url),
    mobileImageUrl: optionalText(HOME_CONTENT_LIMITS.url),
    imageAlt: optionalText(HOME_CONTENT_LIMITS.imageAlt),
    promotionId: z
      .string()
      .trim()
      .max(HOME_CONTENT_LIMITS.promotionId)
      .regex(/^$|^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Usa minúsculas, números y guiones (por ejemplo kiut-adviento-2026)")
      .optional()
      .nullable(),
    isActive: z.boolean().optional().default(true),
    startsAt: z.string().regex(DATE_INPUT, "Fecha de inicio inválida"),
    endsAt: z.string().regex(DATE_INPUT, "Fecha de fin inválida").optional().nullable().or(z.literal("")),
    productIds: z.array(z.string().min(1)).max(HOME_CONTENT_LIMITS.teaserProducts).optional().default([]),
  })
  .superRefine((value, ctx) => {
    if (value.placement === "CAMPAIGN" && !value.campaignType) {
      ctx.addIssue({ code: "custom", path: ["campaignType"], message: "Elige el tipo de campaña" });
    }
    if (value.placement === "HERO" && !value.imageUrl) {
      ctx.addIssue({ code: "custom", path: ["imageUrl"], message: "El hero necesita una imagen" });
    }
    // La preventa puede usar la foto del producto.
    if (value.placement === "CAMPAIGN" && value.campaignType !== "SHIPMENT" && value.campaignType !== "PRESALE" && !value.imageUrl) {
      ctx.addIssue({ code: "custom", path: ["imageUrl"], message: "Este banner necesita una imagen" });
    }
    if (value.primaryLabel && !value.primaryUrl) {
      ctx.addIssue({ code: "custom", path: ["primaryUrl"], message: "El botón principal necesita un enlace" });
    }
    if (value.secondaryLabel && !value.secondaryUrl) {
      ctx.addIssue({ code: "custom", path: ["secondaryUrl"], message: "El botón secundario necesita un enlace" });
    }
    if (value.endsAt && value.endsAt < value.startsAt) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "La fecha de fin debe ser igual o posterior al inicio" });
    }
    if (value.campaignType === "PRESALE" && value.productIds.length !== 1) {
      ctx.addIssue({ code: "custom", path: ["productIds"], message: "Elige el producto en preventa (uno solo)" });
    }
    if (value.productIds.length > 0 && value.campaignType !== "SHIPMENT" && value.campaignType !== "PRESALE") {
      ctx.addIssue({ code: "custom", path: ["productIds"], message: "Solo un banner de cargamento o de preventa lleva productos" });
    }
  });

export type HomeContentInput = z.infer<typeof homeContentSchema>;

export function parseHomeContentBody(body: unknown): HomeContentInput {
  const parsed = homeContentSchema.safeParse(body ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HomeContentValidationError(issue?.message ?? "Revisa los datos del contenido");
  }
  return parsed.data;
}

export class HomeContentValidationError extends Error {}

const emptyToNull = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);

export function homeContentDataFromInput(input: HomeContentInput) {
  const isCampaign = input.placement === "CAMPAIGN";
  return {
    placement: input.placement,
    campaignType: isCampaign ? input.campaignType ?? null : null,
    eyebrow: emptyToNull(input.eyebrow),
    title: input.title.trim(),
    subtitle: emptyToNull(input.subtitle),
    primaryLabel: emptyToNull(input.primaryLabel),
    primaryUrl: emptyToNull(input.primaryUrl),
    secondaryLabel: emptyToNull(input.secondaryLabel),
    secondaryUrl: emptyToNull(input.secondaryUrl),
    imageUrl: emptyToNull(input.imageUrl),
    mobileImageUrl: isCampaign ? emptyToNull(input.mobileImageUrl) : null,
    imageAlt: emptyToNull(input.imageAlt),
    promotionId: isCampaign ? emptyToNull(input.promotionId) : null,
    isActive: input.isActive ?? true,
    startsAt: dateInputToBogotaStart(input.startsAt),
    endsAt: input.endsAt ? dateInputToBogotaEnd(input.endsAt) : null,
  };
}

export type HomeContentStatus = "en-vivo" | "programada" | "vencida" | "borrador";

export const HOME_CONTENT_STATUS_LABELS: Record<HomeContentStatus, string> = {
  "en-vivo": "En vivo",
  programada: "Programada",
  vencida: "Vencida",
  borrador: "Borrador",
};

export function getHomeContentStatus(
  entry: { isActive: boolean; startsAt: Date | string; endsAt: Date | string | null },
  now: Date = new Date(),
): HomeContentStatus {
  if (!entry.isActive) return "borrador";
  const startsAt = new Date(entry.startsAt);
  const endsAt = entry.endsAt ? new Date(entry.endsAt) : null;
  if (startsAt.getTime() > now.getTime()) return "programada";
  if (endsAt && endsAt.getTime() < now.getTime()) return "vencida";
  return "en-vivo";
}

export function isHomeContentLive(
  entry: { isActive: boolean; startsAt: Date | string; endsAt: Date | string | null },
  now: Date = new Date(),
): boolean {
  return getHomeContentStatus(entry, now) === "en-vivo";
}

export function pickLiveHomeContent<T extends { isActive: boolean; startsAt: Date | string; endsAt: Date | string | null }>(
  entries: T[],
  now: Date = new Date(),
): T | null {
  const live = entries.filter((entry) => isHomeContentLive(entry, now));
  if (live.length === 0) return null;
  return live.reduce((best, entry) =>
    new Date(entry.startsAt).getTime() > new Date(best.startsAt).getTime() ? entry : best,
  );
}

export function liveHomeContentWhere(storeId: string, now: Date = new Date()): Prisma.HomeContentWhereInput {
  return {
    storeId,
    isActive: true,
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gte: now } }],
  };
}

export const HOME_CONTENT_ADMIN_SELECT = {
  id: true,
  placement: true,
  campaignType: true,
  eyebrow: true,
  title: true,
  subtitle: true,
  primaryLabel: true,
  primaryUrl: true,
  secondaryLabel: true,
  secondaryUrl: true,
  imageUrl: true,
  mobileImageUrl: true,
  imageAlt: true,
  promotionId: true,
  isActive: true,
  startsAt: true,
  endsAt: true,
  earlyAccessSentAt: true,
  arrivalSentAt: true,
  createdAt: true,
  updatedAt: true,
  products: {
    orderBy: { position: "asc" },
    select: {
      position: true,
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          stock: true,
          reservedUnits: true,
          isArchived: true,
          images: { where: { isMain: true }, take: 1, select: { url: true } },
        },
      },
    },
  },
} satisfies Prisma.HomeContentSelect;

export const HOME_CONTENT_REVALIDATION = { scope: { paths: ["/"], tags: ["home-content"] } };

export type HomeContentRow = Prisma.HomeContentGetPayload<{ select: typeof HOME_CONTENT_ADMIN_SELECT }>;

/** Lo que muestra un banner de preventa; lo arma `lib/home-content-presale.ts` con las reglas del checkout. */
export interface PresaleCampaignOffer {
  productId: string;
  slug: string;
  name: string;
  price: number;
  paymentMode: PresalePaymentMode;
  depositPerUnit: number;
  minInstallment: number | null;
  imageUrl: string | null;
}

/** Null: la campaña de preventa no debe verse (cerrada, llena o producto archivado). */
export type PresaleOfferFor = (entry: HomeContentRow) => PresaleCampaignOffer | null;

export function toPublicHomeContent(entry: HomeContentRow, offerFor?: PresaleOfferFor) {
  const presale = entry.campaignType === "PRESALE" && offerFor ? offerFor(entry) : null;
  return {
    id: entry.id,
    placement: entry.placement,
    campaignType: entry.campaignType,
    eyebrow: entry.eyebrow,
    title: entry.title,
    subtitle: entry.subtitle,
    // Sin botón propio, una preventa lleva a su ficha: ahí están el precio completo y las condiciones.
    primaryLabel: entry.primaryLabel ?? (presale ? PRESALE_CAMPAIGN_DEFAULT_LABEL : null),
    primaryUrl: entry.primaryUrl ?? (presale ? `/producto/${presale.slug}` : null),
    secondaryLabel: entry.secondaryLabel,
    secondaryUrl: entry.secondaryUrl,
    imageUrl: entry.imageUrl ?? presale?.imageUrl ?? null,
    mobileImageUrl: entry.mobileImageUrl,
    imageAlt: entry.imageAlt ?? (presale ? presale.name : null),
    promotionId: entry.promotionId ?? entry.id,
    presale,
    startsAt: entry.startsAt,
    endsAt: entry.endsAt,
    products: entry.products
      .filter((item) => !item.product.isArchived)
      .map((item) => ({
        id: item.product.id,
        name: item.product.name,
        slug: item.product.slug,
        price: Number(item.product.price),
        stock: availableStock(item.product),
        imageUrl: item.product.images[0]?.url ?? null,
      })),
  };
}

export type PublicHomeContent = ReturnType<typeof toPublicHomeContent>;

/** Productos de las campañas de preventa: el GET público les carga la preventa activa antes de elegir. */
export function presaleCampaignProductIds(entries: HomeContentRow[]): string[] {
  return entries
    .filter((entry) => entry.placement === "CAMPAIGN" && entry.campaignType === "PRESALE")
    .flatMap((entry) => entry.products.map((item) => item.product.id));
}

export function selectLiveHomeContent(
  entries: HomeContentRow[],
  now: Date = new Date(),
  offerFor: PresaleOfferFor = () => null,
): { hero: PublicHomeContent | null; campaign: PublicHomeContent | null } {
  const hero = pickLiveHomeContent(entries.filter((entry) => entry.placement === "HERO"), now);
  // Una preventa cerrada, llena o de un producto archivado se descarta antes de
  // elegir, para que otra campaña vigente pueda ocupar el lugar.
  const campaign = pickLiveHomeContent(
    entries.filter(
      (entry) => entry.placement === "CAMPAIGN" && (entry.campaignType !== "PRESALE" || offerFor(entry) !== null),
    ),
    now,
  );
  return {
    hero: hero ? toPublicHomeContent(hero, offerFor) : null,
    campaign: campaign ? toPublicHomeContent(campaign, offerFor) : null,
  };
}
