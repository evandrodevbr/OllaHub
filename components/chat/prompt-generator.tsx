import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const { generatePrompt, isGenerating } = usePromptGenerator();
  const { models } = useLocalModels();

  // Set default model when dialog opens or defaultModel changes
  useEffect(() => {
    if (defaultModel) {
      setSelectedModel(defaultModel);
    }
  }, [defaultModel]);

  // Try to set specific default if available, otherwise fallback
  useEffect(() => {
    const preferredModel = "llama3.2-abliterate:3b";
    const hasPreferred = models.some(m => m.name === preferredModel);
    if (hasPreferred && !selectedModel) {
      setSelectedModel(preferredModel);
    }
  }, [models, selectedModel]);

  const handleGenerate = async () => {
    if (!goal.trim() || !selectedModel) return;
    
    try {
      const prompt = await generatePrompt(goal, selectedModel);
      onPromptGenerated(prompt);
      setOpen(false);
      setGoal("");
    } catch (error) {
      // Error handling usually done in hook or global toast
    }
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
            <label className="text-sm font-medium">Modelo para Geração</label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um modelo..." />
              </SelectTrigger>
              <SelectContent>
                {models.map(m => (
                  <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Recomendado: Modelos com boa capacidade de instrução (ex: Llama 3, Mistral).
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Seu Objetivo</label>
            <Textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Ex: Quero um assistente especialista em Python que explique conceitos complexos de forma simples..."
              className="min-h-[150px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleGenerate} disabled={isGenerating || !goal.trim() || !selectedModel}>
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
