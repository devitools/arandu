# Viewing Markdown

Arandu uses [comrak](https://github.com/kivikakk/comrak) to render GitHub Flavored Markdown (GFM) with full fidelity.

## Supported elements

### Text formatting

| Syntax | Result |
|--------|--------|
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `~~strikethrough~~` | ~~strikethrough~~ |
| `` `inline code` `` | `inline code` |

### Tables

```markdown
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| value    | value    | value    |
```

### Task lists

```markdown
- [x] Completed task
- [ ] Pending task
```

### Code blocks

Syntax highlighting support for over 190 languages via highlight.js:

````markdown
```typescript
function greet(name: string): string {
  return `Hello, ${name}!`
}
```
````

### Autolinks

URLs like `https://arandu.app` are automatically converted to clickable links.

### Footnotes

```markdown
Text with a footnote[^1].

[^1]: Footnote text.
```

## Syntax highlighting

Arandu automatically applies syntax highlighting themes (light/dark) that follow the interface theme. Native support for TypeScript, Rust, Python, Go, Shell, SQL, and over 190 other languages.

## Reading width

Content is displayed with an optimized maximum reading width (~80 characters), centered in the window.
