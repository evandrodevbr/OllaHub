'use client';

import { Card } from '@/components/ui/card';
import { ExternalLink } from 'lucide-react';
import { ScrapedContent } from '@/services/webSearch';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface SourcesCarouselProps {
  sources: ScrapedContent[];
}

export function SourcesCarousel({ sources }: SourcesCarouselProps) {
  if (!sources || sources.length === 0) return null;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hasMoved, setHasMoved] = useState(false);

  // Handlers para mouse drag
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
    setHasMoved(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5; // Velocidade do scroll
    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
    
    // Se moveu mais de 3px, marca como movimento (não clique)
    if (Math.abs(walk) > 3) {
      setHasMoved(true);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    // Resetar após um pequeno delay
    setTimeout(() => setHasMoved(false), 150);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setTimeout(() => setHasMoved(false), 150);
  };

  // Handlers para touch drag (mobile)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!scrollContainerRef.current) return;
    setIsDragging(true);
    setStartX(e.touches[0].pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
    setHasMoved(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !scrollContainerRef.current) return;
    const x = e.touches[0].pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
    
    if (Math.abs(walk) > 3) {
      setHasMoved(true);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setTimeout(() => setHasMoved(false), 150);
  };

  // Prevenir navegação do link durante drag
  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (hasMoved || isDragging) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto mb-4 mt-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
        Fontes Analisadas
      </h3>
      
      <div 
        ref={scrollContainerRef}
        className={cn(
          "flex gap-3 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 mask-fade-sides",
          "cursor-grab active:cursor-grabbing select-none touch-pan-x",
          isDragging && "cursor-grabbing"
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ 
          scrollBehavior: isDragging ? 'auto' : 'smooth',
          WebkitOverflowScrolling: 'touch' // Smooth scrolling no iOS
        }}
      >
        {sources.map((source, idx) => {
            const hostname = new URL(source.url).hostname.replace('www.', '');
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
            
            return (
                <a 
                    key={idx} 
                    href={source.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    onClick={handleLinkClick}
                    className="flex-none w-40 group transition-all hover:-translate-y-1 block"
                    style={{ pointerEvents: (isDragging || hasMoved) ? 'none' : 'auto' }}
                >
                    <Card className="h-24 p-3 flex flex-col justify-between hover:shadow-md hover:border-primary/20 transition-colors bg-card/50 backdrop-blur-sm cursor-pointer overflow-hidden">
                        <div className="flex items-start justify-between min-h-0 flex-shrink-0">
                             <img 
                                src={faviconUrl} 
                                alt="" 
                                className="w-4 h-4 rounded-sm opacity-70 group-hover:opacity-100 transition-opacity flex-shrink-0" 
                                onError={(e) => (e.target as HTMLImageElement).style.display = 'none'}
                            />
                            <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1" />
                        </div>
                        
                        <div className="space-y-1 min-w-0 flex-1 overflow-hidden flex flex-col justify-end">
                            <div className="text-xs font-medium leading-tight line-clamp-2 text-card-foreground/90 group-hover:text-primary transition-colors break-words overflow-hidden text-ellipsis">
                                {source.title}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate overflow-hidden text-ellipsis">
                                {hostname}
                            </div>
                        </div>
                    </Card>
                </a>
            );
        })}
      </div>
    </div>
  );
}

