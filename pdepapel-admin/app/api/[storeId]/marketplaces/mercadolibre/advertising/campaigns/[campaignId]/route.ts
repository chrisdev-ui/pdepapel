import { auth } from "@clerk/nextjs";
import {
  MarketplaceCampaignActionStatus,
  MarketplaceCampaignActionType,
  MarketplaceConnectionStatus,
  MarketplaceProvider,
  Prisma,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  getMercadoLibreProductAdsOverview,
  PRODUCT_ADS_STRATEGIES,
  type MercadoLibreProductAdsCampaignUpdate,
  updateMercadoLibreProductAdsCampaign,
} from "@/lib/mercadolibre/product-ads";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

type CampaignAction = "PAUSE" | "ACTIVATE" | "UPDATE_SETTINGS";

function parseAction(value: unknown): CampaignAction {
  if (
    value === "PAUSE" ||
    value === "ACTIVATE" ||
    value === "UPDATE_SETTINGS"
  ) {
    return value;
  }
  throw ErrorFactory.InvalidRequest("La acción de publicidad no es válida");
}

function parseOptionalBudget(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const budget = Number(value);
  if (!Number.isFinite(budget) || budget <= 0 || budget > 100_000_000) {
    throw ErrorFactory.InvalidRequest(
      "El presupuesto diario debe ser mayor que cero y razonable",
    );
  }
  return budget;
}

function parseOptionalRoasTarget(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const roasTarget = Number(value);
  if (!Number.isFinite(roasTarget) || roasTarget < 1 || roasTarget > 35) {
    throw ErrorFactory.InvalidRequest(
      "El ROAS objetivo debe estar entre 1x y 35x",
    );
  }
  return roasTarget;
}

function parseOptionalStrategy(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (
    typeof value !== "string" ||
    !PRODUCT_ADS_STRATEGIES.includes(value.toLowerCase() as never)
  ) {
    throw ErrorFactory.InvalidRequest(
      "La estrategia de publicidad no es válida",
    );
  }
  return value.toLowerCase() as MercadoLibreProductAdsCampaignUpdate["strategy"];
}

function toJsonValue(value: unknown) {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

export async function PUT(
  request: Request,
  {
    params,
  }: {
    params: { storeId: string; campaignId: string };
  },
) {
  let actionRecordId: string | null = null;

  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const body = (await request.json()) as Record<string, unknown>;
    const action = parseAction(body.action);
    const campaignId = params.campaignId.trim();
    if (!campaignId)
      throw ErrorFactory.InvalidRequest("La campaña no es válida");

    const connection = await prismadb.marketplaceConnection.findUnique({
      where: {
        storeId_provider: {
          storeId: params.storeId,
          provider: MarketplaceProvider.MERCADOLIBRE,
        },
      },
      select: { id: true, siteId: true, status: true },
    });
    if (!connection) {
      throw ErrorFactory.NotFound("Primero conecta la cuenta de Mercado Libre");
    }
    if (connection.status !== MarketplaceConnectionStatus.CONNECTED) {
      throw ErrorFactory.InvalidRequest(
        "Reconecta Mercado Libre antes de modificar Product Ads",
      );
    }

    const overview = await getMercadoLibreProductAdsOverview({
      connectionId: connection.id,
      siteId: connection.siteId,
    });
    if (overview.state !== "READY") {
      throw ErrorFactory.InvalidRequest(overview.message);
    }
    const campaign = overview.campaigns.find((item) => item.id === campaignId);
    if (!campaign) {
      throw ErrorFactory.NotFound(
        "La campaña no pertenece a la cuenta conectada o ya no existe",
      );
    }

    let update: MercadoLibreProductAdsCampaignUpdate;
    let actionType: MarketplaceCampaignActionType;
    if (action === "PAUSE") {
      if (campaign.status?.toLowerCase() === "paused") {
        throw ErrorFactory.InvalidRequest("La campaña ya está pausada");
      }
      update = { status: "paused" };
      actionType = MarketplaceCampaignActionType.PAUSE;
    } else if (action === "ACTIVATE") {
      if (campaign.status?.toLowerCase() === "active") {
        throw ErrorFactory.InvalidRequest("La campaña ya está activa");
      }
      update = { status: "active" };
      actionType = MarketplaceCampaignActionType.ACTIVATE;
    } else {
      const budget = parseOptionalBudget(body.budget);
      const roasTarget = parseOptionalRoasTarget(body.roasTarget);
      const strategy = parseOptionalStrategy(body.strategy);
      update = {
        ...(budget === undefined ? {} : { budget }),
        ...(roasTarget === undefined ? {} : { roasTarget }),
        ...(strategy === undefined ? {} : { strategy }),
      };
      if (
        update.budget === undefined &&
        update.roasTarget === undefined &&
        update.strategy === undefined
      ) {
        throw ErrorFactory.InvalidRequest("Define al menos un ajuste");
      }
      actionType = MarketplaceCampaignActionType.UPDATE_SETTINGS;
    }

    actionRecordId = (
      await prismadb.marketplaceCampaignAction.create({
        data: {
          connectionId: connection.id,
          externalCampaignId: campaign.id,
          action: actionType,
          requestedBy: userId,
          before: {
            status: campaign.status,
            budget: campaign.dailyBudget ?? campaign.budget,
            roasTarget: campaign.roasTarget,
            strategy: campaign.strategy,
            lastUpdated: campaign.lastUpdated,
          },
          requested: update as Prisma.InputJsonValue,
        },
        select: { id: true },
      })
    ).id;

    const result = await updateMercadoLibreProductAdsCampaign({
      connectionId: connection.id,
      siteId: connection.siteId,
      campaignId,
      update,
    });
    await prismadb.marketplaceCampaignAction.update({
      where: { id: actionRecordId },
      data: {
        status: MarketplaceCampaignActionStatus.SUCCEEDED,
        result: toJsonValue(result),
        error: null,
      },
    });

    return NextResponse.json(
      {
        message:
          action === "PAUSE"
            ? "La campaña quedó pausada en Mercado Libre. No se generarán nuevos cobros publicitarios por esta campaña."
            : action === "ACTIVATE"
              ? "La campaña quedó activa en Mercado Libre. Podrá volver a generar cobros por clic según su presupuesto."
              : "Los ajustes de la campaña quedaron actualizados en Mercado Libre.",
        actionId: actionRecordId,
        result,
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    if (actionRecordId) {
      await prismadb.marketplaceCampaignAction
        .update({
          where: { id: actionRecordId },
          data: {
            status: MarketplaceCampaignActionStatus.FAILED,
            error: error instanceof Error ? error.message : "Error desconocido",
          },
        })
        .catch(() => undefined);
    }
    return handleErrorResponse(error, "MERCADOLIBRE_ADVERTISING_CAMPAIGN_PUT", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
