import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@/lib/theme';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TopBar } from '@/components/TopBar';

describe('TopBar', () => {
  it('renders logo and app name', () => {
    render(
      <ThemeProvider>
        <TooltipProvider>
          <TopBar />
        </TooltipProvider>
      </ThemeProvider>
    );

    expect(screen.getByText('Arandu')).toBeInTheDocument();
    expect(screen.getByAltText('Arandu Logo')).toBeInTheDocument();
  });

  it('renders theme toggle button', () => {
    render(
      <ThemeProvider>
        <TooltipProvider>
          <TopBar />
        </TooltipProvider>
      </ThemeProvider>
    );

    const themeButton = screen.getByRole('button', { name: /alternar tema/i });
    expect(themeButton).toBeInTheDocument();
  });
});
