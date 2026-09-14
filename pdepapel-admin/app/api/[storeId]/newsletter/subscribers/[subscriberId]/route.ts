import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
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
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
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
    // Antes esto devolvía 400 con `error.message` para CUALQUIER fallo: un
    // ZodError salía como su JSON crudo, ilegible, y una caída de la base
    // también se reportaba como «solicitud inválida». El manejador común da el
    // código que corresponde y, en validación, el mensaje del campo.
    return handleErrorResponse(error, "NEWSLETTER_SUBSCRIBER_PATCH", {
      expectedStatusCodes: [400, 401, 403, 404],
    });
  }
}
