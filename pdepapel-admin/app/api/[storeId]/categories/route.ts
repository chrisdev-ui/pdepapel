import { getUserId, isUserAuthorized } from "@/helpers/auth";
import {
  createNewCategory,
  getCategoriesByStoreId,
} from "@/helpers/categories-actions";
import { handleErrorResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { CategoryBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
}

export async function POST(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const body: CategoryBody = await req.json();
    const missingFields = validateMandatoryFields(body, ["name", "typeId"]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const category = await createNewCategory({
      ...body,
      storeId: params.storeId,
    });
    return NextResponse.json(category);
  } catch (error) {
    console.log("[CATEGORIES_POST]", error);
    return handleErrorResponse("[CATEGORIES_POST_ERROR]", 500);
  }
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const categories = await getCategoriesByStoreId(params.storeId);
    return NextResponse.json(categories);
  } catch (error) {
    console.log("[CATEGORIES_GET]", error);
    return handleErrorResponse("[CATEGORIES_GET_ERROR]", 500);
  }
}
