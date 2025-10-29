import { Ollama } from "ollama";

const ollama = new Ollama({
  host: process.env.OLLAMA_HOST || "http://localhost:11434",
});

export async function generateEmbedding(
  text: string,
  model: string = "nomic-embed-text"
): Promise<Float32Array> {
  try {
    // Verificar se deve forçar uso de CPU (útil quando GPU tem problemas de memória)
    const forceCpu =
      process.env.OLLAMA_NO_GPU === "1" || process.env.OLLAMA_NUM_GPU === "0";

    const response = await ollama.embeddings({
      model,
      prompt: text,
      options: forceCpu ? { num_gpu: 0 } : undefined,
    });

    return new Float32Array(response.embedding);
  } catch (error: any) {
    console.error("Erro ao gerar embedding:", error);

    // Se erro de GPU e ainda não tentou CPU, tentar forçar CPU
    const isGpuError =
      error?.message?.includes("CUDA") ||
      error?.message?.includes("unable to allocate") ||
      error?.status_code === 500;

    if (
      isGpuError &&
      process.env.OLLAMA_NO_GPU !== "1" &&
      process.env.OLLAMA_NUM_GPU !== "0"
    ) {
      console.warn("Erro de GPU detectado, tentando usar CPU...");
      try {
        const response = await ollama.embeddings({
          model,
          prompt: text,
          options: { num_gpu: 0 },
        });
        return new Float32Array(response.embedding);
      } catch (cpuError) {
        console.error("Erro mesmo usando CPU:", cpuError);
      }
    }

    // Fallback: retornar vetor zero se modelo não estiver disponível
    console.warn(
      `Modelo ${model} não disponível, usando vetor zero como fallback`
    );
    return new Float32Array(768); // 768 dimensões para nomic-embed-text
  }
}

const EMOJI_CATEGORIES = {
  code: ["💻", "🖥️", "⌨️", "🔧", "🛠️"],
  idea: ["💡", "🧠", "💭", "🤔", "✨"],
  question: ["❓", "🤷", "🔍", "🧐", "📚"],
  creative: ["🎨", "🎭", "🎪", "🌈", "🎬"],
  business: ["💼", "📊", "💰", "📈", "🏢"],
  science: ["🔬", "🧪", "🔭", "⚗️", "🧬"],
  education: ["📖", "📝", "🎓", "✏️", "📚"],
  communication: ["💬", "📱", "📧", "🗣️", "💌"],
  general: ["🌟", "🎯", "🚀", "⚡", "🔥"],
};

export async function generateChatTitle(firstMessage: string): Promise<string> {
  try {
    const response = await ollama.generate({
      model: "qwen2.5:0.5b",
      prompt: `Analise esta mensagem e crie um título curto e descritivo (MAX 30 caracteres, sem emoji):

Mensagem: "${firstMessage}"

Título (direto, sem explicação):`,
      options: {
        temperature: 0.7,
        num_predict: 15,
      },
    });

    let title = response.response
      .trim()
      .replace(/['"]/g, "")
      .replace(/^Título:\s*/i, "")
      .substring(0, 30);

    // Selecionar emoji baseado no conteúdo
    const emoji = selectEmoji(firstMessage);

    return `${emoji} ${title}`;
  } catch (error) {
    console.error("Erro ao gerar título:", error);
    // Fallback: usar título simples baseado no conteúdo
    const emoji = selectEmoji(firstMessage);
    const fallbackTitle = firstMessage.substring(0, 20).trim();
    return `${emoji} ${fallbackTitle}`;
  }
}

function selectEmoji(content: string): string {
  const lower = content.toLowerCase();

  if (/code|program|debug|function|class/.test(lower))
    return EMOJI_CATEGORIES.code[
      Math.floor(Math.random() * EMOJI_CATEGORIES.code.length)
    ];
  if (/why|how|what|when|where/.test(lower))
    return EMOJI_CATEGORIES.question[
      Math.floor(Math.random() * EMOJI_CATEGORIES.question.length)
    ];
  if (/idea|think|create|design/.test(lower))
    return EMOJI_CATEGORIES.idea[
      Math.floor(Math.random() * EMOJI_CATEGORIES.idea.length)
    ];
  if (/business|money|sale|market/.test(lower))
    return EMOJI_CATEGORIES.business[
      Math.floor(Math.random() * EMOJI_CATEGORIES.business.length)
    ];
  if (/science|research|experiment/.test(lower))
    return EMOJI_CATEGORIES.science[
      Math.floor(Math.random() * EMOJI_CATEGORIES.science.length)
    ];

  return EMOJI_CATEGORIES.general[
    Math.floor(Math.random() * EMOJI_CATEGORIES.general.length)
  ];
}
