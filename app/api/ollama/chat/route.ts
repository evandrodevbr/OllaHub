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
        let isClosed = false;

        const safeEnqueue = (data: string) => {
          if (!isClosed) {
            try {
              controller.enqueue(new TextEncoder().encode(data));
            } catch (error) {
              console.error("Error enqueuing data:", error);
              isClosed = true;
            }
          }
        };

        const safeClose = () => {
          if (!isClosed) {
            try {
              controller.close();
              isClosed = true;
            } catch (error) {
              console.error("Error closing controller:", error);
            }
          }
        };

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
              safeEnqueue(JSON.stringify({ token }) + "\n");
            }
          }

          safeEnqueue(JSON.stringify({ done: true }) + "\n");
          safeClose();
        } catch (error) {
          console.error("Chat streaming error:", error);
          safeEnqueue(
            JSON.stringify({ error: "Failed to generate response" }) + "\n"
          );
          safeClose();
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
