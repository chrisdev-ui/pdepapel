import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { expiryFrom, generatePairingCode, pairingUrl } from "@/lib/scanner-pairing";
import { verifyStoreOwner } from "@/lib/utils";

/**
 * La pantalla abre una sesión de escáner remoto: devuelve el código corto y el
 * enlace que va en el QR. Vence a los 10 minutos sin actividad.
 */
export async function POST(req: NextRequest, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const now = Date.now();
    // El código es único por tienda; con 31^6 combinaciones la colisión es rarísima,
    // pero se reintenta por si acaso en vez de fallar.
    let session = null;
    for (let attempt = 0; attempt < 5 && !session; attempt += 1) {
      const code = generatePairingCode((bound) => randomInt(bound));
      const taken = await prismadb.scannerSession.findUnique({
        where: { storeId_code: { storeId: params.storeId, code } },
        select: { id: true },
      });
      if (taken) continue;
      session = await prismadb.scannerSession.create({
        data: { storeId: params.storeId, code, createdByUserId: userId, expiresAt: expiryFrom(now) },
        select: { code: true, expiresAt: true },
      });
    }
    if (!session) throw ErrorFactory.Conflict("No se pudo generar un código; inténtalo de nuevo.");

    return NextResponse.json({
      code: session.code,
      expiresAt: session.expiresAt,
      pairUrl: pairingUrl(req.nextUrl.origin, params.storeId, session.code),
    });
  } catch (error) {
    return handleErrorResponse(error, "SCANNER_SESSION_POST");
  }
}
