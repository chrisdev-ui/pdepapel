import "./lib/env.mjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384, 512, 768, 1024],
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        port: "",
      },
      {
        protocol: "https",
        hostname: "loremflickr.com",
        port: "",
      },
      {
        protocol: "https",
        hostname: "www.envioclickpro.com.co",
        port: "",
      },
      {
        protocol: "https",
        hostname: "www.envioclick.com",
        port: "",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:all*(svg|jpg|jpeg|png|gif|ico|webp|avif|woff2)",
        locale: false,
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/product/:slug",
        destination: "/producto/:slug",
        permanent: true,
      },
      { source: "/about", destination: "/nosotros", permanent: true },
      { source: "/shop", destination: "/tienda", permanent: true },
      { source: "/contact", destination: "/contacto", permanent: true },
      { source: "/cart", destination: "/carrito", permanent: true },
      {
        source: "/checkout",
        destination: "/finalizar-compra",
        permanent: true,
      },
      {
        source: "/wishlist",
        destination: "/favoritos",
        permanent: true,
      },
      {
        source: "/my-orders",
        destination: "/mis-pedidos",
        permanent: true,
      },
      {
        source: "/sign-in/:path*",
        destination: "/iniciar-sesion/:path*",
        permanent: true,
      },
      {
        source: "/sign-up/:path*",
        destination: "/crear-cuenta/:path*",
        permanent: true,
      },
      {
        source: "/order/:orderId",
        destination: "/pedido/:orderId",
        permanent: true,
      },
      {
        source: "/quote/:token",
        destination: "/cotizacion/:token",
        permanent: true,
      },
      {
        source: "/policies/data",
        destination: "/politicas/privacidad",
        permanent: true,
      },
      {
        source: "/policies/returns",
        destination: "/politicas/devoluciones",
        permanent: true,
      },
      {
        source: "/policies/shipping",
        destination: "/politicas/envios",
        permanent: true,
      },
    ];
  },
  experimental: {
    optimizePackageImports: [
      "@radix-ui/react-accordion",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toast",
      "@radix-ui/react-tooltip",
      "framer-motion",
    ],
    // optimizeCss: true, // Requires 'critters' package to be installed. Uncomment if installed.
  },
};

export default nextConfig;
