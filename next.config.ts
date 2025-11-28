import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    // Adiciona suporte para raw-loader para arquivos .md
    config.module.rules.push({
      test: /\.md$/,
      use: {
        loader: 'raw-loader',
        options: {
          esModule: false,
        },
      },
    });
    return config;
  },
  // Configuração Turbopack: objeto vazio silencia o erro
  // Turbopack ainda não suporta raw-loader, então usaremos webpack para builds
  turbopack: {},
  // Aumenta timeout para builds grandes
  staticPageGenerationTimeout: 300,
};

export default nextConfig;
