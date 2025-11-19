import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.md$/,
      use: 'raw-loader',
    });
    return config;
  },
  // Configuração Turbopack: objeto vazio silencia o erro
  // Turbopack ainda não suporta raw-loader, então usaremos webpack para builds
  turbopack: {},
};

export default nextConfig;
