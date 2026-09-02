import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  resendNewsletterConfirmation,
  unsubscribeNewsletterSubscriber,
} from "@/lib/newsletter";
import { verifyStoreOwner } from "@/lib/utils";

const actionSchema = z.object({
  action: z.enum(["resend_confirmation", "unsubscribe"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: { storeId: string; subscriberId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ message: "No autenticado" }, { status: 401 });
    }
    await verifyStoreOwner(userId, params.storeId);

    const body = actionSchema.parse(await request.json());
    if (body.action === "resend_confirmation") {
      await resendNewsletterConfirmation(params.storeId, params.subscriberId);
    } else {
      await unsubscribeNewsletterSubscriber(
        params.storeId,
        params.subscriberId,
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No fue posible actualizar";
    return NextResponse.json({ message }, { status: 400 });
  }
}
