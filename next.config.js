/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['mongoose', 'xlsx', 'formidable'],
  },
}

module.exports = nextConfig
