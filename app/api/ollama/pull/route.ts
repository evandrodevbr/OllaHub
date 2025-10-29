import { NextRequest } from "next/server";
import { pullModel, ensureOllamaAvailable } from "@/lib/ollama";

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

          const response = await pullModel(model);

          for await (const chunk of response) {
            controller.enqueue(
              new TextEncoder().encode(JSON.stringify(chunk) + "\n"),
            );
          }

          controller.enqueue(
            new TextEncoder().encode(
              JSON.stringify({ status: "success" }) + "\n",
            ),
          );
          controller.close();
        } catch (error) {
          console.error("Pull streaming error:", error);
          controller.enqueue(
            new TextEncoder().encode(
              JSON.stringify({ error: "Failed to pull model" }) + "\n",
            ),
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
