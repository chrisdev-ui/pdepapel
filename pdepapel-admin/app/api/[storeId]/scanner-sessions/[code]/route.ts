import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { normalizePairingCode, REMOTE_SCAN_PAGE, sessionStatus } from "@/lib/scanner-pairing";
import { verifyStoreOwner } from "@/lib/utils";

type Params = { params: { storeId: string; code: string } };

/**
 * Lo que la pantalla consulta cada 1,5 s: el estado de la vinculación y las
 * lecturas nuevas desde `after` (el `createdAt` de la última que vio).
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const code = normalizePairingCode(params.code);
    const session = await prismadb.scannerSession.findUnique({
      where: { storeId_code: { storeId: params.storeId, code } },
      select: { id: true, code: true, deviceLabel: true, pairedAt: true, expiresAt: true, revokedAt: true, lastActivityAt: true },
    });
    if (!session) throw ErrorFactory.NotFound("Ese código de vinculación no existe.");

    const afterRaw = req.nextUrl.searchParams.get("after");
    const after = afterRaw && !Number.isNaN(Date.parse(afterRaw)) ? new Date(afterRaw) : null;
    const scans = await prismadb.scannerScan.findMany({
      where: { sessionId: session.id, ...(after ? { createdAt: { gt: after } } : {}) },
      orderBy: { createdAt: "asc" },
      take: REMOTE_SCAN_PAGE,
      select: { id: true, code: true, createdAt: true },
    });

    return NextResponse.json({
      code: session.code,
      status: sessionStatus(session),
      deviceLabel: session.deviceLabel,
      pairedAt: session.pairedAt,
      expiresAt: session.expiresAt,
      lastActivityAt: session.lastActivityAt,
      scans,
    });
  } catch (error) {
    return handleErrorResponse(error, "SCANNER_SESSION_GET");
  }
}

/** «Desvincular»: la sesión deja de aceptar lecturas y el celular lo verá en su siguiente envío. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const code = normalizePairingCode(params.code);
    const session = await prismadb.scannerSession.findUnique({
      where: { storeId_code: { storeId: params.storeId, code } },
      select: { id: true },
    });
    if (!session) throw ErrorFactory.NotFound("Ese código de vinculación no existe.");
    await prismadb.scannerSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), pairingToken: null },
    });
    return NextResponse.json({ status: "revoked" });
  } catch (error) {
    return handleErrorResponse(error, "SCANNER_SESSION_DELETE");
  }
}
