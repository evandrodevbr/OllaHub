'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  Check, 
  Brain, 
  Search, 
  Settings, 
  FileText,
  Globe,
  Clock,
  Database,
  Code2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Message } from '@/hooks/use-chat';
import type { DeepResearchState } from '@/hooks/use-deep-research';
import type { ScrapedContent } from '@/services/webSearch';

export interface DebugData {
  model: string;
  timestamp: number;
  latency?: number;
  systemPrompt: string;
  userQuery: string;
  contextUsed: Message[];
  webResearch?: {
    queries: string[];
    enrichedQueries?: {
      literal: string[];
      semantic: string[];
      related: string[];
      expanded: string[];
      contextual: string[];
    };
    sources: ScrapedContent[];
    logs: Array<{
      stage: string;
      timestamp: number;
      input: string;
      rawOutput?: string;
      parsedOutput?: any;
      error?: string;
    }>;
    plan?: string[];
    knowledgeBase?: Array<{
      sourceUrl: string;
      title: string;
      content: string;
    }>;
  };
  deepResearchState?: DeepResearchState;
  finalResponse: string;
  rawResponse?: string;
  tokenUsage?: {
    input: number;
    output: number;
  };
}

interface DebugConsoleProps {
  data: DebugData;
}

export function DebugConsole({ data }: DebugConsoleProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const copyFullDump = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const isExpanded = (section: string) => expandedSections.has(section);

  return (
    <div className="mt-6 border-t border-border/50 pt-4">
      <div className="bg-muted/30 rounded-lg border border-border/50 overflow-hidden font-mono">
        {/* Header Bar */}
        <div className="bg-muted/50 border-b border-border/50 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Debug Console</span>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {data.model || 'N/A'}
            </Badge>
            {data.latency !== undefined && (
              <Badge variant="outline" className="text-xs font-mono">
                <Clock className="w-3 h-3 mr-1" />
                {formatDuration(data.latency)}
              </Badge>
            )}
            {data.tokenUsage && (
              <Badge variant="outline" className="text-xs font-mono">
                Tokens: {data.tokenUsage.input}/{data.tokenUsage.output}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={copyFullDump}
            className="h-7 px-2 text-xs"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 mr-1" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 mr-1" />
                Copiar Dump (JSON)
              </>
            )}
          </Button>
        </div>

        {/* Sections */}
        <div className="divide-y divide-border/50">
          {/* Section A: Contexto & Memória */}
          <Section
            id="context"
            title="🧠 Contexto & Memória (Input)"
            icon={<Brain className="w-4 h-4" />}
            isExpanded={isExpanded('context')}
            onToggle={() => toggleSection('context')}
          >
            <div className="space-y-4 p-4">
              <div>
                <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                  System Prompt
                </h4>
                <pre className="text-xs bg-background/50 p-3 rounded border border-border/30 overflow-x-auto whitespace-pre-wrap break-words">
                  {data.systemPrompt}
                </pre>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Injetado em: {formatTimestamp(data.timestamp)}
                </p>
              </div>
              <div>
                <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                  Histórico da Sessão ({data.contextUsed.length} mensagens)
                </h4>
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground mb-2">
                    Expandir JSON
                  </summary>
                  <pre className="bg-background/50 p-3 rounded border border-border/30 overflow-x-auto">
                    {JSON.stringify(data.contextUsed, null, 2)}
                  </pre>
                </details>
              </div>
            </div>
          </Section>

          {/* Section B: Deep Research */}
          {data.webResearch && (
            <Section
              id="research"
              title="🔎 Deep Research (Processamento)"
              icon={<Search className="w-4 h-4" />}
              isExpanded={isExpanded('research')}
              onToggle={() => toggleSection('research')}
            >
              <div className="space-y-4 p-4">
                {/* Pipeline Status */}
                <div>
                  <h4 className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                    Status do Pipeline
                  </h4>
                  <div className="space-y-3">
                    {/* Decomposition */}
                    {data.webResearch.plan && data.webResearch.plan.length > 0 && (
                      <div className="border-l-2 border-primary/50 pl-3">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 bg-green-500 rounded-full" />
                          <span className="text-xs font-medium">Decomposition</span>
                        </div>
                        <div className="text-xs text-muted-foreground ml-4 space-y-1">
                          {data.webResearch.plan.map((query, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                              <span className="text-muted-foreground/50">{idx + 1}.</span>
                              <span>{query}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Query Expansion */}
                    {data.webResearch.enrichedQueries && (
                      <div className="border-l-2 border-blue-500/50 pl-3">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 bg-blue-500 rounded-full" />
                          <span className="text-xs font-medium">Query Expansion</span>
                        </div>
                        <div className="text-xs text-muted-foreground ml-4 space-y-2">
                          {data.webResearch.queries.map((original, idx) => {
                            const eq = data.webResearch?.enrichedQueries;
                            const allEnriched = eq ? [
                              ...(eq.literal || []),
                              ...(eq.semantic || []),
                              ...(eq.related || []),
                              ...(eq.expanded || []),
                              ...(eq.contextual || []),
                            ] : [];
                            return (
                              <div key={idx} className="space-y-1">
                                <div className="text-muted-foreground/70">
                                  <span className="font-medium">Original:</span> {original}
                                </div>
                                {allEnriched.length > 0 && (
                                  <div className="text-muted-foreground space-y-1">
                                    <span className="font-medium">Enriquecidas ({allEnriched.length}):</span>
                                    <div className="ml-2 space-y-0.5">
                                      {allEnriched.slice(0, 5).map((q, qIdx) => (
                                        <div key={qIdx} className="text-[10px]">• {q}</div>
                                      ))}
                                      {allEnriched.length > 5 && (
                                        <div className="text-[10px] text-muted-foreground/70">
                                          ... e mais {allEnriched.length - 5}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Web Crawling */}
                    {data.webResearch.sources && data.webResearch.sources.length > 0 && (
                      <div className="border-l-2 border-yellow-500/50 pl-3">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                          <span className="text-xs font-medium">
                            Web Crawling ({data.webResearch.sources.length} fontes)
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground ml-4 space-y-2 max-h-60 overflow-y-auto">
                          {data.webResearch.sources.map((source, idx) => (
                            <div key={idx} className="flex items-start gap-2 p-2 bg-background/30 rounded border border-border/20">
                              <div className="flex-shrink-0 mt-0.5">
                                {source.content && source.content.length > 0 ? (
                                  <span className="text-green-500">✓</span>
                                ) : (
                                  <span className="text-red-500">✗</span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium truncate">{source.title || source.url}</span>
                                  {source.cached && (
                                    <Badge variant="outline" className="text-[10px] px-1">
                                      Cached
                                    </Badge>
                                  )}
                                </div>
                                <a
                                  href={source.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-primary hover:underline truncate block"
                                >
                                  {source.url}
                                </a>
                                {source.content && (
                                  <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
                                    {source.content.substring(0, 150)}...
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Knowledge Base */}
                    {data.webResearch.knowledgeBase && data.webResearch.knowledgeBase.length > 0 && (
                      <div className="border-l-2 border-purple-500/50 pl-3">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 bg-purple-500 rounded-full" />
                          <span className="text-xs font-medium">Knowledge Base</span>
                        </div>
                        <div className="text-xs text-muted-foreground ml-4">
                          <Badge variant="secondary" className="text-[10px]">
                            {data.webResearch.knowledgeBase.length} chunks extraídos
                          </Badge>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Research Logs */}
                {data.webResearch.logs && data.webResearch.logs.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                      Logs Internos ({data.webResearch.logs.length} entradas)
                    </h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {data.webResearch.logs.map((log, idx) => (
                        <div key={idx} className="text-xs bg-background/30 p-2 rounded border border-border/20">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-[10px] px-1">
                              {log.stage}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {formatTimestamp(log.timestamp)}
                            </span>
                          </div>
                          <div className="text-muted-foreground">
                            <div className="mb-1">
                              <span className="font-medium">Input:</span> {log.input}
                            </div>
                            {log.rawOutput && (
                              <div className="mb-1">
                                <span className="font-medium">Output:</span>{' '}
                                <span className="text-[10px]">{log.rawOutput.substring(0, 200)}...</span>
                              </div>
                            )}
                            {log.error && (
                              <div className="text-red-500">
                                <span className="font-medium">Erro:</span> {log.error}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Section C: Dados Processados */}
          {data.deepResearchState && (
            <Section
              id="processed"
              title="⚙️ Dados Processados (Raciocínio)"
              icon={<Settings className="w-4 h-4" />}
              isExpanded={isExpanded('processed')}
              onToggle={() => toggleSection('processed')}
            >
              <div className="space-y-4 p-4">
                <div>
                  <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                    Estado do Deep Research
                  </h4>
                  <div className="text-xs space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Step:</span>
                      <Badge variant="outline">{data.deepResearchState.step}</Badge>
                    </div>
                    {data.deepResearchState.validationReport && (
                      <div>
                        <span className="text-muted-foreground font-medium">Validation Report:</span>
                        <pre className="mt-1 bg-background/50 p-2 rounded border border-border/30 overflow-x-auto whitespace-pre-wrap break-words text-[10px]">
                          {data.deepResearchState.validationReport}
                        </pre>
                      </div>
                    )}
                    {data.deepResearchState.error && (
                      <div className="text-red-500">
                        <span className="font-medium">Erro:</span> {data.deepResearchState.error}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Section>
          )}

          {/* Section D: Resposta Raw */}
          <Section
            id="response"
            title="📤 Resposta Raw (Output)"
            icon={<FileText className="w-4 h-4" />}
            isExpanded={isExpanded('response')}
            onToggle={() => toggleSection('response')}
          >
            <div className="p-4">
              <pre className="text-xs bg-background/50 p-3 rounded border border-border/30 overflow-x-auto whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
                {data.rawResponse || data.finalResponse}
              </pre>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

interface SectionProps {
  id: string;
  title: string;
  icon: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function Section({ id, title, icon, isExpanded, onToggle, children }: SectionProps) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium">{title}</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {isExpanded && (
        <div className="bg-background/20">
          {children}
        </div>
      )}
    </div>
  );
}

