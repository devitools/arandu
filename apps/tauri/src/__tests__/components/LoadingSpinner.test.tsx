import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner, LoadingScreen } from '@/components/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders spinner', () => {
    render(<LoadingSpinner />);
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('renders with text when provided', () => {
    render(<LoadingSpinner text="Loading data..." />);
    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('renders without text by default', () => {
    render(<LoadingSpinner />);
    const textElement = screen.queryByText(/Loading/i);
    expect(textElement).not.toBeInTheDocument();
  });

  it('applies correct size classes', () => {
    const { container: smContainer } = render(<LoadingSpinner size="sm" />);
    expect(smContainer.querySelector('.h-4')).toBeInTheDocument();

    const { container: mdContainer } = render(<LoadingSpinner size="md" />);
    expect(mdContainer.querySelector('.h-8')).toBeInTheDocument();

    const { container: lgContainer } = render(<LoadingSpinner size="lg" />);
    expect(lgContainer.querySelector('.h-12')).toBeInTheDocument();
  });
});

describe('LoadingScreen', () => {
  it('renders full screen loading', () => {
    render(<LoadingScreen />);
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('renders with custom text', () => {
    render(<LoadingScreen text="Please wait..." />);
    expect(screen.getByText('Please wait...')).toBeInTheDocument();
  });
});
