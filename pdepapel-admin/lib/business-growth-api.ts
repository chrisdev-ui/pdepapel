import { ErrorFactory } from "@/lib/api-errors";
import {
  BUSINESS_CASH_MOVEMENT_TYPES,
  type BusinessCashMovementType,
  type BusinessCashPolicyInput,
  validateBusinessCashPolicy,
} from "@/lib/business-growth";
import { createTaxReportPeriod } from "@/lib/tax-reports";
import {
  GrowthCampaignChannel,
  GrowthCampaignObjective,
  GrowthCampaignStatus,
} from "@prisma/client";

const MAX_DESCRIPTION_LENGTH = 180;
const MAX_REFERENCE_LENGTH = 120;
const MAX_CAMPAIGN_NAME_LENGTH = 160;
const MAX_BRIEF_LENGTH = 4000;

function parseFiniteNumber(value: unknown, fieldName: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw ErrorFactory.InvalidRequest(`${fieldName} no es válido`);
  }
  return parsed;
}

function parseText(value: unknown, fieldName: string, maxLength: number) {
  const parsed = String(value ?? "").trim();
  if (!parsed) {
    throw ErrorFactory.InvalidRequest(`${fieldName} es requerido`);
  }
  if (parsed.length > maxLength) {
    throw ErrorFactory.InvalidRequest(
      `${fieldName} no puede superar ${maxLength} caracteres`,
    );
  }
  return parsed;
}

export function parseBusinessCashPolicy(
  body: Record<string, unknown>,
): BusinessCashPolicyInput {
  const policy = {
    minimumOperatingReserve: parseFiniteNumber(
      body.minimumOperatingReserve,
      "La reserva operativa",
    ),
    taxReserveRate: parseFiniteNumber(
      body.taxReserveRate,
      "La reserva para impuestos",
    ),
    reinvestmentRate: parseFiniteNumber(
      body.reinvestmentRate,
      "La reinversión",
    ),
    ownerDrawRate: parseFiniteNumber(body.ownerDrawRate, "El retiro personal"),
    marketingTestRate: parseFiniteNumber(
      body.marketingTestRate,
      "La prueba de marketing",
    ),
    minimumCampaignMarginPct: parseFiniteNumber(
      body.minimumCampaignMarginPct,
      "El margen mínimo",
    ),
    minimumCampaignStock: parseFiniteNumber(
      body.minimumCampaignStock,
      "El stock mínimo",
    ),
    minimumCampaignDaysCover: parseFiniteNumber(
      body.minimumCampaignDaysCover,
      "La cobertura mínima",
    ),
  };

  if (
    !Number.isInteger(policy.minimumCampaignStock) ||
    !Number.isInteger(policy.minimumCampaignDaysCover)
  ) {
    throw ErrorFactory.InvalidRequest(
      "El stock y la cobertura mínima deben ser números enteros",
    );
  }

  try {
    validateBusinessCashPolicy(policy);
  } catch (error) {
    throw ErrorFactory.InvalidRequest(
      error instanceof Error ? error.message : "La configuración no es válida",
    );
  }

  return policy;
}

export function parseBusinessCashMovement(body: Record<string, unknown>) {
  const type = String(body.type ?? "") as BusinessCashMovementType;
  if (!BUSINESS_CASH_MOVEMENT_TYPES.includes(type)) {
    throw ErrorFactory.InvalidRequest("El tipo de movimiento no es válido");
  }

  const amount = parseFiniteNumber(body.amount, "El valor");
  if (amount <= 0) {
    throw ErrorFactory.InvalidRequest("El valor debe ser mayor que cero");
  }

  const occurredAtValue = String(body.occurredAt ?? "");
  let occurredAt: Date;
  try {
    occurredAt = createTaxReportPeriod(occurredAtValue, occurredAtValue).start;
  } catch {
    throw ErrorFactory.InvalidRequest("La fecha del movimiento no es válida");
  }

  const reference = String(body.reference ?? "").trim();
  const notes = String(body.notes ?? "").trim();
  if (reference.length > MAX_REFERENCE_LENGTH) {
    throw ErrorFactory.InvalidRequest(
      `La referencia no puede superar ${MAX_REFERENCE_LENGTH} caracteres`,
    );
  }

  return {
    type,
    amount,
    description: parseText(
      body.description,
      "La descripción",
      MAX_DESCRIPTION_LENGTH,
    ),
    occurredAt,
    reference: reference || null,
    notes: notes || null,
  };
}

export function parseCampaignDraft(body: Record<string, unknown>) {
  const channel = String(body.channel ?? "") as GrowthCampaignChannel;
  const objective = String(body.objective ?? "") as GrowthCampaignObjective;
  const status = String(body.status ?? "DRAFT") as GrowthCampaignStatus;
  if (!Object.values(GrowthCampaignChannel).includes(channel)) {
    throw ErrorFactory.InvalidRequest("El canal de la campaña no es válido");
  }
  if (!Object.values(GrowthCampaignObjective).includes(objective)) {
    throw ErrorFactory.InvalidRequest("El objetivo de la campaña no es válido");
  }
  if (
    status !== GrowthCampaignStatus.DRAFT &&
    status !== GrowthCampaignStatus.READY
  ) {
    throw ErrorFactory.InvalidRequest(
      "Solo puedes guardar una campaña como borrador o lista para revisar",
    );
  }

  const plannedBudget =
    body.plannedBudget === undefined ||
    body.plannedBudget === null ||
    body.plannedBudget === ""
      ? null
      : parseFiniteNumber(body.plannedBudget, "El presupuesto planeado");
  if (plannedBudget !== null && plannedBudget < 0) {
    throw ErrorFactory.InvalidRequest("El presupuesto no puede ser negativo");
  }

  const brief = String(body.brief ?? "").trim();
  if (brief.length > MAX_BRIEF_LENGTH) {
    throw ErrorFactory.InvalidRequest(
      `El resumen no puede superar ${MAX_BRIEF_LENGTH} caracteres`,
    );
  }

  return {
    productId: parseText(body.productId, "El producto", 191),
    name: parseText(
      body.name,
      "El nombre de la campaña",
      MAX_CAMPAIGN_NAME_LENGTH,
    ),
    channel,
    objective,
    status,
    seasonLabel:
      String(body.seasonLabel ?? "")
        .trim()
        .slice(0, 80) || null,
    brief: brief || null,
    plannedBudget,
  };
}

export function parseCampaignStatus(body: Record<string, unknown>) {
  const status = String(body.status ?? "") as GrowthCampaignStatus;
  if (!Object.values(GrowthCampaignStatus).includes(status)) {
    throw ErrorFactory.InvalidRequest("El estado de la campaña no es válido");
  }
  if (status === GrowthCampaignStatus.ACTIVE) {
    throw ErrorFactory.InvalidRequest(
      "Una campaña solo puede activarse después de conectar la cuenta publicitaria y confirmar el presupuesto en la plataforma correspondiente",
    );
  }
  return status;
}
