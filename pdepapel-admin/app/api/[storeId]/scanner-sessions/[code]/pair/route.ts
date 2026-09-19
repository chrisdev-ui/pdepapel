import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { describeDevice, expiryFrom, normalizePairingCode, pairingProblem, PROBLEM_MESSAGES } from "@/lib/scanner-pairing";
import { verifyStoreOwner } from "@/lib/utils";

/**
 * El celular se vincula. Exige la misma sesión de Clerk que el panel: el
 * código solo empareja pantallas, no autoriza a nadie. Volver a vincular con
 * el mismo código cambia el token y el celular anterior deja de enviar.
 */
export async function POST(req: NextRequest, { params }: { params: { storeId: string; code: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const code = normalizePairingCode(params.code);
    const session = await prismadb.scannerSession.findUnique({
      where: { storeId_code: { storeId: params.storeId, code } },
      select: { id: true, pairedAt: true, expiresAt: true, revokedAt: true, pairingToken: true },
    });
    if (!session) throw ErrorFactory.NotFound("Ese código de vinculación no existe. Revisa la pantalla.");
    const problem = pairingProblem(session);
    if (problem) throw ErrorFactory.Conflict(PROBLEM_MESSAGES[problem], { code: problem });

    const now = Date.now();
    const token = randomBytes(24).toString("hex");
    const deviceLabel = describeDevice(req.headers.get("user-agent"));
    const paired = await prismadb.scannerSession.update({
      where: { id: session.id },
      data: {
        pairedUserId: userId,
        pairingToken: token,
        deviceLabel,
        pairedAt: new Date(now),
        lastActivityAt: new Date(now),
        expiresAt: expiryFrom(now),
      },
      select: { expiresAt: true },
    });

    return NextResponse.json({ token, deviceLabel, expiresAt: paired.expiresAt, replaced: Boolean(session.pairingToken) });
  } catch (error) {
    return handleErrorResponse(error, "SCANNER_SESSION_PAIR");
  }
}
