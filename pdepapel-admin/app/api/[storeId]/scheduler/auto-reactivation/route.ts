import { NextResponse } from "next/server";
import { processAutomaticReactivations } from "@/lib/reactivation";

export const maxDuration = 300; // Allow 5 minutes execution time for Vercel Hobby

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const authHeader = req.headers.get("authorization");
    const secret = process.env.SCHEDULER_SECRET;

    if (!secret || authHeader !== `Bearer ${secret}`) {
      console.warn(
        "[SCHEDULER_UNAUTHORIZED] Invalid or missing SCHEDULER_SECRET",
      );
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!params.storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    // Process reactivations
    const result = await processAutomaticReactivations(params.storeId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[AUTO_REACTIVATION_SCHEDULER]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
