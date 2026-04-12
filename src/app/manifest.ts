import type { MetadataRoute } from "next";

const isDev = process.env.NEXT_PUBLIC_APP_ENV === "development";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: isDev ? "My Recipes (dev)" : "My Recipes",
    short_name: isDev ? "Recipes (dev)" : "Recipes",
    description: "Your personal recipe collection, meal planner, and shopping list",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f0d0b",
    theme_color: "#C9651A",
    icons: [
      { src: "/icons/icon-72x72.png",   sizes: "72x72",   type: "image/png" },
      { src: "/icons/icon-96x96.png",   sizes: "96x96",   type: "image/png" },
      { src: "/icons/icon-128x128.png", sizes: "128x128", type: "image/png" },
      { src: "/icons/icon-144x144.png", sizes: "144x144", type: "image/png" },
      { src: "/icons/icon-152x152.png", sizes: "152x152", type: "image/png" },
      { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-384x384.png", sizes: "384x384", type: "image/png" },
      { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    categories: ["food", "lifestyle", "utilities"],
  };
}
