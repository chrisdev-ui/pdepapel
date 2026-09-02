import { auth } from "@clerk/nextjs";
import { NewsletterSubscriberStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function GET(
  _request: Request,
  { params }: { params: { storeId: string } },
) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ message: "No autenticado" }, { status: 401 });
  }
  await verifyStoreOwner(userId, params.storeId);

  const subscribers = await prismadb.newsletterSubscriber.findMany({
    where: {
      storeId: params.storeId,
      status: NewsletterSubscriberStatus.ACTIVE,
    },
    orderBy: { confirmedAt: "desc" },
  });
  const rows = [
    ["correo", "fecha_confirmacion", "origen"],
    ...subscribers.map((subscriber) => [
      subscriber.email,
      subscriber.confirmedAt?.toISOString() ?? "",
      subscriber.source ?? "",
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": `attachment; filename="suscriptores-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
