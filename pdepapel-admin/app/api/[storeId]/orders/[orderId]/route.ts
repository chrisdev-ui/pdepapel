import { getUserId, isUserAuthorized } from "@/helpers/auth";
import {
  deleteOrderById,
  getOrder,
  getOrderById,
  updateOrder,
} from "@/helpers/orders-actions";
import { updateVariantStock } from "@/helpers/product-variants-actions";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { OrderBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
  orderId: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.orderId)
    return handleErrorResponse("Order ID is required", 400, corsHeaders);
  if (!params.storeId)
    return handleErrorResponse("Store ID is required", 400, corsHeaders);
  try {
    const order = await getOrderById(params.orderId);
    if (!order) return handleErrorResponse("Order not found", 404, corsHeaders);
    return handleSuccessResponse(order, 200, corsHeaders);
  } catch (error) {
    console.log("[ORDER_GET]", error);
    return handleErrorResponse("[ORDER_GET_ERROR]", 500, corsHeaders);
  }
}

export async function PATCH(req: Request, { params }: { params: Params }) {
  const ownerId = getUserId();
  if (!ownerId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.orderId)
    return handleErrorResponse("Order ID is required", 400, corsHeaders);
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
    const isAuthorized = await isUserAuthorized(ownerId, params.storeId);
    if (!isAuthorized)
      return handleErrorResponse("Unauthorized", 403, corsHeaders);
    const order = await getOrder(params.orderId);
    if (!order) return handleErrorResponse("Order not found", 404, corsHeaders);
    const updatedOrder = await updateOrder(order.id, params.storeId, body);
    if (updatedOrder) {
      await updateVariantStock(updatedOrder, order);
    }
    return handleSuccessResponse(updatedOrder);
  } catch (error) {
    console.log("[ORDER_PATCH]", error);
    return handleErrorResponse("[ORDER_PATCH_ERROR]", 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.orderId)
    return handleErrorResponse("Order ID is required", 400, corsHeaders);
  if (!params.storeId)
    return handleErrorResponse("Store ID is required", 400, corsHeaders);
  try {
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    await deleteOrderById(params.orderId, params.storeId);
    return handleSuccessResponse("Order was successfully deleted!");
  } catch (error) {
    console.log("[ORDER_DELETE]", error);
    return handleErrorResponse("[ORDER_DELETE_ERROR]", 500);
  }
}
