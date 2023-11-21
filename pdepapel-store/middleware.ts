import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  publicRoutes: [
    "/",
    "/product/:path*",
    "/shop",
    "/cart",
    "/about",
    "/contact",
    "/wishlist",
    "/checkout",
    "/order/:path*",
    "/api/:path*",
    "/policies/:path*",
    "/:path*",
  ],
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
