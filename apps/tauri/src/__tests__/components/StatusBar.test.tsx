import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppProvider } from '@/contexts/AppContext';
import { StatusBar } from '@/components/StatusBar';

describe('StatusBar', () => {
  it('renders version number', () => {
    render(
      <AppProvider>
        <StatusBar />
      </AppProvider>
    );

    expect(screen.getByText('Arandu v0.2.0')).toBeInTheDocument();
  });

  it('shows workspace count when no workspace is expanded', () => {
    render(
      <AppProvider>
        <StatusBar />
      </AppProvider>
    );

    expect(screen.getByText('0 workspaces')).toBeInTheDocument();
  });
});
