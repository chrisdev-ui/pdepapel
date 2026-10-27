import type { MetadataRoute } from "next";

/**
 * Para «Agregar a pantalla de inicio»: en iPhone y iPad (iOS 16.4+) los avisos
 * push solo llegan a la app instalada así, no a Safari.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "P de Papel · Panel",
    short_name: "P de Papel",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
