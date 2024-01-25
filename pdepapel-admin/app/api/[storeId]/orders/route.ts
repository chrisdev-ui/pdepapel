import { EmailTemplate } from "@/components/email-template";
import { authenticateUser, isUserAuthorized } from "@/helpers/auth";
import {
  createOrder,
  getOrdersByStoreId,
  isUserAuthorizedToCreateNewOrder,
} from "@/helpers/orders-actions";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { resend } from "@/lib/resend";
import { OrderBody } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

interface Params {
  storeId: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: Request, { params }: { params: Params }) {
  if (!params.storeId)
    return handleErrorResponse("Store ID is required", 400, corsHeaders);
  try {
    const body: OrderBody = await req.json();
    const missingFields = validateMandatoryFields(body, [
      "fullName",
      "phone",
      "address",
      "orderItems",
    ]);
    if (missingFields)
      return handleErrorResponse(
        `Missing fields: ${missingFields.join(", ")}`,
        400,
        corsHeaders,
      );
    const authenticatedUserId = await authenticateUser(
      body.userId as string | null,
      body.guestId as string | null,
    );
    if (!authenticatedUserId)
      return handleErrorResponse("Unauthenticated", 401, corsHeaders);
    const isStoreOwner = isUserAuthorized(authenticatedUserId, params.storeId);
    if (!isStoreOwner) {
      const isAuthorized = await isUserAuthorizedToCreateNewOrder(
        authenticatedUserId,
        params.storeId,
      );
      if (!isAuthorized)
        return handleErrorResponse("Too many orders", 429, corsHeaders);
    }
    const order = await createOrder({
      ...body,
      userId: body?.userId || authenticatedUserId,
      storeId: params.storeId,
    });
    if (!isStoreOwner) {
      await resend.emails.send({
        from: "Orders <admin@papeleriapdepapel.com>",
        to: ["web.christian.dev@gmail.com", "papeleria.pdepapel@gmail.com"],
        subject: `Nueva orden de compra - ${body.fullName}`,
        react: EmailTemplate({
          name: order.fullName,
          phone: order.phone,
          address: order.address,
          orderNumber: order.orderNumber,
          paymentMethod: "Transferencia bancaria o contra entrega",
        }) as React.ReactElement,
      });
    }
    return handleSuccessResponse(order, 200, corsHeaders);
  } catch (error) {
    console.log("[ORDERS_POST]", error);
    return handleErrorResponse("[ORDERS_POST_ERROR]", 500, corsHeaders);
  }
}

export async function GET(req: NextRequest, { params }: { params: Params }) {
  if (!params.storeId)
    return handleErrorResponse("Store ID is required", 400, corsHeaders);
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    const guestId = req.nextUrl.searchParams.get("guestId");
    const orders = await getOrdersByStoreId(params.storeId, userId, guestId);
    return handleSuccessResponse(orders, 200, corsHeaders);
  } catch (error) {
    console.log("[ORDERS_GET]", error);
    return handleErrorResponse("[ORDERS_GET_ERROR]", 500, corsHeaders);
  }
}
