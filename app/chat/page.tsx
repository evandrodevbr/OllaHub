'use client';

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Settings, Server, Moon, Sun, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessage } from "@/components/chat/chat-message";
import { SystemPanel } from "@/components/chat/system-panel";
import { PromptGeneratorDialog } from "@/components/chat/prompt-generator";
import { useChat } from "@/hooks/use-chat";
import { useLocalModels } from "@/hooks/use-local-models";
import { useState, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { ImperativePanelHandle } from "react-resizable-panels";
// @ts-ignore
import defaultFormatPrompt from "@/data/prompts/default-format.md";

export default function ChatPage() {
  const { messages, sendMessage, isLoading, stop } = useChat();
  const { models } = useLocalModels();
  const { theme, setTheme } = useTheme();
  
  const [selectedModel, setSelectedModel] = useState("");
  // Initialize with default format prompt
  const [systemPrompt, setSystemPrompt] = useState(defaultFormatPrompt || "Você é um assistente útil e prestativo.");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  const sidebarRef = useRef<ImperativePanelHandle>(null);

  // Auto-select first model
  useEffect(() => {
    if (models.length > 0 && !selectedModel) {
      setSelectedModel(models[0].name);
    }
  }, [models, selectedModel]);

  const handleSend = (content: string) => {
    if (!selectedModel) return;
    sendMessage(content, selectedModel, systemPrompt);
  };

  const toggleSidebar = () => {
    const panel = sidebarRef.current;
    if (panel) {
      if (isSidebarCollapsed) {
        panel.expand();
      } else {
        panel.collapse();
      }
    }
  };

  return (
    <div className="h-screen w-full bg-background overflow-hidden flex">
      {/* Left Sidebar (Nav) */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        
        <ResizablePanel 
          ref={sidebarRef}
          defaultSize={4} 
          minSize={4} 
          maxSize={15} 
          collapsible={true}
          collapsedSize={0}
          onCollapse={() => setIsSidebarCollapsed(true)}
          onExpand={() => setIsSidebarCollapsed(false)}
          className="border-r flex flex-col items-center py-4 gap-4 bg-muted/20 min-w-[60px]"
        >
          <Button variant="ghost" size="icon" className="rounded-lg bg-primary/10 text-primary">
            <MessageSquare className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-lg text-muted-foreground hover:text-foreground">
            <Server className="w-5 h-5" />
          </Button>
          <div className="flex-1" />
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-lg text-muted-foreground hover:text-foreground"
          >
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>
          <Button variant="ghost" size="icon" className="rounded-lg text-muted-foreground hover:text-foreground">
            <Settings className="w-5 h-5" />
          </Button>
        </ResizablePanel>

        <ResizableHandle />

        {/* Main Chat Area */}
        <ResizablePanel defaultSize={75} minSize={50}>
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="h-14 border-b flex items-center px-4 justify-between bg-background/50 backdrop-blur gap-4">
              <div className="flex items-center gap-2">
                {isSidebarCollapsed && (
                  <Button variant="ghost" size="icon" onClick={toggleSidebar} className="h-8 w-8">
                    <PanelLeftOpen className="w-4 h-4" />
                  </Button>
                )}
                {!isSidebarCollapsed && (
                   <Button variant="ghost" size="icon" onClick={toggleSidebar} className="h-8 w-8 text-muted-foreground">
                    <PanelLeftClose className="w-4 h-4" />
                  </Button>
                )}
                <div className="font-semibold">Chat</div>
              </div>

              <div className="flex-1 max-w-[300px]">
                 <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecione um modelo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map(m => (
                      <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto scroll-smooth">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
                  <div className="p-4 rounded-full bg-muted/50">
                    <MessageSquare className="w-8 h-8" />
                  </div>
                  <p>Inicie uma conversa com {selectedModel}</p>
                </div>
              ) : (
                <div className="flex flex-col pb-4">
                  {messages.map((msg, i) => (
                    <ChatMessage key={i} message={msg} />
                  ))}
                  {isLoading && (
                    <div className="px-6 py-4 text-xs text-muted-foreground animate-pulse">
                      Gerando resposta...
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Input */}
            <ChatInput 
              onSend={handleSend} 
              onStop={stop} 
              isLoading={isLoading} 
            />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right Sidebar (Settings & Monitor) */}
        <ResizablePanel defaultSize={25} minSize={20} maxSize={40} className="bg-muted/10">
          <Tabs defaultValue="params" className="h-full flex flex-col">
            <div className="border-b px-4">
              <TabsList className="w-full justify-start h-12 bg-transparent p-0 gap-4">
                <TabsTrigger 
                  value="params" 
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0"
                >
                  Parâmetros
                </TabsTrigger>
                <TabsTrigger 
                  value="system" 
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0"
                >
                  Sistema
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="params" className="flex-1 p-4 space-y-6 overflow-y-auto m-0">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">System Prompt</label>
                  <PromptGeneratorDialog 
                    defaultModel={selectedModel} 
                    onPromptGenerated={setSystemPrompt} 
                  />
                </div>
                <Textarea 
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="min-h-[300px] resize-none font-mono text-sm"
                  placeholder="Defina como a IA deve se comportar..."
                />
                <p className="text-xs text-muted-foreground">
                  Instruções globais para o comportamento do modelo.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="system" className="flex-1 m-0 overflow-hidden">
              <SystemPanel />
            </TabsContent>
          </Tabs>
        </ResizablePanel>

      </ResizablePanelGroup>
    </div>
  );
}
