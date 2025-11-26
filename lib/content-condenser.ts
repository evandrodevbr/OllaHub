import type { ResearchEntry } from '@/hooks/use-deep-research';

export interface Chunk {
  content: string;
  score: number;
  sourceIndex: number;
  startIndex: number;
  endIndex: number;
  sourceUrl?: string;
  sourceTitle?: string;
}

export interface ProcessedContent {
  original: string;
  summarized?: string;
  chunks: Chunk[];
  keyFacts: string[];
  totalTokens: number;
}

export interface ProcessingOptions {
  maxChunkSize?: number;
  summarizeThreshold?: number;
  maxSummaryLength?: number;
}

const DEFAULT_OPTIONS: Required<ProcessingOptions> = {
  maxChunkSize: 1024,
  summarizeThreshold: 5000,
  maxSummaryLength: 2000,
};

/**
 * Sumariza conteúdo markdown mantendo estrutura e informações-chave
 * 
 * @param content - Conteúdo markdown a ser sumarizado
 * @param maxLen - Comprimento máximo do sumário
 * @returns Conteúdo sumarizado
 */
export function summarizeMarkdown(content: string, maxLen: number = 2000): string {
  if (!content || content.length <= maxLen) {
    return content;
  }

  // Dividir por headings (###, ##, #)
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  const sections: Array<{ level: number; title: string; content: string; startIndex: number }> = [];
  
  let lastIndex = 0;
  let match;
  const contentLines = content.split('\n');
  
  // Encontrar todas as seções
  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length;
    const title = match[2].trim();
    const startIndex = content.substring(0, match.index).split('\n').length - 1;
    
    // Encontrar conteúdo da seção (até próximo heading ou fim)
    let endIndex = contentLines.length;
    const nextHeadingRegex = /^(#{1,3})\s+/gm;
    nextHeadingRegex.lastIndex = match.index + match[0].length;
    const nextMatch = nextHeadingRegex.exec(content);
    if (nextMatch) {
      endIndex = content.substring(0, nextMatch.index).split('\n').length - 1;
    }
    
    const sectionContent = contentLines.slice(startIndex + 1, endIndex).join('\n').trim();
    
    sections.push({
      level,
      title,
      content: sectionContent,
      startIndex,
    });
    
    lastIndex = endIndex;
  }
  
  // Se não encontrou headings, dividir por parágrafos
  if (sections.length === 0) {
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    let summary = '';
    
    for (const para of paragraphs) {
      if (summary.length + para.length + 2 <= maxLen) {
        summary += para.trim() + '\n\n';
      } else {
        // Adicionar parte do parágrafo se ainda houver espaço
        const remaining = maxLen - summary.length - 2;
        if (remaining > 100) {
          summary += para.substring(0, remaining).trim() + '...';
        }
        break;
      }
    }
    
    return summary.trim() || content.substring(0, maxLen);
  }
  
  // Construir sumário priorizando seções de nível superior
  let summary = '';
  const sortedSections = sections.sort((a, b) => a.level - b.level);
  
  for (const section of sortedSections) {
    const sectionText = `## ${section.title}\n\n${section.content}\n\n`;
    
    if (summary.length + sectionText.length <= maxLen) {
      summary += sectionText;
    } else {
      // Adicionar parte da seção se ainda houver espaço
      const remaining = maxLen - summary.length - 50; // 50 para heading
      if (remaining > 100) {
        const truncatedContent = section.content.substring(0, remaining).trim();
        summary += `## ${section.title}\n\n${truncatedContent}...\n\n`;
      }
      break;
    }
  }
  
  return summary.trim() || content.substring(0, maxLen);
}

/**
 * Divide conteúdo markdown em chunks por seções
 * 
 * @param markdown - Conteúdo markdown
 * @param maxChunkSize - Tamanho máximo de cada chunk
 * @returns Array de chunks
 */
export function chunkBySections(
  markdown: string,
  maxChunkSize: number = 1024
): Chunk[] {
  if (!markdown || markdown.length === 0) {
    return [];
  }

  const chunks: Chunk[] = [];
  const lines = markdown.split('\n');
  
  // Dividir por headings primeiro
  const headingRegex = /^(#{1,3})\s+(.+)$/;
  let currentChunk: string[] = [];
  let currentHeading = '';
  let startIndex = 0;
  let chunkIndex = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(headingRegex);
    
    if (headingMatch) {
      // Se já temos um chunk, salvá-lo
      if (currentChunk.length > 0) {
        const chunkContent = currentChunk.join('\n');
        if (chunkContent.trim().length > 0) {
          chunks.push({
            content: chunkContent,
            score: 0, // Será calculado depois
            sourceIndex: 0, // Será atribuído depois
            startIndex: startIndex,
            endIndex: i - 1,
          });
          chunkIndex++;
        }
      }
      
      // Iniciar novo chunk
      currentHeading = line;
      currentChunk = [line];
      startIndex = i;
    } else {
      currentChunk.push(line);
      
      // Se chunk ficou muito grande, dividir por parágrafos
      const currentContent = currentChunk.join('\n');
      if (currentContent.length > maxChunkSize) {
        // Salvar chunk atual (sem a linha atual)
        const chunkWithoutLast = currentChunk.slice(0, -1).join('\n');
        if (chunkWithoutLast.trim().length > 0) {
          chunks.push({
            content: chunkWithoutLast,
            score: 0,
            sourceIndex: 0,
            startIndex: startIndex,
            endIndex: i - 1,
          });
          chunkIndex++;
        }
        
        // Iniciar novo chunk com a linha atual
        currentChunk = [currentHeading, line].filter(Boolean);
        startIndex = i;
      }
    }
  }
  
  // Adicionar último chunk
  if (currentChunk.length > 0) {
    const chunkContent = currentChunk.join('\n');
    if (chunkContent.trim().length > 0) {
      chunks.push({
        content: chunkContent,
        score: 0,
        sourceIndex: 0,
        startIndex: startIndex,
        endIndex: lines.length - 1,
      });
    }
  }
  
  // Se não encontrou headings, dividir por parágrafos
  if (chunks.length === 0) {
    const paragraphs = markdown.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    let currentChunkContent = '';
    let paraStartIndex = 0;
    
    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i].trim();
      
      if (currentChunkContent.length + para.length + 2 <= maxChunkSize) {
        currentChunkContent += (currentChunkContent ? '\n\n' : '') + para;
      } else {
        // Salvar chunk atual
        if (currentChunkContent.length > 0) {
          chunks.push({
            content: currentChunkContent,
            score: 0,
            sourceIndex: 0,
            startIndex: paraStartIndex,
            endIndex: i - 1,
          });
        }
        
        // Iniciar novo chunk
        currentChunkContent = para;
        paraStartIndex = i;
      }
    }
    
    // Adicionar último chunk
    if (currentChunkContent.length > 0) {
      chunks.push({
        content: currentChunkContent,
        score: 0,
        sourceIndex: 0,
        startIndex: paraStartIndex,
        endIndex: paragraphs.length - 1,
      });
    }
  }
  
  return chunks;
}

/**
 * Extrai fatos-chave do conteúdo (entidades, datas, números)
 * 
 * @param markdown - Conteúdo markdown
 * @returns Array de fatos extraídos
 */
export function extractKeyFacts(markdown: string): string[] {
  if (!markdown) {
    return [];
  }

  const facts: string[] = [];
  const normalized = markdown.toLowerCase();
  
  // Extrair datas (formato brasileiro: DD/MM/YYYY ou DD-MM-YYYY)
  const dateRegex = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/g;
  const dates = [...markdown.matchAll(dateRegex)];
  dates.forEach(match => {
    if (!facts.includes(match[0])) {
      facts.push(match[0]);
    }
  });
  
  // Extrair anos (4 dígitos entre 1900-2100)
  const yearRegex = /\b(19\d{2}|20[0-2]\d)\b/g;
  const years = [...markdown.matchAll(yearRegex)];
  years.forEach(match => {
    if (!facts.includes(match[0])) {
      facts.push(match[0]);
    }
  });
  
  // Extrair números relevantes (valores, estatísticas)
  // Padrão: número seguido de unidade ou contexto
  const numberPatterns = [
    /\b(\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s*(?:milhões?|milhões?|bilhões?|bilhões?|mil|km|metros?|metros?|anos?|anos?|pessoas?|habitantes?)/gi,
    /\bR\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d+)?)/gi,
    /\b(\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s*%/g,
  ];
  
  numberPatterns.forEach(pattern => {
    const matches = [...markdown.matchAll(pattern)];
    matches.forEach(match => {
      const fact = match[0].trim();
      if (fact.length > 0 && !facts.includes(fact)) {
        facts.push(fact);
      }
    });
  });
  
  // Extrair locais (padrões comuns: "em [Local]", "de [Local]", "para [Local]")
  const locationPatterns = [
    /\b(?:em|de|para|no|na|nos|nas)\s+([A-ZÁÉÍÓÚÂÊÔ][a-záéíóúâêôãõç]+(?:\s+[A-ZÁÉÍÓÚÂÊÔ][a-záéíóúâêôãõç]+)*)/g,
    /\b([A-ZÁÉÍÓÚÂÊÔ][a-záéíóúâêôãõç]+\s+(?:de\s+)?[A-ZÁÉÍÓÚÂÊÔ][a-záéíóúâêôãõç]+)\b/g,
  ];
  
  locationPatterns.forEach(pattern => {
    const matches = [...markdown.matchAll(pattern)];
    matches.forEach(match => {
      const location = match[1]?.trim();
      if (location && location.length > 3 && location.length < 50 && !facts.includes(location)) {
        // Filtrar palavras comuns que não são locais
        const commonWords = ['o', 'a', 'os', 'as', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos'];
        if (!commonWords.includes(location.toLowerCase())) {
          facts.push(location);
        }
      }
    });
  });
  
  // Limitar a 20 fatos mais relevantes
  return facts.slice(0, 20);
}

/**
 * Processa conteúdo: sumariza, extrai fatos e faz chunking
 * 
 * @param content - Conteúdo original
 * @param query - Query do usuário (para contexto)
 * @param options - Opções de processamento
 * @returns Conteúdo processado
 */
export function processContent(
  content: string,
  query: string = '',
  options: ProcessingOptions = {}
): ProcessedContent {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  if (!content || content.length === 0) {
    return {
      original: content,
      chunks: [],
      keyFacts: [],
      totalTokens: 0,
    };
  }
  
  // Sumarizar se muito longo
  let processedContent = content;
  let summarized: string | undefined;
  
  if (content.length > opts.summarizeThreshold) {
    summarized = summarizeMarkdown(content, opts.maxSummaryLength);
    processedContent = summarized;
  }
  
  // Extrair fatos-chave
  const keyFacts = extractKeyFacts(content);
  
  // Fazer chunking
  const chunks = chunkBySections(processedContent, opts.maxChunkSize);
  
  // Atribuir sourceIndex aos chunks (todos do mesmo source por enquanto)
  chunks.forEach((chunk, idx) => {
    chunk.sourceIndex = 0;
  });
  
  // Calcular tokens totais (aproximação: 1 token ≈ 4 caracteres)
  const totalTokens = Math.ceil(processedContent.length / 4);
  
  return {
    original: content,
    summarized,
    chunks,
    keyFacts,
    totalTokens,
  };
}


