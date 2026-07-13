/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export — the landing is a single client-rendered marketing page with
  // no server logic, so it deploys as static files (Cloudflare Pages). Paddle.js
  // runs client-side, unaffected.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
