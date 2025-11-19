import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RefreshCw, Copy, Check, Play, Loader2 } from "lucide-react"
import { useState } from "react"
import { invoke } from "@tauri-apps/api/core"

export function StoppedCard({ onCheckAgain }: { onCheckAgain: () => void }) {
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const command = "ollama serve";

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStart = async () => {
    setStarting(true);
    try {
      await invoke('start_ollama_server');
      // Wait a bit for the server to start before checking again
      setTimeout(() => {
        onCheckAgain();
        setStarting(false);
      }, 3000);
    } catch (error) {
      console.error("Failed to start ollama:", error);
      setStarting(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto border-yellow-500/50 bg-yellow-50/10 dark:bg-yellow-900/10">
      <CardHeader>
        <CardTitle className="text-yellow-600 dark:text-yellow-500">Ollama está parado</CardTitle>
        <CardDescription>
          O Ollama está instalado mas não está rodando. Você pode iniciá-lo automaticamente ou executar o comando manualmente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={handleStart} 
          className="w-full bg-yellow-600 hover:bg-yellow-700 text-white" 
          disabled={starting}
        >
          {starting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Iniciando...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Iniciar Ollama Automaticamente
            </>
          )}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-yellow-500/20" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Ou manualmente</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className="bg-muted p-3 rounded-md font-mono text-sm flex-1 border">
            {command}
          </div>
          <Button size="icon" variant="outline" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        
        <Button onClick={onCheckAgain} className="w-full" variant="secondary">
          <RefreshCw className="mr-2 h-4 w-4" />
          Verificar Novamente
        </Button>
      </CardContent>
    </Card>
  )
}
