# Visualizando Markdown

O Arandu usa [comrak](https://github.com/kivikakk/comrak) para renderizar GitHub Flavored Markdown (GFM) com fidelidade total.

## Elementos suportados

### Formatação de texto

| Sintaxe | Resultado |
|---------|-----------|
| `**negrito**` | **negrito** |
| `*itálico*` | *itálico* |
| `~~tachado~~` | ~~tachado~~ |
| `` `código inline` `` | `código inline` |

### Tabelas

```markdown
| Coluna 1 | Coluna 2 | Coluna 3 |
|----------|----------|----------|
| valor    | valor    | valor    |
```

### Listas de tarefas

```markdown
- [x] Tarefa concluída
- [ ] Tarefa pendente
```

### Blocos de código

Suporte a realce de sintaxe para mais de 190 linguagens via highlight.js:

````markdown
```typescript
function greet(name: string): string {
  return `Hello, ${name}!`
}
```
````

### Links automáticos

URLs como `https://arandu.app` são automaticamente convertidos em links clicáveis.

### Notas de rodapé

```markdown
Texto com nota[^1].

[^1]: Texto da nota de rodapé.
```

## Realce de sintaxe

O Arandu aplica automaticamente temas de realce de sintaxe (light/dark) que acompanham o tema da interface. Suporte nativo para TypeScript, Rust, Python, Go, Shell, SQL e mais de 190 outras linguagens.

## Largura de leitura

O conteúdo é exibido com largura máxima otimizada para leitura (~80 caracteres), centralizado na janela.
