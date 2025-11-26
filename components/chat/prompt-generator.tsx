import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { usePromptGenerator } from "@/hooks/use-prompt-generator";
import { useLocalModels } from "@/hooks/use-local-models";

interface PromptGeneratorDialogProps {
  defaultModel: string;
  onPromptGenerated: (prompt: string) => void;
}

export function PromptGeneratorDialog({ defaultModel, onPromptGenerated }: PromptGeneratorDialogProps) {
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState("");
  const [selectedModel, setSelectedModel] = useState(defaultModel || "");
  const { generatePrompt, isGenerating } = usePromptGenerator();
  const { models, loading } = useLocalModels();

  // Set default model when dialog opens or defaultModel changes
  useEffect(() => {
    if (defaultModel && defaultModel.trim()) {
      setSelectedModel(defaultModel);
    }
  }, [defaultModel]);

  // Try to set specific default if available and no model is selected
  useEffect(() => {
    if (loading || models.length === 0) return;
    
    // Se já tem um modelo selecionado e válido, não alterar
    if (selectedModel && models.some(m => m.name === selectedModel)) return;
    
    // Primeiro, tenta usar o defaultModel se for válido
    if (defaultModel && defaultModel.trim() && models.some(m => m.name === defaultModel)) {
      setSelectedModel(defaultModel);
      return;
    }
    
    // Fallback para modelo preferido
    const preferredModel = "llama3.2-abliterate:3b";
    const hasPreferred = models.some(m => m.name === preferredModel);
    if (hasPreferred && !selectedModel.trim()) {
      setSelectedModel(preferredModel);
      return;
    }
    
    // Se nenhum modelo está selecionado, seleciona o primeiro disponível
    if (!selectedModel.trim() && models.length > 0) {
      setSelectedModel(models[0].name);
    }
  }, [models, loading, defaultModel, selectedModel]);

  const handleGenerate = async () => {
    if (!goal.trim() || !selectedModel.trim()) return;
    
    try {
      const prompt = await generatePrompt(goal, selectedModel);
      onPromptGenerated(prompt);
      setOpen(false);
      setGoal("");
    } catch (error) {
      console.error("Erro ao gerar prompt:", error);
      // TODO: Implementar toast de erro quando disponível
    }
  };

  const handleCancel = () => {
    setOpen(false);
    setGoal("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-yellow-500 hover:text-yellow-600 hover:bg-yellow-100 dark:hover:bg-yellow-900/20" title="Gerar com IA">
          <Sparkles className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Gerador de Prompts</DialogTitle>
          <DialogDescription>
            Descreva o que você quer que a IA faça, e nós criaremos um System Prompt otimizado para você.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="model-select" className="text-sm font-medium">
              Modelo para Geração
            </label>
            <TooltipProvider>
              <Select 
                value={selectedModel || undefined} 
                onValueChange={setSelectedModel}
                disabled={loading || models.length === 0}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SelectTrigger id="model-select" className="min-w-0 max-w-full">
                      <SelectValue placeholder={
                        loading 
                          ? "Carregando modelos..." 
                          : models.length === 0 
                            ? "Nenhum modelo disponível" 
                            : "Selecione um modelo..."
                      } className="truncate" />
                    </SelectTrigger>
                  </TooltipTrigger>
                  {selectedModel && (
                    <TooltipContent side="top" className="max-w-[70vw] break-words">
                      <p className="text-sm">{selectedModel}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
                <SelectContent className="max-w-[90vw]">
                  {models.length === 0 ? (
                    <SelectItem value="" disabled>Nenhum modelo disponível</SelectItem>
                  ) : (
                    models.map(m => (
                      <Tooltip key={m.name}>
                        <TooltipTrigger asChild>
                          <SelectItem value={m.name} className="min-w-0">
                            <span className="truncate block" style={{ maxWidth: '70vw' }}>
                              {m.name}
                            </span>
                          </SelectItem>
                        </TooltipTrigger>
                        {m.name.length > 40 && (
                          <TooltipContent side="right" className="max-w-[70vw] break-words">
                            <p className="text-sm">{m.name}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    ))
                  )}
                </SelectContent>
              </Select>
            </TooltipProvider>
            <p className="text-xs text-muted-foreground">
              Recomendado: Modelos com boa capacidade de instrução (ex: Llama 3, Mistral).
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="goal-textarea" className="text-sm font-medium">
              Seu Objetivo
            </label>
            <Textarea
              id="goal-textarea"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Ex: Quero um assistente especialista em Python que explique conceitos complexos de forma simples..."
              className="min-h-[160px]"
              disabled={isGenerating}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleCancel} disabled={isGenerating}>
            Cancelar
          </Button>
          <Button 
            onClick={handleGenerate} 
            disabled={isGenerating || !goal.trim() || !selectedModel.trim() || models.length === 0}
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Gerar Prompt
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
