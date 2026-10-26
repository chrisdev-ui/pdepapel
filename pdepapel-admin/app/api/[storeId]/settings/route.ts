import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  getStoreSettings,
  saveStoreSettings,
  storeSettingsInputSchema,
} from "@/lib/store-settings";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/server/utils";
import { requireJsonBody } from "@/lib/request-body";
import { triggerStorefrontRevalidation } from "@/lib/revalidate-store";

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const settings = await getStoreSettings(params.storeId);
    return NextResponse.json(settings, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "STORE_SETTINGS_GET");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const body = await requireJsonBody(req, "STORE_SETTINGS_PATCH");
    const parsed = storeSettingsInputSchema.safeParse(body);
    if (!parsed.success) {
      throw ErrorFactory.InvalidRequest(
        parsed.error.issues[0]?.message ?? "Revisa los datos",
        {
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
      );
    }

    await saveStoreSettings(params.storeId, parsed.data);
    // La tienda guarda estos datos 5 min; sin esto un cambio de cuenta o de horario tarda en verse.
    await triggerStorefrontRevalidation({ scope: { tags: ["storefront-settings"], paths: [] } });
    const settings = await getStoreSettings(params.storeId);
    return NextResponse.json(settings, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "STORE_SETTINGS_PATCH");
  }
}
