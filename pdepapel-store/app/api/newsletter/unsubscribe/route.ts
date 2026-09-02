import { NextResponse } from "next/server";

import { env } from "@/lib/env.mjs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await fetch(
      `${env.NEXT_PUBLIC_API_URL}/newsletter/unsubscribe`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
    const result = await response.json().catch(() => ({ status: "invalid" }));
    return NextResponse.json(result, { status: response.status });
  } catch (error) {
    console.error("[STOREFRONT_NEWSLETTER_UNSUBSCRIBE_POST]", error);
    return NextResponse.json({ status: "error" }, { status: 502 });
  }
}
