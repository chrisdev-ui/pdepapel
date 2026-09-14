import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  getPresaleCustomers,
  recordPresaleDelayNotice,
} from "@/lib/presale-release";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/**
 * Avisar de un retraso.
 *
 * El sistema avisa y deja constancia de quién y cuándo, por si una clienta
 * reclama después. **Las devoluciones de dinero se hacen a mano** en Bold o
 * Wompi, igual que cualquier otra: aquí no se cancela ningún pedido ni se
 * mueve plata. Es una decisión, no un pendiente.
 */

async function authorize(storeId: string, presaleId: string) {
  const { userId } = await auth();
  if (!userId) throw ErrorFactory.Unauthenticated();
  if (!storeId) throw ErrorFactory.MissingStoreId();
  if (!presaleId) throw ErrorFactory.InvalidRequest("El ID de la preventa es requerido");
  await verifyStoreOwner(userId, storeId);
  return userId;
}

/** A quién se le va a escribir, para poder mostrarlo antes de mandar. */
export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; presaleId: string } },
) {
  try {
    await authorize(params.storeId, params.presaleId);
    const customers = await getPresaleCustomers(params.storeId, params.presaleId);

    return NextResponse.json(
      { customers, total: customers.length },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "PRESALE_DELAY_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 404],
    });
  }
}

export async function POST(
  _req: Request,
  { params }: { params: { storeId: string; presaleId: string } },
) {
  try {
    const userId = await authorize(params.storeId, params.presaleId);

    const customers = await getPresaleCustomers(params.storeId, params.presaleId);
    if (customers.length === 0) {
      throw ErrorFactory.InvalidRequest(
        "Esta preventa no tiene clientas esperando, así que no hay a quién avisar",
      );
    }

    const presale = await recordPresaleDelayNotice({
      storeId: params.storeId,
      presaleId: params.presaleId,
      notifiedBy: userId,
    });

    return NextResponse.json(
      { ...presale, notified: customers.length, customers },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "PRESALE_DELAY_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 404],
    });
  }
}
