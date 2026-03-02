import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  it('calls handler when matching key is pressed', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        {
          key: 'k',
          metaKey: true,
          handler,
        },
      ])
    );

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
    });
    window.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not call handler when key does not match', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        {
          key: 'k',
          metaKey: true,
          handler,
        },
      ])
    );

    const event = new KeyboardEvent('keydown', {
      key: 'j',
      metaKey: true,
    });
    window.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not call handler when modifier keys do not match', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        {
          key: 'k',
          metaKey: true,
          shiftKey: false,
          handler,
        },
      ])
    );

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      shiftKey: true,
    });
    window.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
  });

  it('calls handler with shift key when specified', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        {
          key: 'o',
          metaKey: true,
          shiftKey: true,
          handler,
        },
      ])
    );

    const event = new KeyboardEvent('keydown', {
      key: 'o',
      metaKey: true,
      shiftKey: true,
    });
    window.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('handles Escape key', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        {
          key: 'Escape',
          handler,
        },
      ])
    );

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
    });
    window.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('prevents default when preventDefault is true', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        {
          key: 'k',
          metaKey: true,
          handler,
          preventDefault: true,
        },
      ])
    );

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
    });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('cleans up event listener on unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts([
        {
          key: 'k',
          metaKey: true,
          handler,
        },
      ])
    );

    unmount();

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
    });
    window.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
  });
});
