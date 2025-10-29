import { NextRequest } from "next/server";
import { chatWithStream } from "@/lib/ollama";
import { convertToOllamaMessages } from "@/lib/chat";
import { detectModelCapabilities } from "@/lib/services/model-capabilities";
import { MCPExecutor } from "@/lib/services/mcp-executor";
import {
  generateToolsPrompt,
  extractToolCallFromResponse,
  formatToolResultForContext,
} from "@/lib/prompts/mcp-tools-prompt";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { model, messages, options, system, activeMcps } = await req.json();

    if (!model || !messages?.length) {
      return new Response("Missing model or messages", { status: 400 });
    }

    // Detectar capabilities do modelo
    const capabilities = detectModelCapabilities(model);

    // Preparar tools se MCPs ativos foram fornecidos
    let tools: Array<any> = [];
    let toolsPrompt = "";
    const mcpToolsMap = new Map<string, { mcpId: string; toolName: string }>();

    if (activeMcps && activeMcps.length > 0) {
      console.log(`🔧 Active MCPs for chat: ${activeMcps.join(", ")}`);

      // Buscar tools de todos os MCPs ativos
      for (const mcpId of activeMcps) {
        const mcpTools = MCPExecutor.getAvailableTools(mcpId);

        for (const tool of mcpTools) {
          const toolKey = `${mcpId}__${tool.name}`;

          if (capabilities.supportsNativeTools) {
            // Formato OpenAI para modelos com suporte nativo
            tools.push({
              type: "function",
              function: {
                name: toolKey,
                description: tool.description,
                parameters: tool.inputSchema,
              },
            });
          }

          // Mapa para lookup rápido
          mcpToolsMap.set(toolKey, { mcpId, toolName: tool.name });
        }
      }

      // Se modelo não suporta native tools, usar prompt engineering
      if (!capabilities.supportsNativeTools) {
        const allTools = Array.from(mcpToolsMap.entries()).map(
          ([key, { mcpId, toolName }]) => {
            const mcpTools = MCPExecutor.getAvailableTools(mcpId);
            return mcpTools.find((t) => t.name === toolName)!;
          }
        );
        toolsPrompt = generateToolsPrompt(allTools);
      }
    }

    const stream = new ReadableStream({
      async start(controller) {
        let isClosed = false;
        let accumulatedResponse = "";

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

          // Merge system prompt com tools prompt
          const finalSystemPrompt = toolsPrompt
            ? `${system || ""}\n\n${toolsPrompt}`
            : system;

          // Preparar parâmetros para chat
          const chatParams = capabilities.supportsNativeTools ? { tools } : {};

          const response = await chatWithStream(
            model,
            ollamaMessages,
            options,
            finalSystemPrompt,
            capabilities.supportsNativeTools ? tools : undefined
          );

          for await (const chunk of response) {
            // Verificar se há tool calls (modelos com suporte nativo)
            if (
              chunk.message?.tool_calls &&
              chunk.message.tool_calls.length > 0
            ) {
              console.log("🔧 Model requested tool calls (native)");

              for (const toolCall of chunk.message.tool_calls) {
                const toolKey = toolCall.function.name;
                const toolInfo = mcpToolsMap.get(toolKey);

                if (toolInfo) {
                  // Executar tool
                  const result = await MCPExecutor.executeMCPTool(
                    toolInfo.mcpId,
                    toolInfo.toolName,
                    toolCall.function.arguments || {}
                  );

                  if (result.success) {
                    // Enviar indicador de execução de tool
                    safeEnqueue(
                      JSON.stringify({
                        toolExecution: {
                          mcpId: toolInfo.mcpId,
                          toolName: toolInfo.toolName,
                          status: "success",
                        },
                      }) + "\n"
                    );

                    // Injetar resultado no contexto e continuar
                    const resultMessage = formatToolResultForContext(
                      toolInfo.toolName,
                      result.result
                    );

                    // Fazer nova chamada ao modelo com o resultado
                    const updatedMessages = [
                      ...ollamaMessages,
                      {
                        role: "assistant",
                        content: chunk.message.content || "",
                      },
                      { role: "system", content: resultMessage },
                    ];

                    const followUpResponse = await chatWithStream(
                      model,
                      updatedMessages,
                      options,
                      finalSystemPrompt,
                      capabilities.supportsNativeTools ? tools : undefined
                    );

                    for await (const followUpChunk of followUpResponse) {
                      const token = followUpChunk.message?.content || "";
                      if (token) {
                        safeEnqueue(JSON.stringify({ token }) + "\n");
                      }
                    }
                  } else {
                    console.error("Tool execution failed:", result.error);
                  }
                }
              }
            } else {
              // Streaming normal de tokens
              const token = chunk.message?.content || "";
              if (token) {
                accumulatedResponse += token;
                safeEnqueue(JSON.stringify({ token }) + "\n");
              }
            }
          }

          // Se não há suporte nativo, verificar se resposta contém tool call via prompt engineering
          if (!capabilities.supportsNativeTools && accumulatedResponse) {
            const extractedToolCall =
              extractToolCallFromResponse(accumulatedResponse);

            if (extractedToolCall) {
              console.log("🔧 Model requested tool call (prompt engineering)");

              // Encontrar MCP e tool
              let foundToolInfo: { mcpId: string; toolName: string } | null =
                null;

              for (const [key, info] of mcpToolsMap.entries()) {
                if (
                  extractedToolCall.name === info.toolName ||
                  extractedToolCall.name === key
                ) {
                  foundToolInfo = info;
                  break;
                }
              }

              if (foundToolInfo) {
                // Executar tool
                const result = await MCPExecutor.executeMCPTool(
                  foundToolInfo.mcpId,
                  foundToolInfo.toolName,
                  extractedToolCall.parameters
                );

                if (result.success) {
                  // Limpar resposta anterior (que continha o JSON)
                  safeEnqueue(JSON.stringify({ clearPrevious: true }) + "\n");

                  // Enviar indicador de execução
                  safeEnqueue(
                    JSON.stringify({
                      toolExecution: {
                        mcpId: foundToolInfo.mcpId,
                        toolName: foundToolInfo.toolName,
                        status: "success",
                      },
                    }) + "\n"
                  );

                  // Fazer nova chamada com resultado
                  const resultMessage = formatToolResultForContext(
                    foundToolInfo.toolName,
                    result.result
                  );

                  const updatedMessages = [
                    ...ollamaMessages,
                    {
                      role: "assistant",
                      content: JSON.stringify({
                        tool_call: extractedToolCall,
                      }),
                    },
                    { role: "system", content: resultMessage },
                  ];

                  const followUpResponse = await chatWithStream(
                    model,
                    updatedMessages,
                    options,
                    finalSystemPrompt
                  );

                  for await (const followUpChunk of followUpResponse) {
                    const token = followUpChunk.message?.content || "";
                    if (token) {
                      safeEnqueue(JSON.stringify({ token }) + "\n");
                    }
                  }
                }
              }
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
