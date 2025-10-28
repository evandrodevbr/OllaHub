import { NextRequest } from "next/server";
import { chatWithStream } from "@/lib/ollama";
import { convertToOllamaMessages } from "@/lib/chat";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { model, messages, options, system } = await req.json();

    if (!model || !messages?.length) {
      return new Response("Missing model or messages", { status: 400 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const ollamaMessages = convertToOllamaMessages(messages);
          const response = await chatWithStream(
            model,
            ollamaMessages,
            options,
            system
          );

          for await (const chunk of response) {
            const token = chunk.message?.content || "";
            if (token) {
              controller.enqueue(
                new TextEncoder().encode(JSON.stringify({ token }) + "\n")
              );
            }
          }

          controller.enqueue(
            new TextEncoder().encode(JSON.stringify({ done: true }) + "\n")
          );
          controller.close();
        } catch (error) {
          console.error("Chat streaming error:", error);
          controller.enqueue(
            new TextEncoder().encode(
              JSON.stringify({ error: "Failed to generate response" }) + "\n"
            )
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
    console.error("Chat API error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
