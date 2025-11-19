import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"

interface InstallModalProps {
  open: boolean;
  onCheckAgain: () => void;
}

export function InstallModal({ open, onCheckAgain }: InstallModalProps) {
  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Ollama não encontrado</DialogTitle>
          <DialogDescription>
            Para usar o OllaHub, você precisa ter o Ollama instalado no seu sistema.
            Siga os passos abaixo para o seu sistema operacional.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="mac" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="mac">macOS</TabsTrigger>
            <TabsTrigger value="linux">Linux</TabsTrigger>
            <TabsTrigger value="windows">Windows</TabsTrigger>
          </TabsList>
          <TabsContent value="mac" className="space-y-4 py-4">
            <div className="space-y-2">
              <h3 className="font-medium">1. Download e Instalação</h3>
              <Button variant="outline" className="w-full" asChild>
                <a href="https://ollama.com/download/Ollama-darwin.zip" target="_blank" rel="noopener noreferrer">
                  <Download className="mr-2 h-4 w-4" />
                  Baixar para macOS
                </a>
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
              Após instalar, abra o terminal e digite <code>ollama serve</code> se necessário.
            </div>
          </TabsContent>
          <TabsContent value="linux" className="space-y-4 py-4">
            <div className="space-y-2">
              <h3 className="font-medium">Instalação via Terminal</h3>
              <div className="bg-muted p-4 rounded-md relative group">
                <code className="text-sm break-all">curl -fsSL https://ollama.com/install.sh | sh</code>
              </div>
            </div>
             <div className="space-y-2">
              <h3 className="font-medium">Comando Manual</h3>
               <div className="text-sm text-muted-foreground">
                Ou consulte <a href="https://ollama.com/download/linux" className="underline text-primary" target="_blank" rel="noopener noreferrer">ollama.com/download/linux</a> para instruções manuais.
               </div>
            </div>
          </TabsContent>
          <TabsContent value="windows" className="space-y-4 py-4">
            <div className="space-y-2">
              <h3 className="font-medium">1. Download do Instalador</h3>
              <Button variant="outline" className="w-full" asChild>
                <a href="https://ollama.com/download/OllamaSetup.exe" target="_blank" rel="noopener noreferrer">
                  <Download className="mr-2 h-4 w-4" />
                  Baixar para Windows
                </a>
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
              Execute o instalador baixado e siga as instruções na tela.
            </div>
          </TabsContent>
        </Tabs>
        <div className="flex justify-end gap-2 mt-4">
            <Button onClick={onCheckAgain}>
                Verificar Novamente
            </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

