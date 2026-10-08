import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        // Calculator inputs are encoded in URLs. Never forward those URLs
        // as Referer headers, including to external authentication services.
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    }];
  },
};

export default nextConfig;
