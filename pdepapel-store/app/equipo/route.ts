import { NextRequest, NextResponse } from "next/server";

import { TEAM_BROWSER_COOKIE, TEAM_BROWSER_MAX_AGE_SECONDS } from "@/lib/team-browser";
import { verifyTeamBrowserToken } from "@/lib/team-browser-token";

export const dynamic = "force-dynamic";

/**
 * `/equipo?t=…` marca este navegador como del equipo (enlace firmado que
 * genera la dueña en el panel); `/equipo?salir=1` quita la marca. Siempre
 * vuelve a Inicio, con o sin marca: un enlace vencido no muestra error.
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const home = new URL("/", request.nextUrl.origin);
  const response = NextResponse.redirect(home, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");

  if (params.get("salir") === "1") {
    response.cookies.set(TEAM_BROWSER_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  }

  if (verifyTeamBrowserToken(params.get("t"))) {
    response.cookies.set(TEAM_BROWSER_COOKIE, "1", {
      path: "/",
      maxAge: TEAM_BROWSER_MAX_AGE_SECONDS,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      // La lee el navegador para decidir la analítica: no puede ser HttpOnly.
      httpOnly: false,
    });
  }
  return response;
}
