/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the workspace TS package on the fly.
  transpilePackages: ["@wax-chat/wax"],
  // Lint is run separately (`pnpm lint`); don't block builds on it here.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
