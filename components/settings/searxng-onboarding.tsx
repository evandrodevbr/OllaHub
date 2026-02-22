'use client';

import { CheckCircle2, Shield, Infinity, Globe, Settings, ArrowRight, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SearxngOnboardingProps {
  onInstall: () => void;
  onSkip: () => void;
  onLearnMore?: () => void;
}

export function SearxngOnboarding({ onInstall, onSkip, onLearnMore }: SearxngOnboardingProps) {
  const benefits = [
    {
      icon: Infinity,
      title: 'Sem limites de queries',
      description: 'Enquanto Brave API oferece 2000 queries/mês, SearXNG é ilimitado',
      color: 'text-green-500',
    },
    {
      icon: Shield,
      title: 'Privacidade total',
      description: 'Sem rastreamento, sem cookies, sem logs. Seus dados ficam privados',
      color: 'text-blue-500',
    },
    {
      icon: Globe,
      title: 'Agrega múltiplos motores',
      description: 'Combina resultados de Google, Bing, DuckDuckGo e outros em uma única busca',
      color: 'text-purple-500',
    },
    {
      icon: Settings,
      title: 'Controle total',
      description: 'Configure motores, filtros e personalizações conforme sua necessidade',
      color: 'text-orange-500',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto relative">
        <Button
          variant="ghost"
          size="icon"
          onClick={onSkip}
          className="absolute top-2 right-2 sm:top-4 sm:right-4 z-10"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </Button>
        <CardHeader className="text-center space-y-4 pb-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Globe className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl sm:text-3xl">SearXNG Self-Hosted</CardTitle>
          <CardDescription className="text-base">
            Busca Ilimitada e Privada
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Por que SearXNG? */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              Por que SearXNG?
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {benefits.map((benefit, idx) => {
                const Icon = benefit.icon;
                return (
                  <div
                    key={idx}
                    className="p-4 rounded-lg border border-muted bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <Icon className={cn('w-5 h-5 mt-0.5 flex-shrink-0', benefit.color)} />
                      <div className="space-y-1 flex-1">
                        <h4 className="font-medium text-sm">{benefit.title}</h4>
                        <p className="text-xs text-muted-foreground">{benefit.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Como Funciona */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Globe className="w-5 h-5 text-blue-500" />
              Como Funciona
            </h3>
            <div className="p-4 rounded-lg border border-muted bg-muted/30">
              <div className="flex items-center justify-center gap-2 sm:gap-4 flex-wrap">
                <div className="flex flex-col items-center gap-2">
                  <div className="px-4 py-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-sm font-medium">
                    Brave API
                  </div>
                  <span className="text-xs text-muted-foreground">Tier 1</span>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground" />
                <div className="flex flex-col items-center gap-2">
                  <div className="px-4 py-2 rounded-md bg-green-500/10 border border-green-500/20 text-sm font-medium">
                    SearXNG
                  </div>
                  <span className="text-xs text-muted-foreground">Tier 2</span>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground" />
                <div className="flex flex-col items-center gap-2">
                  <div className="px-4 py-2 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-sm font-medium">
                    DuckDuckGo
                  </div>
                  <span className="text-xs text-muted-foreground">Tier 3</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-4 text-center">
                SearXNG é usado como fallback quando Brave API esgota sua quota mensal (2000 queries).
                É completamente opcional e não afeta o uso normal do sistema.
              </p>
            </div>
          </div>

          {/* Requisitos */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Settings className="w-5 h-5 text-orange-500" />
              Requisitos
            </h3>
            <div className="space-y-2">
              <div className="flex items-start gap-3 p-3 rounded-lg border border-muted bg-muted/30">
                <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm">Docker instalado e rodando</p>
                  <p className="text-xs text-muted-foreground">
                    O SearXNG roda em um container Docker. Se não tiver Docker, você pode instalá-lo durante o processo.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg border border-muted bg-muted/30">
                <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm">~200MB de RAM</p>
                  <p className="text-xs text-muted-foreground">
                    O container SearXNG consome aproximadamente 200MB de memória RAM.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg border border-muted bg-muted/30">
                <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm">Porta 8080 disponível</p>
                  <p className="text-xs text-muted-foreground">
                    Por padrão, SearXNG usa a porta 8080. Você pode configurar uma porta diferente se necessário.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Ações */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
            <Button onClick={onInstall} className="flex-1" size="lg">
              <ArrowRight className="w-4 h-4 mr-2" />
              Instalar Agora
            </Button>
            {onLearnMore && (
              <Button onClick={onLearnMore} variant="outline" className="flex-1" size="lg">
                <ExternalLink className="w-4 h-4 mr-2" />
                Saiba Mais
              </Button>
            )}
            <Button onClick={onSkip} variant="ghost" className="flex-1" size="lg">
              <X className="w-4 h-4 mr-2" />
              Pular por Enquanto
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
