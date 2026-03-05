import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { WorkspaceCard } from '@/components/WorkspaceCard';
import type { Workspace } from '@/types';

describe('WorkspaceCard', () => {
  const mockWorkspace: Workspace = {
    id: '1',
    type: 'file',
    path: '/path/to/file.md',
    displayName: 'file.md',
    lastAccessed: new Date('2024-01-01T12:00:00'),
  };

  const defaultProps = {
    workspace: mockWorkspace,
    onExpand: vi.fn(),
    onClose: vi.fn(),
    onForget: vi.fn(),
  };

  it('renders workspace information', () => {
    render(<WorkspaceCard {...defaultProps} />);

    expect(screen.getByText('file.md')).toBeInTheDocument();
    expect(screen.getByText('/path/to/file.md')).toBeInTheDocument();
  });

  it('calls onExpand when card is clicked', async () => {
    const user = userEvent.setup();
    const onExpand = vi.fn();

    render(
      <main>
        <WorkspaceCard {...defaultProps} onExpand={onExpand} />
      </main>
    );

    const card = screen.getByText('file.md').closest('div[class*="group"]');
    if (card) {
      await user.click(card);
      expect(onExpand).toHaveBeenCalledWith('1', expect.objectContaining({
        top: expect.any(Number),
        left: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      }));
    }
  });

  it('calls onClose directly when X button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onExpand = vi.fn();

    render(<WorkspaceCard {...defaultProps} onClose={onClose} onExpand={onExpand} />);

    const closeButton = screen.getByTitle('Fechar');
    await user.click(closeButton);

    expect(onClose).toHaveBeenCalledWith('1');
    expect(onExpand).not.toHaveBeenCalled();
  });

  it('calls onForget after confirmation for directory workspaces', async () => {
    const user = userEvent.setup();
    const onForget = vi.fn();
    const dirWorkspace: Workspace = {
      id: '2',
      type: 'directory',
      path: '/path/to/project',
      displayName: 'project',
      lastAccessed: new Date('2024-01-01T12:00:00'),
    };

    render(<WorkspaceCard {...defaultProps} workspace={dirWorkspace} onForget={onForget} />);

    const forgetButton = screen.getByTitle('Esquecer');
    await user.click(forgetButton);

    const confirmButton = await screen.findByRole('button', { name: 'Esquecer' });
    await user.click(confirmButton);

    expect(onForget).toHaveBeenCalledWith('2');
  });

  it('shows forget button for file workspaces', async () => {
    const user = userEvent.setup();
    const onForget = vi.fn();

    render(<WorkspaceCard {...defaultProps} onForget={onForget} />);

    const forgetButton = screen.getByTitle('Esquecer');
    await user.click(forgetButton);

    const confirmButton = await screen.findByRole('button', { name: 'Esquecer' });
    await user.click(confirmButton);

    expect(onForget).toHaveBeenCalledWith('1');
  });

  it('prevents card expansion when close button is clicked', async () => {
    const user = userEvent.setup();
    const onExpand = vi.fn();

    render(<WorkspaceCard {...defaultProps} onExpand={onExpand} />);

    const closeButton = screen.getByTitle('Fechar');
    await user.click(closeButton);

    expect(onExpand).not.toHaveBeenCalled();
  });
});
