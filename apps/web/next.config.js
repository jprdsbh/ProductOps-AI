/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.API_URL || 'http://localhost:3002',
    NEXT_PUBLIC_TBOT_URL: process.env.TBOT_URL || 'http://localhost:8000',
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL || 'http://localhost:3002'}/api/:path*`,
      },
    ];
  },
  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ];
    return [
      // Cabeçalhos de segurança em todas as rotas
      { source: '/:path*', headers: securityHeaders },
      // Admin: nunca indexar (reforça o robots.txt) + sem cache
      {
        source: '/admin/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      { source: '/admin', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }] },
    ];
  },
};

module.exports = nextConfig;
