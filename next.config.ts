import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // All event portraits and branding are already sized web assets. Serving
  // them directly keeps the public Worker independent from the optional
  // Cloudflare Images paid binding.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
