# Sessões e Modos de Interação

## O que são sessões

Uma sessão é uma conversa persistente com um agente de codificação dentro de um workspace. Cada sessão tem:

- Histórico completo de mensagens
- Modo de interação atual
- Plano associado (opcional)
- Fase de execução (idle, planning, reviewing, executing)

As sessões são armazenadas em SQLite e mantidas entre reinicializações do app.

## Modos de interação

O Arandu suporta seis modos de interação com o agente:

### ask
Modo conversacional para perguntas gerais. Ideal para:
- Explorar o codebase
- Entender decisões de arquitetura
- Tirar dúvidas técnicas

### plan
Gera um documento de plano estruturado. O plano é salvo como arquivo Markdown e exibido no Arandu para revisão. Ideal para:
- Planejar novas funcionalidades
- Criar roteiros de implementação
- Definir arquitetura

### code
Gera ou modifica código. O agente tem acesso ao contexto do projeto e pode:
- Criar novos arquivos
- Modificar código existente
- Refatorar

### edit
Aplica edições pontuais e cirúrgicas a arquivos. Mais preciso que o modo `code` para mudanças específicas.

### agent
Execução autônoma de múltiplos passos. O agente decide as ações necessárias para completar a tarefa.

### autopilot
Execução totalmente automatizada. O agente completa a tarefa sem solicitar confirmações intermediárias.

::: warning
Use os modos `agent` e `autopilot` com cuidado — eles podem fazer modificações abrangentes no seu projeto.
:::

## Streaming de respostas

As respostas do agente são transmitidas em tempo real via streaming, com suporte a cancelamento a qualquer momento.

## Criando uma sessão

1. Abra um workspace
2. Clique em **Nova Sessão**
3. Selecione o modo inicial
4. Digite seu primeiro prompt

## Alternando entre sessões

Use o painel lateral do workspace para navegar entre sessões existentes. Cada sessão é identificada por um nome e data de criação.
