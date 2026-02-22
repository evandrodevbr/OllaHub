import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SourcesConfig } from '@/lib/types';

export interface SearchCategory {
  id: string;
  name: string;
  baseSites: string[];
  enabled: boolean;
}

export interface SettingsState {
  // AI & Models
  ollamaUrl: string;
  selectedModel: string;
  selectedGpu: string | null;
  systemPrompt: string;
  contextWindow: number;

  // Web Search
  webSearch: {
    enabled: boolean;
    maxResults: number;
    timeout: number;
    excludedDomains: string[];
    maxConcurrentTabs: number;
    totalSourcesLimit: number;
    categories: SearchCategory[];
    userCustomSites: string[];
    enableSemanticExpansion: boolean; // Habilitar expansão semântica de queries
    semanticExpansionLanguage: string; // Idioma para expansão: 'pt-BR', 'en', 'es'
    searxng: {
      enabled: boolean; // false por padrão
      selfHosted: boolean; // true se self-hosted
      url: string; // URL do SearXNG (default: http://localhost:8080)
      status: 'unknown' | 'checking' | 'available' | 'unavailable';
      lastChecked: number; // timestamp
    };
  };

  // Content Processing
  contentProcessing: {
    enabled: boolean;
    autoSummarize: boolean;
    chunkingEnabled: boolean;
    maxChunkSize: number;
    minRelevanceScore: number;
    useKeyFactsExtraction: boolean;
    fallbackToSummarization: boolean;
  };

  // Sources Config (from Rust backend)
  sourcesConfig: SourcesConfig | null;
  
  // AutoStart
  autoStart: boolean;
  
  // Notifications
  notifications: {
    enabled: boolean;
    keywords: string[];
  };

  // Updates
  autoCheckUpdates: boolean;

  // Debug
  debugMode: boolean;

<<<<<<< HEAD
  // Setup
  isSetupCompleted: boolean;

  // Runtime Selection (Ollama vs llama.cpp)
  runtime: 'ollama' | 'llama-cpp';
  llamaCppParams: {
    nGpuLayers: number;
    nCtx: number;
    threads: number;
    temperature: number;
    topP: number;
    topK: number;
  };

=======
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
  // Query Preprocessing
  queryPreprocessing: {
    enabled: boolean;
    minLength: number;
    maxLength: number;
    autoSplitQuestions: boolean;
    irrelevantPatterns: string[];
  };

  // Actions
  setOllamaUrl: (url: string) => void;
  setSelectedModel: (model: string) => void;
  setSelectedGpu: (gpuId: string) => void;
  setSystemPrompt: (prompt: string) => void;
  setContextWindow: (ctx: number) => void;
  setWebSearchEnabled: (enabled: boolean) => void;
  setWebSearchMaxResults: (max: number) => void;
  setWebSearchTimeout: (timeout: number) => void;
  setWebSearchMaxConcurrentTabs: (max: number) => void;
  setWebSearchTotalSourcesLimit: (limit: number) => void;
  setWebSearchSemanticExpansion: (enabled: boolean) => void;
  setWebSearchSemanticExpansionLanguage: (language: string) => void;
  setSearxngEnabled: (enabled: boolean) => void;
  setSearxngUrl: (url: string) => void;
  setSearxngStatus: (status: 'unknown' | 'checking' | 'available' | 'unavailable') => void;
  checkSearxngStatus: () => Promise<void>;
  addExcludedDomain: (domain: string) => void;
  removeExcludedDomain: (domain: string) => void;
  toggleCategory: (categoryId: string) => void;
  updateCategory: (category: SearchCategory) => void;
  addCustomSite: (site: string) => void;
  removeCustomSite: (site: string) => void;
  resetSettings: () => void;
  
  // New Actions for Sources & AutoStart
  fetchSources: () => Promise<void>;
  saveSources: (config: SourcesConfig) => Promise<void>;
  toggleAutoStart: () => Promise<void>;
  setNotificationsEnabled: (enabled: boolean) => void;
  addNotificationKeyword: (keyword: string) => void;
  removeNotificationKeyword: (keyword: string) => void;
  
  // Updates Actions
  setAutoCheckUpdates: (enabled: boolean) => void;
  
  // Debug Actions
  setDebugMode: (enabled: boolean) => void;
  
<<<<<<< HEAD
  // Setup Actions
  setSetupCompleted: (completed: boolean) => void;
  
=======
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
  // Query Preprocessing Actions
  setQueryPreprocessingEnabled: (enabled: boolean) => void;
  setQueryPreprocessingMinLength: (min: number) => void;
  setQueryPreprocessingMaxLength: (max: number) => void;
  setQueryPreprocessingAutoSplit: (autoSplit: boolean) => void;
  addIrrelevantPattern: (pattern: string) => void;
  removeIrrelevantPattern: (pattern: string) => void;
  
  // Content Processing Actions
  setContentProcessingEnabled: (enabled: boolean) => void;
  setContentProcessingAutoSummarize: (enabled: boolean) => void;
  setContentProcessingChunkingEnabled: (enabled: boolean) => void;
  setContentProcessingMaxChunkSize: (size: number) => void;
  setContentProcessingMinRelevanceScore: (score: number) => void;
  setContentProcessingUseKeyFactsExtraction: (enabled: boolean) => void;
  setContentProcessingFallbackToSummarization: (enabled: boolean) => void;
  
  // Runtime Actions
  setRuntime: (runtime: 'ollama' | 'llama-cpp') => void;
  setLlamaCppParams: (params: Partial<SettingsState['llamaCppParams']>) => void;
}

const defaultSystemPrompt = `Você é um assistente de IA local integrado ao OllaHub.

## REGRAS ABSOLUTAS

1. **Nunca** escreva tags \`<metadata>\`, JSON oculto ou textos como "Metadados:". Toda resposta deve ser apenas texto visível ao usuário.
2. Use Markdown limpo: títulos, listas e blocos de código com linguagem indicada.
3. Seja direto, técnico e objetivo. Resumos iniciais são bem-vindos em respostas longas.
4. Comandos e códigos devem estar em blocos triplos (\`\`\`bash, \`\`\`json, etc.).
5. Se receber um bloco [CONTEXTO WEB], use essas informações prioritariamente para responder.

## CONTEXTO WEB

- Quando informações da web forem fornecidas, use-as como fonte principal.
- NÃO cite fontes no meio do texto. Use as informações do contexto web naturalmente, sem mencionar [1], [2], [3] ou outras referências numéricas.
- Se o contexto não for suficiente, diga isso claramente.

## FORMATO SUGERIDO

- Resumo inicial (1–2 frases) quando necessário.
- Seções \`##\` para organizar o conteúdo.
- Listas para passos/itens.
- Blocos de código com linguagem específica.

## ESTILO

- Cite limitações, hipóteses e próximos passos.
- Inclua links apenas quando essencial.
- Respostas sempre limpas, sem metadados ou conteúdo oculto.`;

// Categorias padrão curadas
const defaultCategories: SearchCategory[] = [
  {
    id: 'academic',
    name: 'Acadêmico',
    baseSites: [
      'scielo.br',
      'arxiv.org',
      'scholar.google.com',
      'pubmed.ncbi.nlm.nih.gov',
      'researchgate.net',
    ],
    enabled: true,
  },
  {
    id: 'news',
    name: 'Notícias',
    baseSites: [
      'g1.globo.com',
      'bbc.com',
      'cnnbrasil.com.br',
      'folha.uol.com.br',
      'estadao.com.br',
    ],
    enabled: true,
  },
  {
    id: 'tech',
    name: 'Tech & Dev',
    baseSites: [
      'github.com',
      'stackoverflow.com',
      'dev.to',
      'tabnews.com.br',
      'medium.com',
    ],
    enabled: true,
  },
  {
    id: 'finance',
    name: 'Financeiro',
    baseSites: [
      'infomoney.com.br',
      'bloomberg.com',
      'valor.globo.com',
      'investing.com',
      'yahoo.com/finance',
    ],
    enabled: true,
  },
];

const initialState = {
  ollamaUrl: 'http://localhost:11434',
  selectedModel: '',
  selectedGpu: null,
  systemPrompt: defaultSystemPrompt,
  contextWindow: 4096,
  webSearch: {
    enabled: true,
    maxResults: 10,
    timeout: 15000, // Timeout em milissegundos (15 segundos)
    excludedDomains: ['youtube.com', 'linkedin.com'],
    maxConcurrentTabs: 5,
    totalSourcesLimit: 100,
    categories: defaultCategories,
    userCustomSites: [],
    enableSemanticExpansion: true, // Habilitado por padrão
    semanticExpansionLanguage: 'pt-BR', // Português brasileiro por padrão
    searxng: {
      enabled: false, // Não ativado por padrão
      selfHosted: false,
      url: 'http://localhost:8080',
      status: 'unknown' as const,
      lastChecked: 0,
    },
  },
  sourcesConfig: null,
  autoStart: false,
  notifications: {
    enabled: true,
    keywords: [],
  },
  autoCheckUpdates: true,
  debugMode: false,
<<<<<<< HEAD
  isSetupCompleted: false,
  runtime: 'ollama',
  llamaCppParams: {
    nGpuLayers: 0, // CPU por padrão
    nCtx: 4096,
    threads: 0, // Auto
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
  },
=======
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
  queryPreprocessing: {
    enabled: true,
    minLength: 3,
    maxLength: 2000,
    autoSplitQuestions: true,
    irrelevantPatterns: [
      'oi',
      'olá',
      'ola',
      'teste',
      'test',
      'hello',
      'hi',
      'hey',
    ],
  },
  contentProcessing: {
    enabled: true,
    autoSummarize: true,
    chunkingEnabled: true,
    maxChunkSize: 1024,
    minRelevanceScore: 0.1,
    useKeyFactsExtraction: true,
    fallbackToSummarization: true,
  },
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...initialState,

      setOllamaUrl: (url) => set({ ollamaUrl: url }),
      setSelectedModel: (model) => set({ selectedModel: model }),
      setSelectedGpu: (gpuId) => set({ selectedGpu: gpuId }),
      setSystemPrompt: (prompt) => set({ systemPrompt: prompt }),
      setContextWindow: (ctx) => set({ contextWindow: ctx }),
      setWebSearchEnabled: (enabled) =>
        set((state) => ({
          webSearch: { ...state.webSearch, enabled },
        })),
      setWebSearchMaxResults: (max) =>
        set((state) => ({
          webSearch: { ...state.webSearch, maxResults: max },
        })),
      setWebSearchTimeout: (timeout) =>
        set((state) => ({
          webSearch: { ...state.webSearch, timeout },
        })),
      setWebSearchMaxConcurrentTabs: (max) =>
        set((state) => ({
          webSearch: { ...state.webSearch, maxConcurrentTabs: max },
        })),
      setWebSearchTotalSourcesLimit: (limit) =>
        set((state) => ({
          webSearch: { ...state.webSearch, totalSourcesLimit: limit },
        })),
      setWebSearchSemanticExpansion: (enabled) =>
        set((state) => ({
          webSearch: { ...state.webSearch, enableSemanticExpansion: enabled },
        })),
      setWebSearchSemanticExpansionLanguage: (language) =>
        set((state) => ({
          webSearch: { ...state.webSearch, semanticExpansionLanguage: language },
        })),
      setSearxngEnabled: (enabled) =>
        set((state) => ({
          webSearch: {
            ...state.webSearch,
            searxng: { ...state.webSearch.searxng, enabled },
          },
        })),
      setSearxngUrl: (url) =>
        set((state) => ({
          webSearch: {
            ...state.webSearch,
            searxng: { ...state.webSearch.searxng, url },
          },
        })),
      setSearxngStatus: (status) =>
        set((state) => ({
          webSearch: {
            ...state.webSearch,
            searxng: { ...state.webSearch.searxng, status, lastChecked: Date.now() },
          },
        })),
      checkSearxngStatus: async () => {
        const state = useSettingsStore.getState();
        set((s) => ({
          webSearch: {
            ...s.webSearch,
            searxng: { ...s.webSearch.searxng, status: 'checking' as const },
          },
        }));
        
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const isAvailable = await invoke<boolean>('check_searxng_status', {
            url: state.webSearch.searxng.url,
          });
          
          set((s) => ({
            webSearch: {
              ...s.webSearch,
              searxng: {
                ...s.webSearch.searxng,
                status: isAvailable ? ('available' as const) : ('unavailable' as const),
                lastChecked: Date.now(),
              },
            },
          }));
        } catch (error) {
          console.error('Failed to check SearXNG status:', error);
          set((s) => ({
            webSearch: {
              ...s.webSearch,
              searxng: {
                ...s.webSearch.searxng,
                status: 'unavailable' as const,
                lastChecked: Date.now(),
              },
            },
          }));
        }
      },
      addExcludedDomain: (domain) =>
        set((state) => {
          const normalized = domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
          if (!normalized || state.webSearch.excludedDomains.includes(normalized)) {
            return state;
          }
          return {
            webSearch: {
              ...state.webSearch,
              excludedDomains: [...state.webSearch.excludedDomains, normalized],
            },
          };
        }),
      removeExcludedDomain: (domain) =>
        set((state) => ({
          webSearch: {
            ...state.webSearch,
            excludedDomains: state.webSearch.excludedDomains.filter((d) => d !== domain),
          },
        })),
      toggleCategory: (categoryId) =>
        set((state) => ({
          webSearch: {
            ...state.webSearch,
            categories: state.webSearch.categories.map((cat) =>
              cat.id === categoryId ? { ...cat, enabled: !cat.enabled } : cat
            ),
          },
        })),
      updateCategory: (category) =>
        set((state) => ({
          webSearch: {
            ...state.webSearch,
            categories: state.webSearch.categories.map((cat) =>
              cat.id === category.id ? category : cat
            ),
          },
        })),
      addCustomSite: (site) =>
        set((state) => {
          const normalized = site.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
          if (!normalized || state.webSearch.userCustomSites.includes(normalized)) {
            return state;
          }
          return {
            webSearch: {
              ...state.webSearch,
              userCustomSites: [...state.webSearch.userCustomSites, normalized],
            },
          };
        }),
      removeCustomSite: (site) =>
        set((state) => ({
          webSearch: {
            ...state.webSearch,
            userCustomSites: state.webSearch.userCustomSites.filter((s) => s !== site),
          },
        })),
      resetSettings: () => set(initialState),
      
      // Sources Config Actions
      fetchSources: async () => {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const config = await invoke<SourcesConfig>('load_sources_config_command');
          set({ sourcesConfig: config });
        } catch (error) {
          console.error('Failed to fetch sources config:', error);
        }
      },
      saveSources: async (config: SourcesConfig) => {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('save_sources_config_command', { config });
          set({ sourcesConfig: config });
        } catch (error) {
          console.error('Failed to save sources config:', error);
          throw error;
        }
      },
      
      // AutoStart Actions
      toggleAutoStart: async () => {
        // TODO: Implementar quando tauri-plugin-autostart estiver configurado
        set((state) => ({ autoStart: !state.autoStart }));
      },
      
      // Notifications Actions
      setNotificationsEnabled: (enabled) =>
        set((state) => ({
          notifications: { ...state.notifications, enabled },
        })),
      addNotificationKeyword: (keyword) =>
        set((state) => {
          const normalized = keyword.toLowerCase().trim();
          if (!normalized || state.notifications.keywords.includes(normalized)) {
            return state;
          }
          return {
            notifications: {
              ...state.notifications,
              keywords: [...state.notifications.keywords, normalized],
            },
          };
        }),
      removeNotificationKeyword: (keyword) =>
        set((state) => ({
          notifications: {
            ...state.notifications,
            keywords: state.notifications.keywords.filter((k) => k !== keyword),
          },
        })),
      
      // Updates Actions
      setAutoCheckUpdates: (enabled) =>
        set({ autoCheckUpdates: enabled }),
      
      // Debug Actions
      setDebugMode: (enabled) =>
        set({ debugMode: enabled }),
      
<<<<<<< HEAD
      // Setup Actions
      setSetupCompleted: (completed) =>
        set({ isSetupCompleted: completed }),
      
=======
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
      // Query Preprocessing Actions
      setQueryPreprocessingEnabled: (enabled) =>
        set((state) => ({
          queryPreprocessing: { ...state.queryPreprocessing, enabled },
        })),
      setQueryPreprocessingMinLength: (min) =>
        set((state) => ({
          queryPreprocessing: { ...state.queryPreprocessing, minLength: min },
        })),
      setQueryPreprocessingMaxLength: (max) =>
        set((state) => ({
          queryPreprocessing: { ...state.queryPreprocessing, maxLength: max },
        })),
      setQueryPreprocessingAutoSplit: (autoSplit) =>
        set((state) => ({
          queryPreprocessing: { ...state.queryPreprocessing, autoSplitQuestions: autoSplit },
        })),
      addIrrelevantPattern: (pattern) =>
        set((state) => {
          const normalized = pattern.toLowerCase().trim();
          if (!normalized || state.queryPreprocessing.irrelevantPatterns.includes(normalized)) {
            return state;
          }
          return {
            queryPreprocessing: {
              ...state.queryPreprocessing,
              irrelevantPatterns: [...state.queryPreprocessing.irrelevantPatterns, normalized],
            },
          };
        }),
      removeIrrelevantPattern: (pattern) =>
        set((state) => ({
          queryPreprocessing: {
            ...state.queryPreprocessing,
            irrelevantPatterns: state.queryPreprocessing.irrelevantPatterns.filter(
              (p) => p !== pattern.toLowerCase().trim()
            ),
          },
        })),
      
      // Content Processing Actions
      setContentProcessingEnabled: (enabled) =>
        set((state) => ({
          contentProcessing: { ...state.contentProcessing, enabled },
        })),
      setContentProcessingAutoSummarize: (enabled) =>
        set((state) => ({
          contentProcessing: { ...state.contentProcessing, autoSummarize: enabled },
        })),
      setContentProcessingChunkingEnabled: (enabled) =>
        set((state) => ({
          contentProcessing: { ...state.contentProcessing, chunkingEnabled: enabled },
        })),
      setContentProcessingMaxChunkSize: (size) =>
        set((state) => ({
          contentProcessing: { ...state.contentProcessing, maxChunkSize: size },
        })),
      setContentProcessingMinRelevanceScore: (score) =>
        set((state) => ({
          contentProcessing: { ...state.contentProcessing, minRelevanceScore: score },
        })),
      setContentProcessingUseKeyFactsExtraction: (enabled) =>
        set((state) => ({
          contentProcessing: { ...state.contentProcessing, useKeyFactsExtraction: enabled },
        })),
      setContentProcessingFallbackToSummarization: (enabled) =>
        set((state) => ({
          contentProcessing: { ...state.contentProcessing, fallbackToSummarization: enabled },
        })),
      
      // Runtime Actions
      setRuntime: (runtime) => set({ runtime }),
      setLlamaCppParams: (params) =>
        set((state) => ({
          llamaCppParams: { ...state.llamaCppParams, ...params },
        })),
    }),
    {
      name: 'ollahub-settings',
<<<<<<< HEAD
      version: 7,
=======
      version: 4,
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
      migrate: (persistedState: any, version: number) => {
        // Migração da versão 1 para 3
        if (version < 3) {
          return {
            ...persistedState,
            autoCheckUpdates: persistedState.autoCheckUpdates ?? true,
          };
        }
        // Migração da versão 3 para 4
        if (version < 4) {
          return {
            ...persistedState,
            debugMode: persistedState.debugMode ?? false,
          };
        }
<<<<<<< HEAD
        // Migração da versão 4 para 5
        if (version < 5) {
          return {
            ...persistedState,
            isSetupCompleted: persistedState.isSetupCompleted ?? false,
          };
        }
        // Migração da versão 5 para 6
        if (version < 6) {
          return {
            ...persistedState,
            runtime: persistedState.runtime ?? 'ollama',
            llamaCppParams: persistedState.llamaCppParams ?? {
              nGpuLayers: 0,
              nCtx: 4096,
              threads: 0,
              temperature: 0.7,
              topP: 0.9,
              topK: 40,
            },
          };
        }
        // Migração da versão 6 para 7
        if (version < 7) {
          return {
            ...persistedState,
            webSearch: {
              ...persistedState.webSearch,
              searxng: persistedState.webSearch?.searxng ?? {
                enabled: false,
                selfHosted: false,
                url: 'http://localhost:8080',
                status: 'unknown',
                lastChecked: 0,
              },
            },
          };
        }
=======
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
        return persistedState;
      },
    }
  )
);

