import { NextRequest } from "next/server";
import { chatWithStream, ensureOllamaAvailable } from "@/lib/ollama";
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
        let toolExecuted = false;
        let lastExtractedToolCall: { name: string; parameters: any } | null =
          null;

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
          // Garantir disponibilidade com timeout curto (não bloquear)
          ensureOllamaAvailable({ timeoutMs: 2000 }).catch(() => {});
          const ollamaMessages = convertToOllamaMessages(messages);
          if (process.env.NODE_ENV !== "production") {
            console.log("🗣️  [CHAT] Messages ->", ollamaMessages);
          }

          // Merge system prompt com tools prompt
          const finalSystemPrompt = toolsPrompt
            ? `${system || ""}\n\n${toolsPrompt}`
            : system;
          if (toolsPrompt && process.env.NODE_ENV !== "production") console.log("🧩 [CHAT] Tools prompt injected");

          // Preparar parâmetros para chat
          const chatParams = capabilities.supportsNativeTools ? { tools } : {};
          if (process.env.NODE_ENV !== "production") {
            if (capabilities.supportsNativeTools) {
              console.log(
                "🧰 [CHAT] Native tools enabled:",
                tools?.map((t: any) => t.function?.name)
              );
            } else {
              console.log("🧰 [CHAT] Prompt-engineering tools mode");
            }
          }

          const response = await chatWithStream(
            model,
            ollamaMessages,
            options,
            finalSystemPrompt,
            capabilities.supportsNativeTools ? tools : undefined
          );
          if (process.env.NODE_ENV !== "production") console.log("🌊 [CHAT] Streaming started for model:", model);

          const normalizeParameters = (params: any) => {
            try {
              if (typeof params === "string") {
                params = JSON.parse(params);
              }
            } catch {
              // ignora erro de parse e mantém original
            }
            if (params && typeof params === "object") {
              const cleaned: Record<string, any> = {};
              for (const [k, v] of Object.entries(params)) {
                if (v && typeof v === "object" && Object.keys(v).length === 0) {
                  // remove objetos vazios que costumam vir de UIs (ex.: count: {})
                  continue;
                }
                cleaned[k] = v;
              }
              return cleaned;
            }
            return params ?? {};
          };

          for await (const chunk of response) {
            if (process.env.NODE_ENV !== "production") console.log("📦 [CHAT stream chunk]", JSON.stringify(chunk));
            // Verificar se há tool calls (modelos com suporte nativo)
            if (
              (chunk.message?.tool_calls &&
                chunk.message.tool_calls.length > 0) ||
              (Array.isArray((chunk as any).tool_calls) &&
                (chunk as any).tool_calls.length > 0)
            ) {
              if (process.env.NODE_ENV !== "production") console.log("🔧 Model requested tool calls (native)");

              const nativeCalls =
                chunk.message?.tool_calls || (chunk as any).tool_calls || [];
              for (const toolCall of nativeCalls) {
                const toolKey = toolCall.function.name;
                const toolInfo = mcpToolsMap.get(toolKey);
                if (process.env.NODE_ENV !== "production") {
                  console.log("🧭 [CHAT] Native tool call:", toolKey, "->", toolInfo);
                }

                if (toolInfo) {
                  // Executar tool
                  const result = await MCPExecutor.executeMCPTool(
                    toolInfo.mcpId,
                    toolInfo.toolName,
                    normalizeParameters(
                      toolCall.function.arguments ||
                        toolCall.function.parameters ||
                        {}
                    )
                  );

                  if (result.success) {
                    toolExecuted = true;
                    if (process.env.NODE_ENV !== "production") {
                      console.log("✅ [CHAT] Tool executed successfully", {
                        mcpId: toolInfo.mcpId,
                        toolName: toolInfo.toolName,
                        executionTime: result.executionTime,
                      });
                    }
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
                    if (process.env.NODE_ENV !== "production") {
                      console.log(
                        "🧩 [CHAT] Injecting tool result into context (length)",
                        String(resultMessage).length
                      );
                    }

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

          // Verificar se resposta contém tool call via prompt engineering (fallback também para nativo)
          if (accumulatedResponse) {
            console.log(
              "🧾 [CHAT] Accumulated response length:",
              accumulatedResponse.length
            );
            console.log(
              "🧾 [CHAT] Accumulated preview:",
              accumulatedResponse.slice(0, 400)
            );
            const extractedToolCall =
              extractToolCallFromResponse(accumulatedResponse);

            if (extractedToolCall) {
              if (process.env.NODE_ENV !== "production") console.log("🔧 Model requested tool call (prompt engineering)");
              lastExtractedToolCall = extractedToolCall;
              if (process.env.NODE_ENV !== "production") console.log("🧭 [CHAT] Extracted tool call:", extractedToolCall);

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
                  normalizeParameters(extractedToolCall.parameters)
                );

                if (result.success) {
                  toolExecuted = true;
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
            } else {
              if (process.env.NODE_ENV !== "production")
                console.log("🕵️  [CHAT] No tool call extracted from accumulated response");
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
