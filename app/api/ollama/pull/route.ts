import { NextRequest } from "next/server";
import { pullModel, ensureOllamaAvailable } from "@/lib/ollama";
import { getCatalogModels } from "@/lib/catalog";
import { addSavedRemoteModel } from "@/lib/user-remote-models";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { model } = await req.json();

    if (!model) {
      return new Response("Missing model", { status: 400 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Garantir que o servidor esteja disponível antes do pull
          const ok = await ensureOllamaAvailable({ timeoutMs: 20000 });
          if (!ok) {
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify({ error: "Ollama indisponível" }) + "\n",
              ),
            );
            controller.close();
            return;
          }

          // Buscar metadados do catálogo para melhorar mensagens de erro
          const baseName = String(model).split(":")[0];
          const catalog = await getCatalogModels();
          const catalogEntry = catalog.find((m) => m.name === baseName);

          const response = await pullModel(model);

          for await (const chunk of response) {
            controller.enqueue(
              new TextEncoder().encode(JSON.stringify(chunk) + "\n"),
            );
          }

          // Persistir referência do modelo baixado para reutilização futura
          try {
            await addSavedRemoteModel({ name: String(model), installed: true });
          } catch {}

          controller.enqueue(
            new TextEncoder().encode(
              JSON.stringify({ status: "success" }) + "\n",
            ),
          );
          controller.close();
        } catch (error: any) {
          console.error("Pull streaming error:", error);
          const message = typeof error?.message === "string" ? error.message : "Failed to pull model";
          const baseName = String(model).split(":")[0];
          let hint: string | undefined;

          // Recarregar entrada de catálogo para enriquecer erro
          let catalogEntry: { url?: string; tags_count?: number } | undefined;
          try {
            const catalog = await getCatalogModels();
            catalogEntry = catalog.find((m) => m.name === baseName);
          } catch {}

          // Heurísticas: manifest não encontrado → provavelmente falta tag válida
          if (/manifest/i.test(message) || /does not exist/i.test(message)) {
            hint = "Modelo/tag não encontrado no registro. Selecione uma tag válida ou verifique a página do modelo.";
          }

          const payload: Record<string, unknown> = {
            error: "Failed to pull model",
            detail: message,
            model,
            name: baseName,
          };

          // Anexar URL do catálogo quando disponível
          if (catalogEntry?.url) {
            payload.url = catalogEntry.url;
          }

          // Se usuário não especificou tag (sem ":") e sabemos que há múltiplas tags
          if (!String(model).includes(":") && typeof catalogEntry?.tags_count === "number") {
            payload.tags_count = catalogEntry.tags_count;
            if (!hint && catalogEntry.tags_count > 0) {
              hint = "Este modelo pode não ter a tag 'latest'. Escolha uma tag específica.";
            }
          }

          if (hint) payload.hint = hint;

          controller.enqueue(
            new TextEncoder().encode(JSON.stringify(payload) + "\n"),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Pull API error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
