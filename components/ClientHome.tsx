"use client";

import { useState } from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { ChatContainer } from "@/components/chat/ChatContainer";
import { ConversationSidebar } from "@/components/chat/ConversationSidebar";
import {
  SettingsButton,
  SettingsModal,
} from "@/components/settings/SettingsModal";
import { Store } from "lucide-react";

interface ClientHomeProps {
  offline: boolean;
  models: any[];
}

export function ClientHome({ offline, models }: ClientHomeProps) {
  const [open, setOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);
  

  const handleConversationCreated = () => {
    // Incrementar trigger para forçar atualização da sidebar
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleSelectConversation = (id: string) => {
    setCurrentConversationId(id);
  };

  const handleNewConversation = () => {
    setCurrentConversationId(null);
  };

  return (
    <div className="h-screen flex flex-col bg-[var(--background)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--background),black_3%)]/80 backdrop-blur supports-[backdrop-filter]:bg-[color-mix(in_oklab,var(--background),black_3%)]/60">
        <div className="mx-auto flex max-w-full items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight">Ollahub</h1>
          <div className="flex items-center gap-3">
            {offline && (
              <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs">
                Ollama offline
              </span>
            )}
            <SettingsButton onOpen={() => setOpen(true)} />
            <ModeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <div className="flex h-full">
          <ConversationSidebar
            currentConversationId={currentConversationId}
            onSelectConversation={handleSelectConversation}
            onNewConversation={handleNewConversation}
            refreshTrigger={refreshTrigger}
          />
          <ChatContainer
            models={models}
            offline={offline}
            onConversationCreated={handleConversationCreated}
            currentConversationId={currentConversationId}
          />
        </div>
      </main>
      <SettingsModal isOpen={open} onClose={() => setOpen(false)} />
      
    </div>
  );
}
