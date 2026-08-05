import { authMiddleware } from "@clerk/nextjs";

export const publicRoutes = [
  "/api/:path*",
  "/iniciar-sesion(.*)",
  "/crear-cuenta(.*)",
];

export default authMiddleware({
  publicRoutes,
  signInUrl: "/iniciar-sesion",
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
