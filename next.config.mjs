/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Native sharp binary for `/api/convert-heic` on Vercel & local Node (HEIC via libvips). */
  serverExternalPackages: ["sharp"],

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "oaidalleapiprodscus.blob.core.windows.net" },
      { protocol: "https", hostname: "**" },
    ],
  },

  // Empty turbopack config silences the "webpack config ignored" warning
  turbopack: {},
};

export default nextConfig;
