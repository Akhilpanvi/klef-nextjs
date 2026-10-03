/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['mongoose', 'xlsx', 'formidable'],
  },
  env: {
    NEXT_PUBLIC_PLANNING_ENABLED: process.env.PLANNING_PORTAL_ORIGIN ? 'true' : 'false',
  },
  async rewrites() {
    const origin = process.env.PLANNING_PORTAL_ORIGIN?.replace(/\/$/, '')
    if (!origin) return []
    return [
      { source: '/planning', destination: `${origin}/` },
      { source: '/planning/:path*', destination: `${origin}/:path*` },
    ]
  },
}

module.exports = nextConfig
