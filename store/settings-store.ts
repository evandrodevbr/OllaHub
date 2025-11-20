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

  // Actions
  setOllamaUrl: (url: string) => void;
  setSelectedModel: (model: string) => void;
  setSystemPrompt: (prompt: string) => void;
  setContextWindow: (ctx: number) => void;
  setWebSearchEnabled: (enabled: boolean) => void;
  setWebSearchMaxResults: (max: number) => void;
  setWebSearchTimeout: (timeout: number) => void;
  setWebSearchMaxConcurrentTabs: (max: number) => void;
  setWebSearchTotalSourcesLimit: (limit: number) => void;
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
    enabled: false,
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
    enabled: false,
  },
];

const initialState = {
  ollamaUrl: 'http://localhost:11434',
  selectedModel: '',
  systemPrompt: defaultSystemPrompt,
  contextWindow: 4096,
  webSearch: {
    enabled: true,
    maxResults: 10,
    timeout: 10,
    excludedDomains: ['youtube.com', 'linkedin.com'],
    maxConcurrentTabs: 5,
    totalSourcesLimit: 100,
    categories: defaultCategories,
    userCustomSites: [],
  },
  sourcesConfig: null,
  autoStart: false,
  notifications: {
    enabled: true,
    keywords: [],
  },
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...initialState,

      setOllamaUrl: (url) => set({ ollamaUrl: url }),
      setSelectedModel: (model) => set({ selectedModel: model }),
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
    }),
    {
      name: 'ollahub-settings',
      version: 1,
    }
  )
);

