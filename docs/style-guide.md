# Guia de Estilo de UI – OllaHub

## Espaçamento (escala 8px)
- Tokens: 8, 16, 24, 32, 40, 48, 56, 64
- Classes Tailwind equivalentes: `2, 4, 6, 8, 10, 12, 14, 16`
- Recomendações:
  - Conteúdo: `p-4` (mobile), `p-6` (tablet), `p-8` (desktop)
  - Listas/Stacks: `gap-4` (16px) padrão
  - Separações de seção: `py-6` (24px) ou `py-8` (32px)

## Raios de Borda
- Token base: `--radius` (10px)
- Derivados: `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl` mapeiam para `--radius-*`
- Interativos: usar `rounded-md` como padrão; cartões e contêineres: `rounded-lg/xl`

## Responsividade
- Breakpoints: `sm` (mobile), `md` (tablet), `lg` (desktop)
- Padrões:
  - Padding: `px-4 md:px-6 lg:px-8`
  - Tipografia e gaps escalam suavemente (ex: `gap-4 md:gap-6`)

## Acessibilidade
- Contraste: seguir WCAG AA; tokens base usam OKLCH calibrado
- Alto contraste: atributo global `data-high-contrast="true"` habilita variações de mensagem
- Foco: `focus-visible:ring-2` com `ring-ring/50`

## Componentes Base
- `Section`: container com padding responsivo padrão
- `Stack`: layout de coluna/linha com `gap` na escala de 8px

## Aplicação Consistente
- Mensagens: gradientes sutis, `rounded-xl`, estados (hover/selecionado)
- Botões: alturas `h-8`, `h-10`, `h-12` (32/40/48px)
- Card/Content: `p-4` (mínimo), evitar `p-3`