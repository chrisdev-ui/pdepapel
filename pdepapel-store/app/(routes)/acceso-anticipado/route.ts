import { NextRequest, NextResponse } from "next/server";

import { EARLY_ACCESS_COOKIE } from "@/lib/early-access";
import { env } from "@/lib/env.mjs";
import { STOREFRONT_ROUTES } from "@/lib/routes";

export const dynamic = "force-dynamic";

// Enlace del correo de acceso anticipado: valida el token con el panel, guarda
// la cookie y lleva a la lista de lo que viene.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const target = new URL(STOREFRONT_ROUTES.comingSoon, request.nextUrl.origin);

  if (!token) {
    target.searchParams.set("acceso", "invalido");
    return NextResponse.redirect(target);
  }

  try {
    const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/early-access?token=${encodeURIComponent(token)}`, { cache: "no-store" });
    const data = (await response.json().catch(() => null)) as { valid?: boolean; expiresAt?: string } | null;
    if (!response.ok || !data?.valid) {
      target.searchParams.set("acceso", "invalido");
      return NextResponse.redirect(target);
    }

    target.searchParams.set("acceso", "ok");
    const redirect = NextResponse.redirect(target);
    redirect.cookies.set(EARLY_ACCESS_COOKIE, token, {
      path: "/",
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      expires: data.expiresAt ? new Date(data.expiresAt) : undefined,
    });
    return redirect;
  } catch {
    target.searchParams.set("acceso", "invalido");
    return NextResponse.redirect(target);
  }
}
