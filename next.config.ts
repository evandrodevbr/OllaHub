import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
<<<<<<< HEAD
  webpack: (config, { isServer, webpack }) => {
    // Garantir que config.module e config.module.rules existam
    if (!config.module) {
      config.module = { rules: [] };
    }
    if (!config.module.rules) {
      config.module.rules = [];
    }
    
=======
  webpack: (config) => {
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
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
    
    // Desabilitar source maps completamente para evitar problemas com stack traces
    // O erro "ignore-listed frames" está relacionado ao processamento de source maps
    config.devtool = false;
    
    // Configurar ignoreWarnings para evitar erros relacionados a stack traces
    if (!config.ignoreWarnings) {
      config.ignoreWarnings = [];
    }
    
    // Ignorar avisos relacionados a módulos não encontrados ou problemas de parsing
    config.ignoreWarnings.push(
      /Failed to parse source map/,
      /Can't resolve/,
      /ignore-listed/,
    );
    
    // Configurar stats para reduzir verbosidade e evitar problemas com stack traces
    if (!config.stats) {
      config.stats = {};
    }
    config.stats.errorDetails = false;
    config.stats.errorStack = false;
    
    return config;
  },
  // Configuração Turbopack: objeto vazio silencia o erro
  // Turbopack ainda não suporta raw-loader, então usaremos webpack para builds
  turbopack: {},
  // Aumenta timeout para builds grandes
  staticPageGenerationTimeout: 300,
};

export default nextConfig;
