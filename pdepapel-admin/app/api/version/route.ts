import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** El commit desplegado, para que una pestaña vieja del panel sepa que hay versión nueva. */
export async function GET() {
  return NextResponse.json(
    { sha: process.env.VERCEL_GIT_COMMIT_SHA || null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
