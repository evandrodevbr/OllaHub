"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Search, FileText } from "lucide-react";
import { useWebSearch } from "@/hooks/use-web-search";

export function ScrapingProgressIndicator() {
  const webSearch = useWebSearch();
  
  // Não mostrar se idle ou completed
  if (webSearch.status === 'idle' || webSearch.status === 'completed') {
    return null;
  }
  
  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.9 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="fixed bottom-24 right-6 bg-card border border-primary/20 rounded-lg p-4 shadow-lg backdrop-blur-sm z-50 min-w-[280px]"
      >
        <div className="flex items-start gap-3">
          {/* Icon animado */}
          <div className="flex-shrink-0 mt-0.5">
            {webSearch.status === 'searching' && (
              <Search className="w-5 h-5 text-primary animate-pulse" />
            )}
            {webSearch.status === 'scraping' && (
              <FileText className="w-5 h-5 text-primary animate-pulse" />
            )}
            {webSearch.status === 'error' && (
              <div className="w-5 h-5 rounded-full bg-destructive/20 flex items-center justify-center">
                <span className="text-destructive text-xs font-bold">!</span>
              </div>
            )}
          </div>
          
          {/* Content */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <p className="text-sm font-medium">
                {webSearch.status === 'searching' && 'Buscando fontes...'}
                {webSearch.status === 'scraping' && `Analisando fontes (${webSearch.scrapedSources.length})...`}
                {webSearch.status === 'error' && 'Erro na busca'}
              </p>
            </div>
            
            {/* Mostrar query atual se disponível */}
            {webSearch.currentQuery && webSearch.status !== 'error' && (
              <p className="text-xs text-muted-foreground line-clamp-1">
                {webSearch.currentQuery}
              </p>
            )}
            
            {/* Mostrar erro se houver */}
            {webSearch.error && webSearch.status === 'error' && (
              <p className="text-xs text-destructive line-clamp-2">
                {webSearch.error}
              </p>
            )}
            
            {/* Barra de progresso simulada */}
            {webSearch.status !== 'error' && (
              <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: "0%" }}
                  animate={{
                    width: webSearch.status === 'searching' ? "40%" : "80%"
                  }}
                  transition={{
                    duration: 2,
                    ease: "easeInOut"
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}



