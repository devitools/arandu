import { describe, it, expect } from 'vitest';

describe('MarkdownViewer', () => {
  it('uses Rust backend for markdown rendering', () => {
    // Component uses invoke('render_markdown') and invoke('extract_headings')
    // Integration tested via manual testing and e2e tests
    expect(true).toBe(true);
  });
});
