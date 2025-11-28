# Configuração do Sistema de Atualização Automática

Este documento explica como configurar o sistema de atualização automática do OllaHub.

## Pré-requisitos

1. Repositório GitHub configurado
2. Rust e Cargo instalados
3. Tauri CLI instalado

## Passo 1: Gerar Chaves de Assinatura

Execute o script para gerar as chaves:

```bash
chmod +x scripts/generate-updater-keys.sh
./scripts/generate-updater-keys.sh
```

Ou manualmente:

```bash
mkdir -p ~/.tauri
cargo tauri signer generate -w ~/.tauri/ollahub.key
```

## Passo 2: Configurar Chave Pública

1. Copie a chave pública gerada (está em `~/.tauri/ollahub.key.pub`)
2. Edite `src-tauri/tauri.conf.json`
3. Substitua `YOUR_PUBLIC_KEY_HERE` pela chave pública
4. Atualize o endpoint com seu repositório GitHub:

```json
{
  "updater": {
    "active": true,
    "endpoints": [
      "https://api.github.com/repos/SEU_USUARIO/SEU_REPOSITORIO/releases/latest"
    ],
    "dialog": true,
    "pubkey": "SUA_CHAVE_PUBLICA_AQUI"
  }
}
```

## Passo 3: Configurar GitHub Secrets

1. Vá em **Settings** > **Secrets and variables** > **Actions**
2. Clique em **New repository secret**
3. Nome: `TAURI_UPDATER_PRIVATE_KEY`
4. Valor: Cole o conteúdo completo do arquivo `~/.tauri/ollahub.key`

## Passo 4: Atualizar Workflow (se necessário)

O workflow `.github/workflows/release.yml` já está configurado para:
- Buildar para Windows, macOS e Linux
- Assinar binários com a chave privada
- Criar release automaticamente quando há push em `main`/`master`

## Como Funciona

1. **Build Automático**: Quando você faz push para `main`/`master`, o GitHub Actions:
   - Builda o app para todas as plataformas
   - Assina os binários
   - Cria uma release no GitHub

2. **Verificação de Atualizações**: O app verifica automaticamente:
   - 5 segundos após iniciar (primeira verificação)
   - A cada 6 horas (verificação periódica)
   - Manualmente via botão nas configurações

3. **Instalação**: Quando há atualização disponível:
   - Usuário recebe notificação
   - Pode escolher atualizar agora ou depois
   - Download e instalação são automáticos
   - App reinicia automaticamente após instalação

## Bump de Versão

Para criar uma nova versão:

```bash
# Patch (0.1.0 -> 0.1.1)
pnpm run bump-version patch --commit

# Minor (0.1.0 -> 0.2.0)
pnpm run bump-version minor --commit

# Major (0.1.0 -> 1.0.0)
pnpm run bump-version major --commit
```

Depois, faça push:

```bash
git push && git push --tags
```

O GitHub Actions criará automaticamente a release.

## Troubleshooting

### Erro: "Failed to check for updates"
- Verifique se o endpoint no `tauri.conf.json` está correto
- Verifique se há releases públicas no GitHub
- Verifique a conexão com a internet

### Erro: "Signature verification failed"
- Verifique se a chave pública no `tauri.conf.json` está correta
- Verifique se a chave privada no GitHub Secret está correta
- Regere as chaves se necessário

### Release não é criada automaticamente
- Verifique se o push foi feito para `main` ou `master`
- Verifique os logs do GitHub Actions
- Verifique se as permissões do workflow estão corretas

