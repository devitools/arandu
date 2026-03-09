import '@testing-library/jest-dom';
import { vi } from 'vitest';
import '@/lib/i18n';

globalThis.__TAURI__ = {
  core: {
    invoke: vi.fn().mockResolvedValue([]),
  },
  window: {
    getCurrentWindow: vi.fn(() => ({
      label: 'main',
      show: vi.fn(() => Promise.resolve()),
      setFocus: vi.fn(() => Promise.resolve()),
    })),
  },
  dialog: {
    open: vi.fn(),
  },
  event: {
    emit: vi.fn(() => Promise.resolve()),
    listen: vi.fn(() => Promise.resolve(() => {})),
  },
};

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
globalThis.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
  unobserve: vi.fn(),
})) as any;

// Mock ResizeObserver
globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
  unobserve: vi.fn(),
})) as any;
