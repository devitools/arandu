# Block Comments

Arandu's comment system lets you add annotations to any block in a Markdown document — perfect for reviewing AI-generated plans.

## How to add a comment

**Cmd+Click** (macOS) or **Ctrl+Click** (Linux/Windows) on any block in the document:

- Paragraph
- List item
- Code block
- Blockquote
- Heading

A side panel opens with a text field for the comment.

## Block ID system

Each block receives a unique ID based on its type and position:

| Type | ID format |
|------|-----------|
| Paragraph | `para-{hash}` |
| List | `list-{hash}` |
| Code | `code-{hash}` |
| Blockquote | `quote-{hash}` |
| Heading | `heading-{hash}` |

This allows comments to be associated with the correct block even after minor document edits.

## Visual indicators

- Blocks with comments display a **badge** with the comment count
- The badge is visible without clicking
- Unresolved comments are highlighted in yellow

## Resolving and unresolving

Each comment can be marked as resolved:
- Click **✓ Resolve** on the comment
- The block's badge is updated
- Resolved comments are displayed with a distinct style

## Staleness detection

If the file is modified externally, Arandu compares the current file hash with the stored hash. Comments on blocks that have changed are marked as **stale**.

## Persistence

Comments are stored in SQLite:
- `~/.local/share/arandu/comments.db` (Linux/Windows)
- `~/Library/Application Support/com.devitools.arandu/comments.db` (macOS)

## Review prompt

The review panel aggregates all unresolved comments into a consolidated prompt, ready to send to the agent. See [Review](/en/features/review).
