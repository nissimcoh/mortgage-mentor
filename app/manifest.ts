import type { MetadataRoute } from "next";

/** Lets Android and desktop browsers install the site with its own icon and colors. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MortgageMentor — מנטור משכנתא",
    short_name: "MortgageMentor",
    description: "סימולטור משכנתאות: תמהיל, תחזית החזר ולוח סילוקין.",
    lang: "he",
    dir: "rtl",
    start_url: "/he",
    scope: "/",
    display: "standalone",
    background_color: "#f5f5f7",
    theme_color: "#fafafc",
    icons: [
      { src: "/brand/mortgagementor-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/mortgagementor-1024.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
      { src: "/brand/mortgagementor.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
