import { getUserId } from "@/helpers/auth";
import { handleErrorResponse } from "@/helpers/response";
import { createNewStore } from "@/helpers/stores-actions";
import { validateMandatoryFields } from "@/helpers/validation";
import { StoreBody } from "@/lib/types";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const userId = getUserId();
    if (!userId) return handleErrorResponse("Unauthenticated", 401);
    const body: StoreBody = await req.json();
    const missingFields = validateMandatoryFields(body, ["name"]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
      );
    const store = await createNewStore({
      ...body,
      userId,
    });
    return NextResponse.json(store);
  } catch (error) {
    console.log("[STORES_POST]", error);
    return handleErrorResponse("[STORES_POST_ERROR]", 500);
  }
}
