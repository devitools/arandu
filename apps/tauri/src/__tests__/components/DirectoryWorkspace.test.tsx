import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { DirectoryWorkspace } from '@/components/DirectoryWorkspace';
import { AppProvider } from '@/contexts/AppContext';

vi.mock('@/hooks/useAcpConnection', () => ({
  useAcpConnection: () => ({
    isConnected: false,
    isConnecting: false,
    connectionError: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

vi.mock('@/hooks/useLocalSessions', () => ({
  useLocalSessions: () => ({
    sessions: [],
    loading: false,
    createSession: vi.fn(),
    deleteSession: vi.fn(),
    updateSessionLocal: vi.fn(),
  }),
}));

vi.mock('@/components/ActiveSessionView', () => ({
  ActiveSessionView: () => <div data-testid="active-session" />,
}));

vi.mock('@/components/SessionCard', () => ({
  SessionCard: () => <div data-testid="session-card" />,
}));

function renderWithContext() {
  return render(
    <AppProvider>
      <DirectoryWorkspace />
    </AppProvider>
  );
}

describe('DirectoryWorkspace', () => {
  it('returns null when no workspace is expanded', () => {
    const { container } = renderWithContext();
    expect(container.firstChild).toBeNull();
  });
});
