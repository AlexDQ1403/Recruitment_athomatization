/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // gzip de las respuestas (activo por defecto; explícito para que no se pierda)
  compress: true,
  async headers() {
    return [
      {
        // El logo cambia muy poco: un día en caché y revalidación en segundo plano
        source: '/brand/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
    ];
  },
};

module.exports = nextConfig;
