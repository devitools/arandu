import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'next-themes';
import { TopBar } from '@/components/TopBar';

describe('TopBar', () => {
  it('renders logo and app name', () => {
    render(
      <ThemeProvider>
        <TopBar />
      </ThemeProvider>
    );

    expect(screen.getByText('Arandu')).toBeInTheDocument();
    expect(screen.getByAltText('Arandu Logo')).toBeInTheDocument();
  });

  it('renders theme toggle button', () => {
    render(
      <ThemeProvider>
        <TopBar />
      </ThemeProvider>
    );

    const themeButton = screen.getByRole('button', { name: /alternar tema/i });
    expect(themeButton).toBeInTheDocument();
  });
});
