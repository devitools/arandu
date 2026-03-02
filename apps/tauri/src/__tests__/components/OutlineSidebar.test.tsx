import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OutlineSidebar } from '@/components/OutlineSidebar';
import type { Heading } from '@/types';

describe('OutlineSidebar', () => {
  it('shows empty state when no headings', () => {
    render(<OutlineSidebar headings={[]} />);

    expect(screen.getByText('Sumário')).toBeInTheDocument();
    expect(screen.getByText('Nenhum título encontrado')).toBeInTheDocument();
  });

  it('renders headings list', () => {
    const headings: Heading[] = [
      { level: 1, text: 'Title', index: 0 },
      { level: 2, text: 'Subtitle', index: 1 },
    ];

    render(<OutlineSidebar headings={headings} />);

    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Subtitle')).toBeInTheDocument();
  });

  it('applies indentation based on heading level', () => {
    const headings: Heading[] = [
      { level: 1, text: 'Level 1', index: 0 },
      { level: 2, text: 'Level 2', index: 1 },
      { level: 3, text: 'Level 3', index: 2 },
    ];

    const { container } = render(<OutlineSidebar headings={headings} />);

    const buttons = container.querySelectorAll('button');
    expect(buttons[0]).toHaveStyle({ paddingLeft: '12px' }); // level 1
    expect(buttons[1]).toHaveStyle({ paddingLeft: '24px' }); // level 2
    expect(buttons[2]).toHaveStyle({ paddingLeft: '36px' }); // level 3
  });
});
