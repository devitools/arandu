# Comentários em Blocos

O sistema de comentários do Arandu permite adicionar anotações em qualquer bloco de um documento Markdown — perfeito para revisão de planos gerados por IA.

## Como adicionar um comentário

**Cmd+Clique** (macOS) ou **Ctrl+Clique** (Linux/Windows) em qualquer bloco do documento:

- Parágrafo
- Item de lista
- Bloco de código
- Citação (blockquote)
- Heading

Um painel lateral abre com um campo de texto para o comentário.

## Sistema de IDs de bloco

Cada bloco recebe um ID único baseado em seu tipo e posição:

| Tipo | Formato de ID |
|------|---------------|
| Parágrafo | `para-{hash}` |
| Lista | `list-{hash}` |
| Código | `code-{hash}` |
| Citação | `quote-{hash}` |
| Heading | `heading-{hash}` |

Isso permite que os comentários sejam associados ao bloco correto mesmo após edições menores no documento.

## Indicadores visuais

- Blocos com comentários exibem um **badge** com o número de comentários
- O badge é visível sem precisar clicar
- Comentários não resolvidos são destacados em amarelo

## Resolver e desfazer resolução

Cada comentário pode ser marcado como resolvido:
- Clique em **✓ Resolver** no comentário
- O badge do bloco é atualizado
- Comentários resolvidos são exibidos com estilo diferenciado

## Detecção de obsolescência

Se o arquivo for modificado externamente, o Arandu compara o hash do arquivo atual com o hash armazenado. Comentários em blocos que mudaram são marcados como **obsoletos** (stale).

## Persistência

Os comentários são armazenados em SQLite:
- `~/.local/share/arandu/comments.db` (Linux/Windows)
- `~/Library/Application Support/com.devitools.arandu/comments.db` (macOS)

## Prompt de revisão

O painel de revisão agrega todos os comentários não resolvidos em um prompt consolidado, pronto para ser enviado ao agente. Veja [Review](/funcionalidades/review).
