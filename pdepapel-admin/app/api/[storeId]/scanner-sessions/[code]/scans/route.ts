import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { expiryFrom, normalizePairingCode, PROBLEM_MESSAGES, scanProblem } from "@/lib/scanner-pairing";
import { verifyStoreOwner } from "@/lib/utils";

/**
 * El celular envía una lectura. Solo el celular con el token vigente puede;
 * cada lectura renueva los 10 minutos. La pantalla la recoge en su siguiente
 * consulta y la resuelve a producto por el mismo camino que la cámara local.
 */
export async function POST(req: NextRequest, { params }: { params: { storeId: string; code: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const body = (await req.json().catch(() => ({}))) as { token?: unknown; code?: unknown };
    const token = typeof body.token === "string" ? body.token : null;
    const scanned = typeof body.code === "string" ? body.code.trim() : "";
    if (!scanned) throw ErrorFactory.InvalidRequest("Falta el código leído");
    if (scanned.length > 191) throw ErrorFactory.InvalidRequest("El código leído es demasiado largo");

    const code = normalizePairingCode(params.code);
    const session = await prismadb.scannerSession.findUnique({
      where: { storeId_code: { storeId: params.storeId, code } },
      select: { id: true, pairedAt: true, expiresAt: true, revokedAt: true, pairingToken: true },
    });
    if (!session) throw ErrorFactory.NotFound("Ese código de vinculación no existe.");
    const problem = scanProblem(session, token);
    if (problem) throw ErrorFactory.Conflict(PROBLEM_MESSAGES[problem], { code: problem });

    const now = Date.now();
    const [scan] = await prismadb.$transaction([
      prismadb.scannerScan.create({ data: { sessionId: session.id, code: scanned }, select: { id: true, createdAt: true } }),
      prismadb.scannerSession.update({
        where: { id: session.id },
        data: { lastActivityAt: new Date(now), expiresAt: expiryFrom(now) },
        select: { id: true },
      }),
    ]);

    return NextResponse.json({ ok: true, scanId: scan.id, createdAt: scan.createdAt, expiresAt: expiryFrom(now) });
  } catch (error) {
    return handleErrorResponse(error, "SCANNER_SESSION_SCAN");
  }
}
