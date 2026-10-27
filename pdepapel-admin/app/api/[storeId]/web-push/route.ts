import { NextResponse } from "next/server";
import { z } from "zod";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { requireJsonBody } from "@/lib/request-body";
import { requireStoreOwner } from "@/lib/store-access";
import { CACHE_HEADERS } from "@/lib/utils";
import { MAX_WEB_PUSH_SUBSCRIPTIONS_PER_STORE, describePushDevice, getWebPushConfig, hashPushEndpoint } from "@/lib/web-push";

/**
 * Avisos push del panel en los aparatos de la dueña («Activar avisos en este
 * aparato», Configuración). Solo la dueña: una cuenta de solo lectura no
 * recibe avisos de conversaciones que no puede abrir.
 */
const base64url = z.string().min(1).max(255).regex(/^[A-Za-z0-9_-]+=*$/);
const endpoint = z
  .string()
  .max(2048)
  .url()
  .refine((value) => value.startsWith("https://"), "El aviso necesita una dirección https");

const subscribeSchema = z.object({
  endpoint,
  keys: z.object({ p256dh: base64url, auth: base64url }),
});
const unsubscribeSchema = z.object({ endpoint });

const noCache = { headers: CACHE_HEADERS.NO_CACHE };

export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await requireStoreOwner(params.storeId);
    const config = getWebPushConfig();
    const devices = await prismadb.webPushSubscription.count({ where: { storeId: params.storeId } });
    return NextResponse.json(
      { configured: Boolean(config), publicKey: config?.publicKey ?? null, devices, max: MAX_WEB_PUSH_SUBSCRIPTIONS_PER_STORE },
      noCache,
    );
  } catch (error) {
    return handleErrorResponse(error, "WEB_PUSH_STATUS", noCache);
  }
}

export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    const userId = await requireStoreOwner(params.storeId);
    if (!getWebPushConfig()) throw ErrorFactory.InvalidRequest("Los avisos push no están configurados en el panel.");
    const parsed = subscribeSchema.safeParse(await requireJsonBody(req, "WEB_PUSH_SUBSCRIBE"));
    if (!parsed.success) throw ErrorFactory.InvalidRequest("El navegador mandó una suscripción que no se entiende.");

    const endpointHash = hashPushEndpoint(parsed.data.endpoint);
    const others = await prismadb.webPushSubscription.count({ where: { storeId: params.storeId, endpointHash: { not: endpointHash } } });
    const existing = await prismadb.webPushSubscription.findUnique({ where: { endpointHash }, select: { storeId: true } });
    if (others >= MAX_WEB_PUSH_SUBSCRIPTIONS_PER_STORE && existing?.storeId !== params.storeId) {
      throw ErrorFactory.Conflict(`Ya hay ${MAX_WEB_PUSH_SUBSCRIPTIONS_PER_STORE} aparatos con avisos. Desactiva uno antes de agregar otro.`);
    }
    const data = {
      storeId: params.storeId,
      userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      deviceLabel: describePushDevice(req.headers.get("user-agent")),
      failureCount: 0,
    };
    await prismadb.webPushSubscription.upsert({ where: { endpointHash }, create: { endpointHash, ...data }, update: data });
    return NextResponse.json({ ok: true }, noCache);
  } catch (error) {
    return handleErrorResponse(error, "WEB_PUSH_SUBSCRIBE", { ...noCache, expectedStatusCodes: [400, 409] });
  }
}

export async function DELETE(req: Request, { params }: { params: { storeId: string } }) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await requireStoreOwner(params.storeId);
    const parsed = unsubscribeSchema.safeParse(await requireJsonBody(req, "WEB_PUSH_UNSUBSCRIBE"));
    if (!parsed.success) throw ErrorFactory.InvalidRequest("Falta la suscripción que se quiere desactivar.");
    const { count } = await prismadb.webPushSubscription.deleteMany({
      where: { storeId: params.storeId, endpointHash: hashPushEndpoint(parsed.data.endpoint) },
    });
    return NextResponse.json({ removed: count }, noCache);
  } catch (error) {
    return handleErrorResponse(error, "WEB_PUSH_UNSUBSCRIBE", { ...noCache, expectedStatusCodes: [400] });
  }
}
