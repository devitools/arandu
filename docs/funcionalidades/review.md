# Review — Revisão de Documentos

O Arandu funciona como uma ferramenta de revisão de planos e documentos gerados por agentes de IA.

## Dois modos de revisão

### Modo Comentários
Lista todos os comentários não resolvidos do documento atual, organizados por bloco.

### Modo Review
Gera um prompt de revisão consolidado com todos os comentários, pronto para ser enviado ao agente.

## Caso de uso principal: `EDITOR=arandu`

Configure o Arandu como seu editor padrão para trabalhar com agentes de codificação no terminal:

```bash
# ~/.bashrc ou ~/.zshrc
alias claude='EDITOR=arandu ~/.local/bin/claude'
alias copilot='EDITOR=arandu gh copilot'
```

### Fluxo de trabalho

```
1. Agente gera plano → escreve em arquivo .md
2. Arandu abre automaticamente como EDITOR
3. Você lê o plano e adiciona comentários (Cmd/Ctrl+Clique)
4. Clica em "Gerar prompt de revisão"
5. Copia o prompt e envia ao agente
6. Agente revisa e gera nova versão
7. Repete até aprovação
```

### Exemplo com claude

```bash
alias claude='EDITOR=arandu ~/.local/bin/claude'
claude "crie um plano de implementação para adicionar autenticação JWT"
# Arandu abre automaticamente com o plano gerado
# Você revisa, comenta, e envia feedback
```

## Prompt de revisão

O prompt gerado segue este formato:

```
Revisão do plano: {nome-do-arquivo}

Comentários por bloco:

[Bloco: "## Arquitetura"]
- A camada de cache parece desnecessária para o MVP. Remover por ora.

[Bloco: "### Implementação"]
- Por favor, adicione testes unitários ao plano.

Por favor, revise o plano considerando esses pontos.
```

## Integração com o fluxo de plano

O sistema de review é integrado ao fluxo de plano do workspace:

1. Modo `plan` → agente gera plano
2. Fase `reviewing` → você comenta
3. "Solicitar Revisão" → prompt enviado ao agente
4. Fase `planning` novamente → agente revisa
5. Fase `reviewing` → aprovação ou nova rodada
