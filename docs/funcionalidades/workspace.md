# Workspace

Um Workspace é um diretório de projeto conectado a um agente de codificação via ACP (Agent Communication Protocol).

## O que é um Workspace

Quando você abre uma pasta no Arandu como workspace, você está criando um contexto de trabalho onde:

1. **Sessões** são vinculadas ao diretório do projeto
2. **Um agente** (ex: GitHub Copilot CLI) é conectado via ACP
3. **Planos** são gerados, revisados e executados dentro desse contexto

## Abrindo um Workspace

1. Na tela inicial, clique em **Abrir Workspace**
2. Selecione o diretório do projeto
3. Clique em **Conectar** para iniciar uma sessão com o agente

Ou via CLI:

```bash
arandu /caminho/para/projeto
```

## Como funciona a conexão ACP

O Arandu se comunica com agentes de codificação via JSON-RPC 2.0 sobre stdin/stdout:

```
Arandu (frontend) → Tauri (Rust) → github-copilot --acp --stdio
                                         ↑ stdin/stdout
```

O agente precisa suportar o protocolo ACP. Atualmente, o [GitHub Copilot CLI](https://github.com/github/gh-copilot) é o agente testado e suportado.

## Gerenciamento de sessões

Cada workspace pode ter múltiplas sessões, cada uma com:

- Histórico de mensagens
- Modo de interação atual
- Plano associado (se houver)
- Fase do plano (idle, planning, reviewing, executing)

As sessões são persistidas em SQLite e restauradas automaticamente.

## Fluxo típico de trabalho

```
1. Abrir workspace (diretório do projeto)
2. Conectar agente
3. Criar sessão
4. Usar modo "ask" para explorar o contexto
5. Usar modo "plan" para criar um plano de implementação
6. Revisar o plano com comentários inline
7. Usar modo "code" ou "agent" para executar
```

## Agentes suportados

| Agente | Status |
|--------|--------|
| GitHub Copilot CLI | ✅ Suportado |
| Outros agentes ACP | 🔜 Em planejamento |
