# Markdown

O Arandu renderiza GitHub Flavored Markdown (GFM) usando [comrak](https://github.com/kivikakk/comrak), a mesma biblioteca usada por ferramentas profissionais de processamento de Markdown.

## GitHub Flavored Markdown

Conformidade total com a especificação GFM:

- ✅ Tabelas
- ✅ Listas de tarefas
- ✅ Tachado (`~~texto~~`)
- ✅ Autolinks (`https://...`)
- ✅ Notas de rodapé
- ✅ HTML inline (sanitizado)
- ✅ Blocos de código com linguagem
- ✅ Citações em bloco (blockquotes)
- ✅ Separadores horizontais
- ✅ Headings com âncoras

## Realce de sintaxe

Blocos de código são realçados automaticamente por [highlight.js](https://highlightjs.org/) com suporte a mais de 190 linguagens. O tema muda automaticamente com o tema claro/escuro da interface.

### Exemplo

````markdown
```rust
fn main() {
    println!("Hello, Arandu!");
}
```
````

## Extensões

Além do GFM padrão, o Arandu suporta:

- **Superscript**: `x^2^`
- **Notas de rodapé**: `[^1]`
- **Tabelas de conteúdo**: geradas automaticamente com o outline lateral

## Renderização no backend

O Markdown é renderizado no processo Rust (Tauri backend) e enviado como HTML para o frontend. Isso garante:

- **Segurança**: HTML sanitizado, sem execução de scripts
- **Desempenho**: Renderização rápida mesmo para documentos grandes
- **Fidelidade**: Comportamento idêntico ao GitHub
