# Markdown

Arandu renders GitHub Flavored Markdown (GFM) using [comrak](https://github.com/kivikakk/comrak), the same library used by professional Markdown processing tools.

## GitHub Flavored Markdown

Full compliance with the GFM specification:

- ✅ Tables
- ✅ Task lists
- ✅ Strikethrough (`~~text~~`)
- ✅ Autolinks (`https://...`)
- ✅ Footnotes
- ✅ Inline HTML (sanitized)
- ✅ Code blocks with language
- ✅ Blockquotes
- ✅ Horizontal rules
- ✅ Headings with anchors

## Syntax highlighting

Code blocks are automatically highlighted by [highlight.js](https://highlightjs.org/) with support for over 190 languages. The theme changes automatically with the interface's light/dark theme.

### Example

````markdown
```rust
fn main() {
    println!("Hello, Arandu!");
}
```
````

## Extensions

Beyond standard GFM, Arandu supports:

- **Superscript**: `x^2^`
- **Footnotes**: `[^1]`
- **Table of contents**: automatically generated with the sidebar outline

## Backend rendering

Markdown is rendered in the Rust process (Tauri backend) and sent as HTML to the frontend. This ensures:

- **Security**: Sanitized HTML, no script execution
- **Performance**: Fast rendering even for large documents
- **Fidelity**: Behavior identical to GitHub
