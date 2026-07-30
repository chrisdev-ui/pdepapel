import million from "million/compiler";
import "./lib/env.mjs";

const dashboardRoutePairs = [
  ["billboards", "diapositivas"],
  ["boxes", "cajas"],
  ["business-intelligence", "inteligencia-negocio"],
  ["categories", "categorias"],
  ["colors", "colores"],
  ["coupons", "cupones"],
  ["customers", "clientes"],
  ["designs", "disenos"],
  ["inventory-movements", "movimientos-inventario"],
  ["low-stock", "stock-bajo"],
  ["offers", "ofertas"],
  ["orders", "pedidos"],
  ["out-of-stock", "agotados"],
  ["posts", "publicaciones"],
  ["quotations", "cotizaciones"],
  ["restock-orders", "aprovisionamiento"],
  ["reviews", "resenas"],
  ["settings", "configuracion"],
  ["shipments", "envios"],
  ["sizes", "tamanos"],
  ["suppliers", "proveedores"],
  ["types", "tipos"],
  ["inventory", "inventario"],
  ["products", "productos"],
];

const newDashboardRoutePairs = [
  ["billboards", "diapositivas"],
  ["boxes", "cajas"],
  ["categories", "categorias"],
  ["colors", "colores"],
  ["coupons", "cupones"],
  ["designs", "disenos"],
  ["offers", "ofertas"],
  ["orders", "pedidos"],
  ["posts", "publicaciones"],
  ["products", "productos"],
  ["quotations", "cotizaciones"],
  ["restock-orders", "aprovisionamiento"],
  ["sizes", "tamanos"],
  ["suppliers", "proveedores"],
  ["types", "tipos"],
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
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
        hostname: "www.envioclick.com",
        port: "",
      },
    ],
  },
  async redirects() {
    return [
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
      ...newDashboardRoutePairs.flatMap(([sourceSegment, destinationSegment]) => [
        {
          source: `/:storeId/${sourceSegment}/new`,
          destination: `/:storeId/${destinationSegment}/nuevo`,
          permanent: true,
        },
        {
          source: `/:storeId/${destinationSegment}/new`,
          destination: `/:storeId/${destinationSegment}/nuevo`,
          permanent: true,
        },
      ]),
      {
        source: "/:storeId/banners/main/new",
        destination: "/:storeId/banners/principal/nuevo",
        permanent: true,
      },
      {
        source: "/:storeId/banners/principal/new",
        destination: "/:storeId/banners/principal/nuevo",
        permanent: true,
      },
      {
        source: "/:storeId/banners/new",
        destination: "/:storeId/banners/nuevo",
        permanent: true,
      },
      {
        source: "/:storeId/products/bulk-manage",
        destination: "/:storeId/productos/gestion-masiva",
        permanent: true,
      },
      {
        source: "/:storeId/products/new-group",
        destination: "/:storeId/productos/nuevo-grupo",
        permanent: true,
      },
      {
        source: "/:storeId/products/group/:productGroupId",
        destination: "/:storeId/productos/grupo/:productGroupId",
        permanent: true,
      },
      {
        source: "/:storeId/banners/main/:mainBannerId",
        destination: "/:storeId/banners/principal/:mainBannerId",
        permanent: true,
      },
      ...dashboardRoutePairs.flatMap(([sourceSegment, destinationSegment]) => [
        {
          source: `/:storeId/${sourceSegment}`,
          destination: `/:storeId/${destinationSegment}`,
          permanent: true,
        },
        {
          source: `/:storeId/${sourceSegment}/:path*`,
          destination: `/:storeId/${destinationSegment}/:path*`,
          permanent: true,
        },
      ]),
    ];
  },
};

const millionConfig = {
  auto: { rsc: true },
};

export default million.next(nextConfig, millionConfig);
