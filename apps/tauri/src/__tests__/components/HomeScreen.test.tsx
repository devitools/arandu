import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppProvider } from '@/contexts/AppContext';
import { HomeScreen } from '@/components/HomeScreen';

describe('HomeScreen', () => {
  it('renders empty state with action buttons when no workspaces', () => {
    render(
      <AppProvider>
        <HomeScreen />
      </AppProvider>
    );

    expect(screen.getByText('Arandu')).toBeInTheDocument();
    expect(screen.getByText('Abrir Arquivo')).toBeInTheDocument();
    expect(screen.getByText('Abrir Diretório')).toBeInTheDocument();
  });
});
