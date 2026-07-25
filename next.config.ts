import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Portraits, branding, and uploaded outfit photos are already prepared for
  // the web. Serving them directly also keeps dynamic photo routes portable.
  images: {
    unoptimized: true,
  },
  poweredByHeader: false,
};

export default nextConfig;
