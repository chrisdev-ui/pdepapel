import { NextResponse } from "next/server";
import { z } from "zod";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { requireJsonBody } from "@/lib/request-body";
import { CACHE_HEADERS } from "@/lib/utils";
import { sendWebPushToStore } from "@/lib/web-push";
import { safeSecretEquals } from "@/lib/webhook-auth";

/**
 * Aviso del monitoreo local (docs/monitoreo.md) a los aparatos de la dueña por
 * el mismo canal push del panel. Quien llama es un guion en el Mac, sin sesión:
 * lo autoriza un secreto propio (MONITOREO_PUSH_SECRET), y sin él la ruta no
 * existe (404). Solo manda título y texto cortos; el enlace del aviso lo fija
 * el servidor al panel, así un secreto filtrado no puede mandar a la dueña a
 * otra página.
 */
const alertSchema = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(240),
  tag: z
    .string()
    .regex(/^[a-z0-9-]{1,64}$/)
    .optional(),
});

const noCache = { headers: CACHE_HEADERS.NO_CACHE };

export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const secret = env.MONITOREO_PUSH_SECRET;
    if (!secret) return NextResponse.json({ error: "No encontrado" }, { status: 404, ...noCache });
    const token = req.headers.get("authorization")?.split("Bearer ").at(1);
    if (!safeSecretEquals(token, secret)) {
      return NextResponse.json({ error: "No tienes permisos para esta acción" }, { status: 403, ...noCache });
    }
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    const store = await prismadb.store.findUnique({ where: { id: params.storeId }, select: { id: true } });
    if (!store) throw ErrorFactory.NotFound("Tienda no encontrada");

    const parsed = alertSchema.safeParse(await requireJsonBody(req, "MONITORING_ALERT"));
    if (!parsed.success) throw ErrorFactory.InvalidRequest("El aviso necesita título (≤ 80) y texto (≤ 240).");

    const result = await sendWebPushToStore(store.id, {
      title: parsed.data.title,
      body: parsed.data.body,
      url: `/${store.id}`,
      tag: parsed.data.tag ?? "monitoreo",
    });
    return NextResponse.json(result, noCache);
  } catch (error) {
    return handleErrorResponse(error, "MONITORING_ALERT", { ...noCache, expectedStatusCodes: [400, 404] });
  }
}
